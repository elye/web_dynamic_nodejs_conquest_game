import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startGame,
  getGameState,
  moveUnit,
  buyUnit,
  buildStructure,
  endTurn,
  surrender,
  undoAction,
  redoAction,
} from '../engine.js';
import { gameStore } from '../../store/gameStore.js';
import type { GameState, Hex, Unit, Province, GameRoom } from '@conquest/shared';
import {
  TerrainType,
  UnitType,
  StructureType,
  GameStatus,
  UNIT_COST,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
  STRUCTURE_COST,
  STRUCTURE_STRENGTH,
  DEFAULT_GAME_SETTINGS,
} from '@conquest/shared';

// ── Test helpers ──

function makeHex(
  q: number,
  r: number,
  owner: string | null = null,
  opts: Partial<Hex> = {},
): Hex {
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

function makeUnit(
  owner: string,
  q: number,
  r: number,
  type: UnitType = UnitType.PEASANT,
  id?: string,
): Unit {
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
      turnTimeLimit: 60000,
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

/**
 * Create a minimal GameState directly (bypassing startGame) for isolated unit testing.
 * Uses a small linear grid: (0,0), (1,0), (2,0), (0,1), (1,1), (2,1)
 */
function createTestGameState(gameId: string = 'test-game'): GameState {
  const p1Unit = makeUnit('p1', 0, 0, UnitType.PEASANT, 'u1');
  const p2Unit = makeUnit('p2', 2, 0, UnitType.PEASANT, 'u2');

  const hexes: Hex[] = [
    makeHex(0, 0, 'p1', { unit: p1Unit }),
    makeHex(1, 0, 'p1'),
    makeHex(2, 0, 'p2', { unit: p2Unit }),
    makeHex(0, 1, null),
    makeHex(1, 1, null),
    makeHex(2, 1, 'p2'),
  ];

  const province1: Province = {
    id: 'prov-p1',
    hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
    owner: 'p1',
    gold: 50,
    income: 2,
    upkeep: UNIT_UPKEEP[UnitType.PEASANT],
  };

  const province2: Province = {
    id: 'prov-p2',
    hexes: [{ q: 2, r: 0 }, { q: 2, r: 1 }],
    owner: 'p2',
    gold: 50,
    income: 2,
    upkeep: UNIT_UPKEEP[UnitType.PEASANT],
  };

  const gameState: GameState = {
    id: gameId,
    status: GameStatus.IN_PROGRESS,
    settings: {
      mapWidth: 10,
      mapHeight: 10,
      maxPlayers: 2,
      turnTimeLimit: 60000,
      startingGold: 20,
    },
    players: [
      {
        id: 'p1',
        name: 'Player 1',
        color: '#e74c3c',
        isAI: false,
        isConnected: true,
        isEliminated: false,
        gold: 20,
        provinces: ['prov-p1'],
        ready: true,
      },
      {
        id: 'p2',
        name: 'Player 2',
        color: '#3498db',
        isAI: false,
        isConnected: true,
        isEliminated: false,
        gold: 20,
        provinces: ['prov-p2'],
        ready: true,
      },
    ],
    hexes,
    provinces: [province1, province2],
    currentTurnPlayerId: 'p1',
    turnNumber: 1,
    turnStartedAt: Date.now(),
    history: [],
    winnerId: null,
    createdAt: Date.now(),
  };

  return gameState;
}

/**
 * Helper: register a GameState in the engine's internal map so undo/redo works.
 * We do this by calling startGame with a pre-configured room, then replacing
 * the state. But it's simpler to just use the module's exported functions
 * which accept gameState directly.
 */

// ── startGame ──

describe('startGame', () => {
  beforeEach(() => {
    // Clean up game store between tests
    gameStore.deleteGame('game-start-test');
  });

  it('creates game state with correct players', () => {
    createTestRoom('game-start-test', ['p1', 'p2']);
    const state = startGame('game-start-test');

    expect(state.players).toHaveLength(2);
    expect(state.players[0].id).toBe('p1');
    expect(state.players[1].id).toBe('p2');
    expect(state.status).toBe(GameStatus.IN_PROGRESS);
  });

  it('initializes provinces with starting gold', () => {
    createTestRoom('game-start-test', ['p1', 'p2']);
    const state = startGame('game-start-test');

    expect(state.provinces.length).toBeGreaterThanOrEqual(2);
    for (const prov of state.provinces) {
      expect(prov.gold).toBe(20); // DEFAULT startingGold
    }
  });

  it('sets first player as current turn', () => {
    createTestRoom('game-start-test', ['p1', 'p2']);
    const state = startGame('game-start-test');

    expect(state.currentTurnPlayerId).toBe('p1');
  });

  it('throws if game room not found', () => {
    expect(() => startGame('nonexistent')).toThrow('Game room nonexistent not found');
  });

  it('throws if fewer than 2 players', () => {
    createTestRoom('game-start-test', ['p1']);
    expect(() => startGame('game-start-test')).toThrow('At least 2 players');
  });
});

// ── moveUnit ──

describe('moveUnit', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('move-test');
    // Register in engine internals via startGame workaround:
    // Instead, we inject directly since moveUnit accepts gameState param
  });

  it('can move unit to adjacent empty hex', () => {
    // p1 unit at (0,0), move to (0,1) which is neutral and adjacent
    const result = moveUnit(gs, 'p1', 'u1', { q: 0, r: 1 });
    const sourceHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0);
    const targetHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1);
    expect(sourceHex!.unit).toBeNull();
    expect(targetHex!.unit).not.toBeNull();
    expect(targetHex!.unit!.id).toBe('u1');
    expect(targetHex!.unit!.hasMoved).toBe(true);
  });

  it('captures neutral territory', () => {
    const result = moveUnit(gs, 'p1', 'u1', { q: 0, r: 1 });
    const targetHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1);
    expect(targetHex!.owner).toBe('p1');
  });

  it("can't move to non-adjacent hex", () => {
    // (0,0) to (2,1) is not adjacent
    expect(() => moveUnit(gs, 'p1', 'u1', { q: 2, r: 1 })).toThrow('not adjacent');
  });

  it("can't move unit that already moved", () => {
    // Move once
    moveUnit(gs, 'p1', 'u1', { q: 0, r: 1 });
    // Try to move again
    expect(() => moveUnit(gs, 'p1', 'u1', { q: 1, r: 1 })).toThrow('already moved');
  });

  it("can't move other player's unit", () => {
    expect(() => moveUnit(gs, 'p1', 'u2', { q: 1, r: 0 })).toThrow(
      'does not belong to you',
    );
  });

  it("can't move when it's not your turn", () => {
    expect(() => moveUnit(gs, 'p2', 'u2', { q: 1, r: 0 })).toThrow('Not your turn');
  });

  it('clears trees on move', () => {
    // Set tree on target hex
    const targetHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1)!;
    targetHex.hasTree = true;
    targetHex.terrain = TerrainType.FOREST;

    const result = moveUnit(gs, 'p1', 'u1', { q: 0, r: 1 });
    const movedToHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1);
    expect(movedToHex!.hasTree).toBe(false);
    expect(movedToHex!.terrain).toBe(TerrainType.GRASS);
  });

  it('captures enemy territory when stronger', () => {
    // Give p1 a baron (str 3) to attack p2 peasant (str 1)
    const srcHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0)!;
    srcHex.unit = makeUnit('p1', 0, 0, UnitType.BARON, 'u1-baron');

    // Move p1 unit to (1,0) first (own territory), then we need adjacency to p2
    // Actually let's set up a direct attack scenario:
    // Put p1 baron at (1,0) adjacent to p2's (2,0)
    srcHex.unit = null;
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    const baron = makeUnit('p1', 1, 0, UnitType.BARON, 'u1-baron');
    midHex.unit = baron;

    const result = moveUnit(gs, 'p1', 'u1-baron', { q: 2, r: 0 });
    const capturedHex = result.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0);
    expect(capturedHex!.owner).toBe('p1');
    expect(capturedHex!.unit!.id).toBe('u1-baron');
  });

  it("can't capture when too weak", () => {
    // p1 peasant (str 1) vs p2 peasant (str 1) — equal = fail
    const srcHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0)!;
    srcHex.unit = null;
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.unit = makeUnit('p1', 1, 0, UnitType.PEASANT, 'u1-weak');

    const result = moveUnit(gs, 'p1', 'u1-weak', { q: 2, r: 0 });
    // Attack fails — unit stays at source but is marked as moved
    const targetHex = result.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0);
    expect(targetHex!.owner).toBe('p2');
    expect(targetHex!.unit!.owner).toBe('p2');
    // Unit should still be at source and marked as moved
    const sourceHex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(sourceHex!.unit!.hasMoved).toBe(true);
  });

  it('merges friendly units (Peasant+Peasant=Spearman)', () => {
    // Place a second peasant on (1,0)
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.unit = makeUnit('p1', 1, 0, UnitType.PEASANT, 'u1-target');

    const result = moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });
    const mergedHex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(mergedHex!.unit!.type).toBe(UnitType.SPEARMAN);
    expect(mergedHex!.unit!.strength).toBe(UNIT_STRENGTH[UnitType.SPEARMAN]);

    // Source should be empty
    const sourceHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0);
    expect(sourceHex!.unit).toBeNull();
  });

  it('merges friendly units (Spearman+Peasant=Baron)', () => {
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.unit = makeUnit('p1', 1, 0, UnitType.SPEARMAN, 'u1-spear');

    const result = moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });
    const mergedHex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(mergedHex!.unit!.type).toBe(UnitType.BARON);
  });

  it('clears death markers on move', () => {
    const targetHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1)!;
    targetHex.deathMarker = 'starvation';

    const result = moveUnit(gs, 'p1', 'u1', { q: 0, r: 1 });
    const movedToHex = result.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1);
    expect(movedToHex!.deathMarker).toBeUndefined();
  });
});

// ── buyUnit ──

describe('buyUnit', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('buy-test');
  });

  it('can buy unit on own empty hex', () => {
    const result = buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(hex!.unit).not.toBeNull();
    expect(hex!.unit!.type).toBe(UnitType.PEASANT);
    expect(hex!.unit!.owner).toBe('p1');
    expect(hex!.unit!.hasMoved).toBe(true);
  });

  it('deducts gold from province', () => {
    const goldBefore = gs.provinces.find((p) => p.owner === 'p1')!.gold;
    buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 });
    // After recalculateAllProvinces, gold should be preserved minus cost
    const totalGold = gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((s, p) => s + p.gold, 0);
    expect(totalGold).toBe(goldBefore - UNIT_COST[UnitType.PEASANT]);
  });

  it("can't buy if not enough gold", () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 1;
    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 })).toThrow(
      'Insufficient gold',
    );
  });

  it("can't buy on hex with structure", () => {
    const hex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    hex.structure = {
      id: 'struct-1',
      type: StructureType.TOWER,
      owner: 'p1',
      hex: { q: 1, r: 0 },
      strength: STRUCTURE_STRENGTH[StructureType.TOWER],
    };
    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 })).toThrow(
      'already has a structure',
    );
  });

  it("can't buy when it's not your turn", () => {
    expect(() => buyUnit(gs, 'p2', UnitType.PEASANT, { q: 2, r: 1 })).toThrow(
      'Not your turn',
    );
  });

  it("can't buy on enemy hex", () => {
    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: 2, r: 0 })).toThrow(
      'not owned by you',
    );
  });

  it('removes trees when placing unit', () => {
    const hex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    hex.hasTree = true;
    hex.terrain = TerrainType.FOREST;

    const result = buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 });
    const placedHex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(placedHex!.hasTree).toBe(false);
  });

  it('merges with existing unit on hex', () => {
    // Place a peasant first, then buy another peasant on same hex
    const hex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    hex.unit = makeUnit('p1', 1, 0, UnitType.PEASANT, 'existing-unit');

    const result = buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 });
    const mergedHex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(mergedHex!.unit!.type).toBe(UnitType.SPEARMAN);
  });
});

// ── buildStructure ──

describe('buildStructure', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('build-test');
  });

  it('can build tower on own empty hex', () => {
    const result = buildStructure(gs, 'p1', StructureType.TOWER, { q: 1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(hex!.structure).not.toBeNull();
    expect(hex!.structure!.type).toBe(StructureType.TOWER);
    expect(hex!.structure!.owner).toBe('p1');
  });

  it('can build strong tower', () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 100;
    const result = buildStructure(gs, 'p1', StructureType.STRONG_TOWER, { q: 1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(hex!.structure!.type).toBe(StructureType.STRONG_TOWER);
    expect(hex!.structure!.strength).toBe(STRUCTURE_STRENGTH[StructureType.STRONG_TOWER]);
  });

  it('deducts gold from province', () => {
    const goldBefore = gs.provinces.find((p) => p.owner === 'p1')!.gold;
    buildStructure(gs, 'p1', StructureType.TOWER, { q: 1, r: 0 });
    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    expect(prov.gold).toBe(goldBefore - STRUCTURE_COST[StructureType.TOWER]);
  });

  it("can't build if not enough gold", () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 1;
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: 1, r: 0 }),
    ).toThrow('Insufficient gold');
  });

  it("can't build on hex with unit", () => {
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: 0, r: 0 }),
    ).toThrow('already has a unit');
  });

  it("can't build on hex with existing structure", () => {
    buildStructure(gs, 'p1', StructureType.TOWER, { q: 1, r: 0 });
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 50;
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: 1, r: 0 }),
    ).toThrow('already has a structure');
  });

  it("can't build when it's not your turn", () => {
    expect(() =>
      buildStructure(gs, 'p2', StructureType.TOWER, { q: 2, r: 1 }),
    ).toThrow('Not your turn');
  });

  it("can't build on enemy hex", () => {
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: 2, r: 0 }),
    ).toThrow('not owned by you');
  });
});

// ── endTurn ──

describe('endTurn', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('endturn-test');
  });

  it('advances to next player', () => {
    expect(gs.currentTurnPlayerId).toBe('p1');
    const result = endTurn(gs);
    expect(result.currentTurnPlayerId).toBe('p2');
  });

  it('processes income (1 gold per non-tree hex)', () => {
    const provBefore = gs.provinces.find((p) => p.owner === 'p1')!;
    const goldBefore = provBefore.gold;
    const income = provBefore.income;
    const upkeep = provBefore.upkeep;

    endTurn(gs);

    // After endTurn, provinces get recalculated. Check total gold for p1.
    const p1Provinces = gs.provinces.filter((p) => p.owner === 'p1');
    const totalGold = p1Provinces.reduce((s, p) => s + p.gold, 0);
    // gold = goldBefore + income - upkeep (if non-negative)
    const expected = goldBefore + income - upkeep;
    if (expected >= 0) {
      expect(totalGold).toBe(expected);
    }
  });

  it('kills units when gold goes negative (starvation)', () => {
    // Set province gold very low so income - upkeep goes negative
    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 0;
    prov.income = 0; // force no income
    prov.upkeep = 10; // high upkeep

    endTurn(gs);

    // Unit at (0,0) should be dead
    const hex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0);
    expect(hex!.unit).toBeNull();
  });

  it('sets death markers on starvation', () => {
    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 0;
    prov.income = 0;
    prov.upkeep = 10;

    endTurn(gs);

    const hex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0);
    expect(hex!.deathMarker).toBe('starvation');
  });

  it('clears old death markers at start of endTurn', () => {
    // Set a death marker on a hex
    const hex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    hex.deathMarker = 'starvation';

    // Ensure province has enough gold to avoid new starvation
    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 100;

    endTurn(gs);

    // Old death marker should be cleared
    const hexAfter = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(hexAfter!.deathMarker).toBeUndefined();
  });

  it("resets hasMoved for new player's units", () => {
    // Mark p2's unit as moved
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit!.hasMoved = true;

    // End p1's turn
    endTurn(gs);

    // p2 is now current player, unit should be reset
    expect(p2UnitHex.unit!.hasMoved).toBe(false);
  });

  it('detects win condition (player elimination via no territory)', () => {
    // Eliminate p2 by removing all their hexes
    for (const hex of gs.hexes) {
      if (hex.owner === 'p2') {
        hex.owner = null;
        hex.unit = null;
        hex.structure = null;
      }
    }
    gs.players[1].isEliminated = true;

    endTurn(gs);

    expect(gs.status).toBe(GameStatus.FINISHED);
    expect(gs.winnerId).toBe('p1');
  });

  it('wraps around to first player after last player', () => {
    gs.currentTurnPlayerId = 'p2';
    const result = endTurn(gs);
    expect(result.currentTurnPlayerId).toBe('p1');
  });
});

// ── surrender ──

describe('surrender', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('surrender-test');
  });

  it('eliminates player', () => {
    surrender(gs, 'p2');
    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(true);
  });

  it("clears player's territories", () => {
    surrender(gs, 'p2');
    const p2Hexes = gs.hexes.filter((h) => h.owner === 'p2');
    expect(p2Hexes).toHaveLength(0);
  });

  it("removes player's units and structures", () => {
    surrender(gs, 'p2');
    const p2Units = gs.hexes.filter((h) => h.unit?.owner === 'p2');
    expect(p2Units).toHaveLength(0);
  });

  it('advances turn if surrendering player is current', () => {
    gs.currentTurnPlayerId = 'p2';
    surrender(gs, 'p2');
    expect(gs.currentTurnPlayerId).toBe('p1');
  });

  it('triggers win condition if only one player left', () => {
    surrender(gs, 'p2');
    expect(gs.status).toBe(GameStatus.FINISHED);
    expect(gs.winnerId).toBe('p1');
  });

  it('throws if player already eliminated', () => {
    gs.players.find((p) => p.id === 'p2')!.isEliminated = true;
    expect(() => surrender(gs, 'p2')).toThrow('already eliminated');
  });

  it('throws if player not found', () => {
    expect(() => surrender(gs, 'p99')).toThrow('Player not found');
  });
});

// ── undoAction / redoAction ──

describe('undoAction / redoAction', () => {
  let gs: GameState;
  const gameId = 'undo-redo-test';

  beforeEach(() => {
    // We need to use startGame to register in the engine's internal maps
    gameStore.deleteGame(gameId);
    createTestRoom(gameId, ['p1', 'p2']);
    gs = startGame(gameId);
  });

  it('undo restores previous state after move', () => {
    const unitHex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!unitHex) throw new Error('No p1 unit found');
    const unitId = unitHex.unit!.id;

    // Find an adjacent target
    const neighbors = [
      { q: unitHex.coord.q + 1, r: unitHex.coord.r },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r },
      { q: unitHex.coord.q, r: unitHex.coord.r + 1 },
      { q: unitHex.coord.q, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q + 1, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r + 1 },
    ];

    // Find a valid adjacent hex (owned by p1 or neutral, not water)
    let targetCoord = null;
    for (const nc of neighbors) {
      const hex = gs.hexes.find((h) => h.coord.q === nc.q && h.coord.r === nc.r);
      if (hex && hex.terrain !== TerrainType.WATER && (hex.owner === 'p1' || hex.owner === null) && !hex.unit) {
        targetCoord = nc;
        break;
      }
    }

    if (!targetCoord) throw new Error('No valid adjacent target');

    // Do the move
    moveUnit(gs, 'p1', unitId, targetCoord);

    // Undo
    const restored = undoAction(gameId, 'p1');

    // Unit should be back at original position
    const restoredUnitHex = restored.hexes.find(
      (h) => h.coord.q === unitHex.coord.q && h.coord.r === unitHex.coord.r,
    );
    expect(restoredUnitHex!.unit).not.toBeNull();
    expect(restoredUnitHex!.unit!.id).toBe(unitId);
  });

  it('multiple undos work (step by step)', () => {
    // Make two actions: buy two units on different hexes
    const p1Hexes = gs.hexes.filter(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );

    if (p1Hexes.length < 2) {
      // If not enough empty hexes, skip
      return;
    }

    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 200; // enough for two buys

    // First buy
    const hex1 = p1Hexes[0].coord;
    buyUnit(gs, 'p1', UnitType.PEASANT, hex1);

    // Second buy
    const freshGs = getGameState(gameId)!;
    const p1Hexes2 = freshGs.hexes.filter(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (p1Hexes2.length < 1) return;
    const hex2 = p1Hexes2[0].coord;
    buyUnit(freshGs, 'p1', UnitType.PEASANT, hex2);

    // Undo second buy
    const after1stUndo = undoAction(gameId, 'p1');
    const hex2After = after1stUndo.hexes.find(
      (h) => h.coord.q === hex2.q && h.coord.r === hex2.r,
    );
    expect(hex2After!.unit).toBeNull();

    // Undo first buy
    const after2ndUndo = undoAction(gameId, 'p1');
    const hex1After = after2ndUndo.hexes.find(
      (h) => h.coord.q === hex1.q && h.coord.r === hex1.r,
    );
    expect(hex1After!.unit).toBeNull();
  });

  it('redo restores after undo', () => {
    const p1Hexes = gs.hexes.filter(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (p1Hexes.length < 1) return;

    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 200;

    const hexCoord = p1Hexes[0].coord;
    buyUnit(gs, 'p1', UnitType.PEASANT, hexCoord);

    // Undo
    undoAction(gameId, 'p1');

    // Redo
    const redone = redoAction(gameId, 'p1');
    const hexAfter = redone.hexes.find(
      (h) => h.coord.q === hexCoord.q && h.coord.r === hexCoord.r,
    );
    expect(hexAfter!.unit).not.toBeNull();
  });

  it('new action clears redo stack', () => {
    const p1Hexes = gs.hexes.filter(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (p1Hexes.length < 2) return;

    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    prov.gold = 200;

    // Buy, undo, then buy something else
    buyUnit(gs, 'p1', UnitType.PEASANT, p1Hexes[0].coord);
    undoAction(gameId, 'p1');

    // Do a different action
    const freshGs = getGameState(gameId)!;
    const freshProv = freshGs.provinces.find((p) => p.owner === 'p1')!;
    freshProv.gold = 200;

    const availableHexes = freshGs.hexes.filter(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (availableHexes.length < 1) return;

    buyUnit(freshGs, 'p1', UnitType.PEASANT, availableHexes[0].coord);

    // Redo should fail now
    expect(() => redoAction(gameId, 'p1')).toThrow('Nothing to redo');
  });

  it("can't undo with empty stack", () => {
    // No actions taken yet, undo should fail
    expect(() => undoAction(gameId, 'p1')).toThrow('Nothing to undo');
  });

  it("can't redo with empty stack", () => {
    expect(() => redoAction(gameId, 'p1')).toThrow('Nothing to redo');
  });

  it("can't undo when it's not your turn", () => {
    expect(() => undoAction(gameId, 'p2')).toThrow('Not your turn');
  });
});

// ── auto-skip, elimination, and last-player-wins ──

describe('auto-skip, elimination, and win condition', () => {
  function create3PlayerGameState(): GameState {
    const p1Unit = makeUnit('p1', 0, 0, UnitType.PEASANT, 'u1');
    const p2Unit = makeUnit('p2', 2, 0, UnitType.PEASANT, 'u2');
    const p3Unit = makeUnit('p3', 0, 1, UnitType.PEASANT, 'u3');

    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', { unit: p1Unit }),
      makeHex(1, 0, 'p1'),
      makeHex(2, 0, 'p2', { unit: p2Unit }),
      makeHex(2, 1, 'p2'),
      makeHex(0, 1, 'p3', { unit: p3Unit }),
      makeHex(1, 1, 'p3'),
    ];

    return {
      id: 'skip-test',
      status: GameStatus.IN_PROGRESS,
      settings: { mapWidth: 10, mapHeight: 10, maxPlayers: 3, turnTimeLimit: 60000, startingGold: 20 },
      players: [
        { id: 'p1', name: 'P1', color: '#e74c3c', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p1'], ready: true },
        { id: 'p2', name: 'P2', color: '#3498db', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p2'], ready: true },
        { id: 'p3', name: 'P3', color: '#2ecc71', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p3'], ready: true },
      ],
      hexes,
      provinces: [
        { id: 'prov-p1', hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }], owner: 'p1', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
        { id: 'prov-p2', hexes: [{ q: 2, r: 0 }, { q: 2, r: 1 }], owner: 'p2', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
        { id: 'prov-p3', hexes: [{ q: 0, r: 1 }, { q: 1, r: 1 }], owner: 'p3', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
      ],
      currentTurnPlayerId: 'p1',
      turnNumber: 1,
      turnStartedAt: Date.now(),
      history: [],
      winnerId: null,
      createdAt: Date.now(),
    };
  }

  it('skips turn when player has no units and cannot afford any', () => {
    const gs = create3PlayerGameState();

    // Remove p2's unit and zero out their gold
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const p2Prov = gs.provinces.find((p) => p.owner === 'p2')!;
    p2Prov.gold = 0;
    p2Prov.upkeep = 0;

    endTurn(gs);

    // p2 should be skipped → current player is p3
    expect(gs.currentTurnPlayerId).toBe('p3');
  });

  it('does NOT skip turn when player has units', () => {
    const gs = create3PlayerGameState();
    // p2 has a unit by default
    endTurn(gs);
    expect(gs.currentTurnPlayerId).toBe('p2');
  });

  it('does NOT skip turn when player has gold to buy units', () => {
    const gs = create3PlayerGameState();

    // Remove p2's unit but leave enough gold to buy a peasant
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const p2Prov = gs.provinces.find((p) => p.owner === 'p2')!;
    p2Prov.gold = 10; // exactly enough for a peasant (UNIT_COST[PEASANT] = 10)
    p2Prov.upkeep = 0;

    endTurn(gs);

    expect(gs.currentTurnPlayerId).toBe('p2');
  });

  it('chains skips for multiple consecutive bankrupt players', () => {
    const p1Unit = makeUnit('p1', 0, 0, UnitType.PEASANT, 'u1');
    const p4Unit = makeUnit('p4', 1, 1, UnitType.PEASANT, 'u4');

    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', { unit: p1Unit }),
      makeHex(1, 0, 'p2'),
      makeHex(2, 0, 'p3'),
      makeHex(0, 1, 'p1'),
      makeHex(1, 1, 'p4', { unit: p4Unit }),
      makeHex(2, 1, 'p4'),
    ];

    const gs: GameState = {
      id: 'chain-skip-test',
      status: GameStatus.IN_PROGRESS,
      settings: { mapWidth: 10, mapHeight: 10, maxPlayers: 4, turnTimeLimit: 60000, startingGold: 20 },
      players: [
        { id: 'p1', name: 'P1', color: '#e74c3c', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p1'], ready: true },
        { id: 'p2', name: 'P2', color: '#3498db', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p2'], ready: true },
        { id: 'p3', name: 'P3', color: '#2ecc71', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p3'], ready: true },
        { id: 'p4', name: 'P4', color: '#f39c12', isAI: false, isConnected: true, isEliminated: false, gold: 20, provinces: ['prov-p4'], ready: true },
      ],
      hexes,
      provinces: [
        { id: 'prov-p1', hexes: [{ q: 0, r: 0 }, { q: 0, r: 1 }], owner: 'p1', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
        { id: 'prov-p2', hexes: [{ q: 1, r: 0 }], owner: 'p2', gold: 0, income: 1, upkeep: 0 },
        { id: 'prov-p3', hexes: [{ q: 2, r: 0 }], owner: 'p3', gold: 0, income: 1, upkeep: 0 },
        { id: 'prov-p4', hexes: [{ q: 1, r: 1 }, { q: 2, r: 1 }], owner: 'p4', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
      ],
      currentTurnPlayerId: 'p1',
      turnNumber: 1,
      turnStartedAt: Date.now(),
      history: [],
      winnerId: null,
      createdAt: Date.now(),
    };

    endTurn(gs);

    // p2 and p3 both have no units and no gold → both skipped
    expect(gs.currentTurnPlayerId).toBe('p4');
  });

  it('eliminates player who loses all territory via capture', () => {
    const gs = createTestGameState('elim-test');

    // Reduce p2 to a single hex with no unit
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const hex21 = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    hex21.owner = null;

    // Move p1's unit from (0,0) → (1,0)
    moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });

    // Reset hasMoved so unit can move again
    const unitAt10 = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!.unit!;
    unitAt10.hasMoved = false;

    // Capture p2's last hex (2,0)
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });

    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(true);
  });

  it('declares winner when last player standing', () => {
    const gs = createTestGameState('win-test');

    // Reduce p2 to a single hex with no unit
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const hex21 = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    hex21.owner = null;

    // Move p1's unit to capture p2's last hex
    moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });
    const unitAt10 = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!.unit!;
    unitAt10.hasMoved = false;
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });

    expect(gs.status).toBe(GameStatus.FINISHED);
    expect(gs.winnerId).toBe('p1');
  });
});
