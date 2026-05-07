import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import {
  type GameState,
  type Hex,
  type Unit,
  type Province,
  type ServerMessage,
  type GameRoom,
  ClientMessageType,
  ServerMessageType,
  GameStatus,
  TerrainType,
  UnitType,
  StructureType,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
} from '@conquest/shared';
import { config } from '../../config.js';
import { gameStore } from '../../store/gameStore.js';
import { startGame, getGameState } from '../../game/engine.js';
import { setupWebSocket } from '../handler.js';

// ── Helpers ──

function makeHex(q: number, r: number, owner: string | null = null, opts: Partial<Hex> = {}): Hex {
  return {
    coord: { q, r },
    terrain: TerrainType.GRASS,
    owner,
    unit: null,
    structure: null,
    hasTree: false,
    ...opts,
  };
}

function makeUnit(owner: string, q: number, r: number, type: UnitType = UnitType.PEASANT, id?: string): Unit {
  return {
    id: id ?? `unit-${owner}-${q}-${r}`,
    type,
    owner,
    hex: { q, r },
    hasMoved: false,
    strength: UNIT_STRENGTH[type],
    upkeep: UNIT_UPKEEP[type],
  };
}

function createTestRoom(gameId: string, playerIds: string[] = ['p1', 'p2']): GameRoom {
  const room: GameRoom = {
    id: gameId,
    name: 'Test Game',
    hostId: playerIds[0],
    settings: {
      mapWidth: 10,
      mapHeight: 10,
      maxPlayers: playerIds.length,
      turnTimeLimit: 0, // disable turn timer for tests
      startingGold: 20,
    },
    players: playerIds.map((id, i) => ({
      id,
      name: `Player ${i + 1}`,
      isReady: true,
      isAI: false,
    })),
    passwordHash: null,
    status: GameStatus.LOBBY,
    createdAt: Date.now(),
  };
  gameStore.createGame(room);
  return room;
}

function signToken(playerId: string): string {
  return jwt.sign({ playerId }, config.jwtSecret);
}

/** Connect a WebSocket client and collect all received messages. */
function connectClient(
  port: number,
  gameId: string,
  playerId: string,
): Promise<{ ws: WebSocket; messages: ServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const token = signToken(playerId);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?gameId=${gameId}&token=${token}`);
    const messages: ServerMessage[] = [];

    ws.on('message', (data) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });

    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

/** Wait until the messages array reaches the expected length (or timeout). */
function waitForMessages(messages: ServerMessage[], count: number, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (messages.length >= count) {
      resolve();
      return;
    }
    const deadline = setTimeout(() => reject(new Error(`Timed out waiting for ${count} messages, got ${messages.length}`)), timeoutMs);
    const interval = setInterval(() => {
      if (messages.length >= count) {
        clearInterval(interval);
        clearTimeout(deadline);
        resolve();
      }
    }, 20);
  });
}

function sendMessage(ws: WebSocket, message: unknown): void {
  ws.send(JSON.stringify(message));
}

// ── Tests ──

let testCounter = 0;

describe('WebSocket handler – mid-turn vs end-turn message routing', () => {
  let server: http.Server;
  let port: number;
  let client1: { ws: WebSocket; messages: ServerMessage[] };
  let client2: { ws: WebSocket; messages: ServerMessage[] };
  let gameId: string;

  beforeEach(async () => {
    gameId = `ws-test-game-${++testCounter}`;

    // Create HTTP server with WebSocket upgrade handling
    server = http.createServer();
    setupWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    // Set up game room and start the game
    createTestRoom(gameId, ['p1', 'p2']);
    startGame(gameId);

    // Connect both players
    [client1, client2] = await Promise.all([
      connectClient(port, gameId, 'p1'),
      connectClient(port, gameId, 'p2'),
    ]);

    // Wait for initial messages — may include PLAYER_RECONNECTED before GAME_STATE_FULL
    await Promise.all([
      waitForMessages(client1.messages, 1),
      waitForMessages(client2.messages, 1),
    ]);

    // Allow any additional initial messages to settle
    await new Promise((r) => setTimeout(r, 50));

    // Verify both received GAME_STATE_FULL (possibly after other messages)
    expect(client1.messages.some((m) => m.type === ServerMessageType.GAME_STATE_FULL)).toBe(true);
    expect(client2.messages.some((m) => m.type === ServerMessageType.GAME_STATE_FULL)).toBe(true);
    client1.messages.length = 0;
    client2.messages.length = 0;
  });

  afterEach(async () => {
    // Close WebSocket connections and wait for close events to fire
    const closePromises: Promise<void>[] = [];
    for (const client of [client1, client2]) {
      if (client?.ws.readyState === WebSocket.OPEN) {
        closePromises.push(
          new Promise<void>((resolve) => {
            client.ws.on('close', resolve);
            client.ws.close();
          }),
        );
      }
    }
    await Promise.all(closePromises);

    gameStore.deleteGame(gameId);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Mid-turn: only the acting player should receive state updates ──

  it('MOVE_UNIT sends state update only to the current player', async () => {
    const gameState = getGameState(gameId)!;
    // Find a unit owned by p1 (the current turn player)
    const unitHex = gameState.hexes.find((h) => h.unit?.owner === 'p1');
    expect(unitHex).toBeDefined();
    const p1Unit = unitHex!.unit!;

    // Find an adjacent hex that p1 can move to
    const adjCoords = [
      { q: unitHex!.coord.q + 1, r: unitHex!.coord.r },
      { q: unitHex!.coord.q - 1, r: unitHex!.coord.r },
      { q: unitHex!.coord.q, r: unitHex!.coord.r + 1 },
      { q: unitHex!.coord.q, r: unitHex!.coord.r - 1 },
      { q: unitHex!.coord.q + 1, r: unitHex!.coord.r - 1 },
      { q: unitHex!.coord.q - 1, r: unitHex!.coord.r + 1 },
    ];
    let targetHex = gameState.hexes.find(
      (h) =>
        h.owner === 'p1' &&
        !h.unit &&
        !h.structure &&
        h.terrain !== TerrainType.WATER &&
        adjCoords.some((a) => a.q === h.coord.q && a.r === h.coord.r),
    );
    if (!targetHex) {
      // Create an adjacent neutral hex if none exists
      const coord = adjCoords[0];
      targetHex = {
        coord,
        terrain: TerrainType.GRASS,
        owner: null,
        unit: null,
        structure: null,
        hasTree: false,
      };
      gameState.hexes.push(targetHex);
    }
    expect(targetHex).toBeDefined();

    sendMessage(client1.ws, {
      type: ClientMessageType.MOVE_UNIT,
      unitId: p1Unit!.id,
      from: unitHex!.coord,
      to: targetHex!.coord,
    });

    // Wait for p1 to receive the state delta
    await waitForMessages(client1.messages, 1);

    // Allow a short window for any erroneous message to arrive at p2
    await new Promise((r) => setTimeout(r, 100));

    expect(client1.messages.length).toBeGreaterThanOrEqual(1);
    const stateMsg = client1.messages.find((m) => m.type === ServerMessageType.GAME_STATE_DELTA);
    expect(stateMsg).toBeDefined();

    // Player 2 should NOT have received any state update
    const p2StateMessages = client2.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA || m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(p2StateMessages).toHaveLength(0);
  });

  it('BUY_UNIT sends state update only to the current player', async () => {
    const gameState = getGameState(gameId)!;

    // Give p1 enough gold
    const p1Province = gameState.provinces.find((p) => p.owner === 'p1');
    expect(p1Province).toBeDefined();
    p1Province!.gold = 100;

    // Find an owned hex without a unit or structure
    const emptyHex = gameState.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure && h.terrain !== TerrainType.WATER,
    );
    expect(emptyHex).toBeDefined();

    sendMessage(client1.ws, {
      type: ClientMessageType.BUY_UNIT,
      unitType: UnitType.PEASANT,
      hex: emptyHex!.coord,
    });

    await waitForMessages(client1.messages, 1);
    await new Promise((r) => setTimeout(r, 100));

    const p1StateMessages = client1.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA,
    );
    expect(p1StateMessages.length).toBeGreaterThanOrEqual(1);

    const p2StateMessages = client2.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA || m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(p2StateMessages).toHaveLength(0);
  });

  it('BUILD_STRUCTURE sends state update only to the current player', async () => {
    const gameState = getGameState(gameId)!;

    // Give p1 enough gold for a tower
    const p1Province = gameState.provinces.find((p) => p.owner === 'p1');
    expect(p1Province).toBeDefined();
    p1Province!.gold = 200;

    // Find a hex owned by p1 without a unit or structure
    const emptyHex = gameState.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure && h.terrain !== TerrainType.WATER,
    );
    expect(emptyHex).toBeDefined();

    sendMessage(client1.ws, {
      type: ClientMessageType.BUILD_STRUCTURE,
      structureType: StructureType.TOWER,
      hex: emptyHex!.coord,
    });

    await waitForMessages(client1.messages, 1);
    await new Promise((r) => setTimeout(r, 100));

    // p1 should get a state delta (or an error if structure type is invalid, but not broadcast)
    expect(client1.messages.length).toBeGreaterThanOrEqual(1);

    // p2 should NOT get state updates
    const p2StateMessages = client2.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA || m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(p2StateMessages).toHaveLength(0);
  });

  it('UNDO_TURN sends state update only to the current player', async () => {
    // First make a move so there's something to undo
    const gameState = getGameState(gameId)!;
    const p1Unit = gameState.hexes.find((h) => h.unit?.owner === 'p1')?.unit;
    const targetHex = gameState.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure && h.terrain !== TerrainType.WATER,
    );

    if (p1Unit && targetHex) {
      sendMessage(client1.ws, {
        type: ClientMessageType.MOVE_UNIT,
        unitId: p1Unit.id,
        from: p1Unit.hex,
        to: targetHex.coord,
      });
      await waitForMessages(client1.messages, 1);
    }

    // Clear messages
    client1.messages.length = 0;
    client2.messages.length = 0;

    // Send undo
    sendMessage(client1.ws, { type: ClientMessageType.UNDO_TURN });

    await waitForMessages(client1.messages, 1);
    await new Promise((r) => setTimeout(r, 100));

    expect(client1.messages.length).toBeGreaterThanOrEqual(1);
    const stateMsg = client1.messages.find(
      (m) => m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(stateMsg).toBeDefined();

    const p2StateMessages = client2.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA || m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(p2StateMessages).toHaveLength(0);
  });

  it('REDO_ACTION sends state update only to the current player', async () => {
    // Make a move, then undo, so there's something to redo
    const gameState = getGameState(gameId)!;
    const p1Unit = gameState.hexes.find((h) => h.unit?.owner === 'p1')?.unit;
    const targetHex = gameState.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure && h.terrain !== TerrainType.WATER,
    );

    if (p1Unit && targetHex) {
      sendMessage(client1.ws, {
        type: ClientMessageType.MOVE_UNIT,
        unitId: p1Unit.id,
        from: p1Unit.hex,
        to: targetHex.coord,
      });
      await waitForMessages(client1.messages, 1);

      sendMessage(client1.ws, { type: ClientMessageType.UNDO_TURN });
      await waitForMessages(client1.messages, 2);
    }

    client1.messages.length = 0;
    client2.messages.length = 0;

    sendMessage(client1.ws, { type: ClientMessageType.REDO_ACTION });

    await waitForMessages(client1.messages, 1);
    await new Promise((r) => setTimeout(r, 100));

    expect(client1.messages.length).toBeGreaterThanOrEqual(1);
    const stateMsg = client1.messages.find(
      (m) => m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(stateMsg).toBeDefined();

    const p2StateMessages = client2.messages.filter(
      (m) => m.type === ServerMessageType.GAME_STATE_DELTA || m.type === ServerMessageType.GAME_STATE_FULL,
    );
    expect(p2StateMessages).toHaveLength(0);
  });

  // ── End turn: ALL players should receive the update ──

  it('END_TURN broadcasts state update to ALL players', async () => {
    sendMessage(client1.ws, { type: ClientMessageType.END_TURN });

    // Both players should receive TURN_CHANGED + GAME_STATE_DELTA
    await Promise.all([
      waitForMessages(client1.messages, 2),
      waitForMessages(client2.messages, 2),
    ]);

    const p1TurnChanged = client1.messages.find((m) => m.type === ServerMessageType.TURN_CHANGED);
    const p1Delta = client1.messages.find((m) => m.type === ServerMessageType.GAME_STATE_DELTA);
    const p2TurnChanged = client2.messages.find((m) => m.type === ServerMessageType.TURN_CHANGED);
    const p2Delta = client2.messages.find((m) => m.type === ServerMessageType.GAME_STATE_DELTA);

    expect(p1TurnChanged).toBeDefined();
    expect(p1Delta).toBeDefined();
    expect(p2TurnChanged).toBeDefined();
    expect(p2Delta).toBeDefined();
  });
});
