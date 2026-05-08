import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import {
  type GameState,
  type ServerMessage,
  type ClientMessage,
  ClientMessageType,
  ServerMessageType,
  GameStatus,
} from '@conquest/shared';
import type { AuthPayload } from '../routes/middleware/auth.js';
import { config } from '../config.js';
import { sessionStore } from '../store/sessionStore.js';
import { gameStore } from '../store/gameStore.js';
import {
  getGameState,
  startGame,
  moveUnit,
  buyUnit,
  buildStructure,
  upgradeStructure,
  retireUnit,
  endTurn,
  surrender,
  undoAction,
  redoAction,
  findActiveGameByPlayerId,
  cleanupGame,
} from '../game/engine.js';
import { scheduleAITurnIfNeeded } from '../ai/aiEngine.js';

// ── Types ──

interface ConnectedClient {
  ws: WebSocket;
  gameId: string;
  playerId: string;
}

// ── State ──

const clients = new Map<string, ConnectedClient>();
const gracePeriodTimers = new Map<string, ReturnType<typeof setTimeout>>();
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

const GRACE_PERIOD_MS = 60_000;

// ── Sanitization ──

function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Setup ──

export function setupWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const gameId = url.searchParams.get('gameId');
    const token = url.searchParams.get('token');

    if (!gameId || !token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const playerId = payload.playerId;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, playerId, gameId);
    });
  });

  wss.on('connection', (ws: WebSocket, playerId: string, gameId: string) => {
    handleConnection(ws, playerId, gameId);
  });
}

// ── Connection Handling ──

function handleConnection(ws: WebSocket, playerId: string, gameId: string): void {
  // Cancel any pending grace period timer
  const existingTimer = gracePeriodTimers.get(playerId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    gracePeriodTimers.delete(playerId);
  }

  // Auto-surrender from any previous game when connecting to a different one
  const previousGame = findActiveGameByPlayerId(playerId);
  if (previousGame && previousGame.gameId !== gameId) {
    const prevState = getGameState(previousGame.gameId);
    if (prevState) {
      try {
        surrender(prevState, playerId);
        broadcastToGame(previousGame.gameId, {
          type: ServerMessageType.GAME_STATE_DELTA,
          delta: {
            players: prevState.players,
            hexes: prevState.hexes,
            provinces: prevState.provinces,
            currentTurnPlayerId: prevState.currentTurnPlayerId,
            status: prevState.status,
            winnerId: prevState.winnerId,
          },
        });
        checkAndBroadcastGameOver(prevState, previousGame.gameId);
        if (prevState.status === GameStatus.IN_PROGRESS) {
          startTurnTimer(prevState, previousGame.gameId);
          scheduleAITurnIfNeeded(prevState);
        }
      } catch {
        // Player may already be eliminated
      }
    }
  }

  // Also leave any lobby room the player is in (if connecting to a different game)
  const prevRoom = gameStore.findGameByPlayerId(playerId);
  if (prevRoom && prevRoom.id !== gameId && prevRoom.status === GameStatus.LOBBY) {
    const remaining = prevRoom.players.filter((p) => p.id !== playerId);
    if (remaining.length === 0 || prevRoom.hostId === playerId) {
      gameStore.deleteGame(prevRoom.id);
      broadcastToGame(prevRoom.id, {
        type: ServerMessageType.LOBBY_UPDATE,
        room: { ...prevRoom, passwordHash: null, players: remaining },
        deleted: true,
      });
    } else {
      gameStore.updateGame(prevRoom.id, { players: remaining });
      const updated = gameStore.getGame(prevRoom.id);
      if (updated) {
        broadcastToGame(prevRoom.id, {
          type: ServerMessageType.LOBBY_UPDATE,
          room: { ...updated, passwordHash: null },
        });
      }
    }
  }

  clients.set(playerId, { ws, gameId, playerId });

  const gameState = getGameState(gameId);
  if (gameState) {
    const player = gameState.players.find((p) => p.id === playerId);
    const wasDisconnected = player && !player.isConnected;

    if (player) {
      player.isConnected = true;
    }

    if (wasDisconnected) {
      broadcastToGame(gameId, {
        type: ServerMessageType.PLAYER_RECONNECTED,
        playerId,
      });

      // Restart turn timer if it's the reconnected player's turn
      if (gameState.status === GameStatus.IN_PROGRESS && gameState.currentTurnPlayerId === playerId) {
        startTurnTimer(gameState, gameId);
      }
    }

    sendToPlayer(playerId, {
      type: ServerMessageType.GAME_STATE_FULL,
      state: gameState,
    });
  } else {
    // Lobby phase — send current room state
    const room = gameStore.getGame(gameId);
    if (room) {
      sendToPlayer(playerId, {
        type: ServerMessageType.LOBBY_UPDATE,
        room: { ...room, passwordHash: null },
      });
    }
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      handleMessage(playerId, gameId, message);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Invalid message';
      sendToPlayer(playerId, {
        type: ServerMessageType.ERROR,
        code: 'INVALID_MESSAGE',
        message: errorMsg,
      });
    }
  });

  ws.on('close', () => {
    // Only handle disconnect if this ws is still the active connection
    const client = clients.get(playerId);
    if (!client || client.ws !== ws) return;
    handleDisconnect(playerId, gameId);
  });

  ws.on('error', () => {
    const client = clients.get(playerId);
    if (!client || client.ws !== ws) return;
    handleDisconnect(playerId, gameId);
  });
}

function handleDisconnect(playerId: string, gameId: string): void {
  clients.delete(playerId);

  const gameState = getGameState(gameId);
  if (!gameState) {
    // Lobby phase — temporary disconnection, do NOT delete the room.
    // Room deletion only happens via the explicit HTTP leave endpoint.
    return;
  }

  const player = gameState.players.find((p) => p.id === playerId);
  if (!player || player.isEliminated) return;

  player.isConnected = false;

  broadcastToGame(gameId, {
    type: ServerMessageType.PLAYER_DISCONNECTED,
    playerId,
  });

  // If it's the disconnected player's turn, pause/extend the turn timer
  if (gameState.currentTurnPlayerId === playerId) {
    clearTurnTimer(gameId);
  }

  // Start grace period — auto-surrender if player doesn't reconnect
  const timer = setTimeout(() => {
    gracePeriodTimers.delete(playerId);
    const currentState = getGameState(gameId);
    if (!currentState) return;

    const p = currentState.players.find((pl) => pl.id === playerId);
    if (p && !p.isConnected && !p.isEliminated) {
      try {
        surrender(currentState, playerId);
        broadcastToGame(gameId, {
          type: ServerMessageType.GAME_STATE_DELTA,
          delta: {
            players: currentState.players,
            hexes: currentState.hexes,
            provinces: currentState.provinces,
            currentTurnPlayerId: currentState.currentTurnPlayerId,
            status: currentState.status,
            winnerId: currentState.winnerId,
          },
        });
        checkAndBroadcastGameOver(currentState, gameId);
        // Restart turn timer for the new current player
        if (currentState.status === GameStatus.IN_PROGRESS) {
          startTurnTimer(currentState, gameId);
          scheduleAITurnIfNeeded(currentState);
        }
      } catch {
        // Player may already be eliminated
      }
    }
  }, GRACE_PERIOD_MS);

  gracePeriodTimers.set(playerId, timer);
}

// ── Message Routing ──

function handleMessage(playerId: string, gameId: string, message: ClientMessage): void {
  try {
    switch (message.type) {
      case ClientMessageType.READY:
        handleReady(playerId, gameId);
        break;
      case ClientMessageType.MOVE_UNIT:
        handleMoveUnit(playerId, gameId, message.unitId, message.from, message.to);
        break;
      case ClientMessageType.BUY_UNIT:
        handleBuyUnit(playerId, gameId, message.unitType, message.hex);
        break;
      case ClientMessageType.BUILD_STRUCTURE:
        handleBuildStructure(playerId, gameId, message.structureType, message.hex);
        break;
      case ClientMessageType.UPGRADE_STRUCTURE:
        handleUpgradeStructure(playerId, gameId, message.structureType, message.hex);
        break;
      case ClientMessageType.RETIRE_UNIT:
        handleRetireUnit(playerId, gameId, message.unitId);
        break;
      case ClientMessageType.END_TURN:
        handleEndTurn(playerId, gameId);
        break;
      case ClientMessageType.UNDO_TURN:
        handleUndoTurn(playerId, gameId);
        break;
      case ClientMessageType.REDO_ACTION:
        handleRedoAction(playerId, gameId);
        break;
      case ClientMessageType.CHAT_MESSAGE:
        handleChatMessage(playerId, gameId, message.content);
        break;
      case ClientMessageType.SURRENDER:
        handleSurrender(playerId, gameId);
        break;
      case ClientMessageType.REQUEST_STATE:
        handleRequestState(playerId, gameId);
        break;
      default:
        sendToPlayer(playerId, {
          type: ServerMessageType.ERROR,
          code: 'UNKNOWN_MESSAGE',
          message: 'Unknown message type',
        });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Internal error';
    sendToPlayer(playerId, {
      type: ServerMessageType.ERROR,
      code: 'HANDLER_ERROR',
      message: errorMsg,
    });
  }
}

// ── Individual Handlers ──

function handleReady(playerId: string, gameId: string): void {
  const room = gameStore.getGame(gameId);
  if (!room) throw new Error('Game room not found');

  const roomPlayer = room.players.find((p) => p.id === playerId);
  if (!roomPlayer) throw new Error('Player not in this game');

  roomPlayer.isReady = true;
  gameStore.updateGame(gameId, { players: room.players });

  broadcastToGame(gameId, {
    type: ServerMessageType.LOBBY_UPDATE,
    room,
  });

  // Auto-start if all players are ready and there are enough players
  const allReady = room.players.every((p) => p.isReady);
  if (allReady && room.players.length >= 2 && room.status === GameStatus.LOBBY) {
    const gameState = startGame(gameId);
    broadcastToGame(gameId, {
      type: ServerMessageType.GAME_STARTED,
      state: gameState,
    });
    startTurnTimer(gameState, gameId);
    scheduleAITurnIfNeeded(gameState);
  }
}

function handleMoveUnit(
  playerId: string,
  gameId: string,
  unitId: string,
  from: import('@conquest/shared').HexCoord,
  to: import('@conquest/shared').HexCoord,
): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  moveUnit(gameState, playerId, unitId, to);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
      status: gameState.status,
      winnerId: gameState.winnerId,
    },
  });
}

function handleBuyUnit(
  playerId: string,
  gameId: string,
  unitType: import('@conquest/shared').UnitType,
  hex: import('@conquest/shared').HexCoord,
): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  buyUnit(gameState, playerId, unitType, hex);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
    },
  });
}

function handleBuildStructure(
  playerId: string,
  gameId: string,
  structureType: import('@conquest/shared').StructureType,
  hex: import('@conquest/shared').HexCoord,
): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  buildStructure(gameState, playerId, structureType, hex);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
    },
  });
}

function handleUpgradeStructure(
  playerId: string,
  gameId: string,
  structureType: import('@conquest/shared').StructureType,
  hex: import('@conquest/shared').HexCoord,
): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  upgradeStructure(gameState, playerId, structureType, hex);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
    },
  });
}

function handleRetireUnit(
  playerId: string,
  gameId: string,
  unitId: string,
): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  retireUnit(gameState, playerId, unitId);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
    },
  });
}

function handleEndTurn(playerId: string, gameId: string): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  clearTurnTimer(gameId);
  endTurn(gameState);

  broadcastToGame(gameId, {
    type: ServerMessageType.TURN_CHANGED,
    playerId: gameState.currentTurnPlayerId!,
    turnNumber: gameState.turnNumber,
  });

  broadcastToGame(gameId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      players: gameState.players,
      currentTurnPlayerId: gameState.currentTurnPlayerId,
      turnNumber: gameState.turnNumber,
      turnStartedAt: gameState.turnStartedAt,
      status: gameState.status,
      winnerId: gameState.winnerId,
    },
  });

  checkAndBroadcastGameOver(gameState, gameId);

  if (gameState.status === GameStatus.IN_PROGRESS) {
    startTurnTimer(gameState, gameId);
    scheduleAITurnIfNeeded(gameState);
  }
}

function handleUndoTurn(playerId: string, gameId: string): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  const restored = undoAction(gameId, playerId);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_FULL,
    state: restored,
  });
}

function handleRedoAction(playerId: string, gameId: string): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  const restored = redoAction(gameId, playerId);

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_FULL,
    state: restored,
  });
}

function handleChatMessage(playerId: string, gameId: string, content: string): void {
  const session = sessionStore.getSession(playerId);
  const playerName = session?.name ?? 'Unknown';

  const sanitized = sanitizeHtml(content).slice(0, 500);

  broadcastToGame(gameId, {
    type: ServerMessageType.CHAT_BROADCAST,
    playerId,
    playerName,
    content: sanitized,
    timestamp: Date.now(),
  });
}

function handleSurrender(playerId: string, gameId: string): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');
  requireInProgress(gameState);

  const wasTurn = gameState.currentTurnPlayerId === playerId;
  if (wasTurn) {
    clearTurnTimer(gameId);
  }

  surrender(gameState, playerId);

  broadcastToGame(gameId, {
    type: ServerMessageType.GAME_STATE_DELTA,
    delta: {
      players: gameState.players,
      hexes: gameState.hexes,
      provinces: gameState.provinces,
      currentTurnPlayerId: gameState.currentTurnPlayerId,
      status: gameState.status,
      winnerId: gameState.winnerId,
    },
  });

  checkAndBroadcastGameOver(gameState, gameId);

  if (gameState.status === GameStatus.IN_PROGRESS && wasTurn) {
    startTurnTimer(gameState, gameId);
    scheduleAITurnIfNeeded(gameState);
  }
}

function handleRequestState(playerId: string, gameId: string): void {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error('Game not found');

  sendToPlayer(playerId, {
    type: ServerMessageType.GAME_STATE_FULL,
    state: gameState,
  });
}

// ── Turn Timer ──

export function startTurnTimer(gameState: GameState, gameId: string): void {
  clearTurnTimer(gameId);

  const timeLimit = gameState.settings.turnTimeLimit;
  if (timeLimit <= 0) return;

  const timer = setTimeout(() => {
    turnTimers.delete(gameId);
    const currentState = getGameState(gameId);
    if (!currentState || currentState.status !== GameStatus.IN_PROGRESS) return;

    try {
      endTurn(currentState);

      broadcastToGame(gameId, {
        type: ServerMessageType.TURN_CHANGED,
        playerId: currentState.currentTurnPlayerId!,
        turnNumber: currentState.turnNumber,
      });

      broadcastToGame(gameId, {
        type: ServerMessageType.GAME_STATE_DELTA,
        delta: {
          hexes: currentState.hexes,
          provinces: currentState.provinces,
          players: currentState.players,
          currentTurnPlayerId: currentState.currentTurnPlayerId,
          turnNumber: currentState.turnNumber,
          turnStartedAt: currentState.turnStartedAt,
          status: currentState.status,
          winnerId: currentState.winnerId,
        },
      });

      checkAndBroadcastGameOver(currentState, gameId);

      if (currentState.status === GameStatus.IN_PROGRESS) {
        startTurnTimer(currentState, gameId);
        scheduleAITurnIfNeeded(currentState);
      }
    } catch {
      // Turn end failed — game may have ended
    }
  }, timeLimit);

  turnTimers.set(gameId, timer);
}

function clearTurnTimer(gameId: string): void {
  const timer = turnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(gameId);
  }
}

// ── Broadcasting ──

export function broadcastToGame(gameId: string, message: ServerMessage): void {
  const json = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.gameId === gameId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(json);
    }
  }
}

export function sendToPlayer(playerId: string, message: ServerMessage): void {
  const client = clients.get(playerId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

// ── Helpers ──

function requireInProgress(gameState: GameState): void {
  if (gameState.status !== GameStatus.IN_PROGRESS) {
    throw new Error('Game is not in progress');
  }
}

function checkAndBroadcastGameOver(gameState: GameState, gameId: string): void {
  if (gameState.status === GameStatus.FINISHED) {
    clearTurnTimer(gameId);
    if (gameState.winnerId) {
      const winner = gameState.players.find((p) => p.id === gameState.winnerId);
      broadcastToGame(gameId, {
        type: ServerMessageType.GAME_OVER,
        winnerId: gameState.winnerId,
        reason: `${winner?.name ?? 'Unknown'} has conquered all opponents!`,
      });
    } else {
      broadcastToGame(gameId, {
        type: ServerMessageType.GAME_OVER,
        winnerId: '',
        reason: 'All human players have been eliminated. Game over!',
      });
    }
    // Clean up game state after a short delay (let clients receive the game over message)
    setTimeout(() => {
      cleanupGame(gameId);
    }, 5000);
  }
}
