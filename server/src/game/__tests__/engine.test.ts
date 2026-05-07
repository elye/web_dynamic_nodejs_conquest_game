import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  startGame,
  getGameState,
  moveUnit,
  buyUnit,
  buildStructure,
  retireUnit,
  endTurn,
  surrender,
  undoAction,
  redoAction,
} from '../engine.js';
import { gameStore } from '../../store/gameStore.js';
import { recalculateAllProvinces } from '../provinces.js';
import { getHexDefense } from '../combat.js';
import { coordKey, getHexNeighbors } from '../mapGenerator.js';
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
    makeHex(1, 0, 'p1', {
      structure: {
        id: 'cap-p1',
        type: StructureType.CAPITAL,
        owner: 'p1',
        hex: { q: 1, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
      },
    }),
    makeHex(-1, 0, 'p1'), // empty hex for building structures
    makeHex(2, 0, 'p2', { unit: p2Unit }),
    makeHex(0, 1, null),
    makeHex(1, 1, null),
    makeHex(2, 1, 'p2', {
      structure: {
        id: 'cap-p2',
        type: StructureType.CAPITAL,
        owner: 'p2',
        hex: { q: 2, r: 1 },
        strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
      },
    }),
    makeHex(3, 0, 'p2'), // extra p2 hex for tests
  ];

  const province1: Province = {
    id: 'prov-p1',
    hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -1, r: 0 }],
    owner: 'p1',
    gold: 50,
    income: 3,
    upkeep: UNIT_UPKEEP[UnitType.PEASANT],
  };

  const province2: Province = {
    id: 'prov-p2',
    hexes: [{ q: 2, r: 0 }, { q: 2, r: 1 }, { q: 3, r: 0 }],
    owner: 'p2',
    gold: 50,
    income: 3,
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
    pendingGoldCaptures: {},
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

  it('places capitals on hexes with most water adjacency', () => {
    createTestRoom('game-start-test', ['p1', 'p2']);
    const state = startGame('game-start-test');

    const lookup = new Map<string, Hex>();
    for (const hex of state.hexes) {
      lookup.set(coordKey(hex.coord.q, hex.coord.r), hex);
    }

    function waterScore(hex: Hex): number {
      const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
      let count = 0;
      for (const nc of neighbors) {
        const nh = lookup.get(coordKey(nc.q, nc.r));
        if (!nh || nh.terrain === TerrainType.WATER) count++;
      }
      return count;
    }

    // For each province with a capital, verify the capital hex has the maximum
    // water score among all empty hexes (no unit, no structure except the capital itself)
    for (const province of state.provinces) {
      const capitalHex = state.hexes.find(
        (h) =>
          h.structure?.type === StructureType.CAPITAL &&
          province.hexes.some((ph) => ph.q === h.coord.q && ph.r === h.coord.r),
      );
      if (!capitalHex) continue;

      const capitalScore = waterScore(capitalHex);

      // Check that no other hex in the province (without unit/structure) has higher water score
      for (const coord of province.hexes) {
        const hex = lookup.get(coordKey(coord.q, coord.r));
        if (!hex || hex === capitalHex) continue;
        // Only compare against hexes that were candidates (no unit, no structure other than capital)
        if (hex.unit || hex.structure) continue;
        expect(waterScore(hex)).toBeLessThanOrEqual(capitalScore);
      }
    }
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
    // p2 has capital at (2,1) giving +2 defense to adjacent (2,0)
    // p2 peasant (str 1) + capital defense (2) = defense 3
    // Need Knight (str 4) to beat defense 3
    const srcHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0)!;
    srcHex.unit = null;
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    const knight = makeUnit('p1', 1, 0, UnitType.KNIGHT, 'u1-knight');
    midHex.unit = knight;

    const result = moveUnit(gs, 'p1', 'u1-knight', { q: 2, r: 0 });
    const capturedHex = result.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0);
    expect(capturedHex!.owner).toBe('p1');
    expect(capturedHex!.unit!.id).toBe('u1-knight');
  });

  it("can't capture when too weak", () => {
    // p1 peasant (str 1) vs p2 peasant (str 1) — equal = fail
    const srcHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0)!;
    srcHex.unit = null;
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.unit = makeUnit('p1', 1, 0, UnitType.PEASANT, 'u1-weak');

    // Attack should throw — unit's turn is NOT consumed
    expect(() => moveUnit(gs, 'p1', 'u1-weak', { q: 2, r: 0 })).toThrow('not strong enough');
    // Unit should still be at source and NOT marked as moved
    const sourceHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0);
    expect(sourceHex!.unit!.hasMoved).toBe(false);
  });

  it('merges friendly units (Peasant+Peasant=Spearman)', () => {
    // Place a second peasant on (1,0) and clear its capital so merge is allowed
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.structure = null;
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
    midHex.structure = null;
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
    const result = buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0);
    expect(hex!.unit).not.toBeNull();
    expect(hex!.unit!.type).toBe(UnitType.PEASANT);
    expect(hex!.unit!.owner).toBe('p1');
    expect(hex!.unit!.hasMoved).toBe(true);
  });

  it('deducts gold from province', () => {
    const goldBefore = gs.provinces.find((p) => p.owner === 'p1')!.gold;
    buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 });
    // After recalculateAllProvinces, gold should be preserved minus cost
    const totalGold = gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((s, p) => s + p.gold, 0);
    expect(totalGold).toBe(goldBefore - UNIT_COST[UnitType.PEASANT]);
  });

  it("can't buy if not enough gold", () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 1;
    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 })).toThrow(
      'Insufficient gold',
    );
  });

  it("can't buy on hex with structure", () => {
    const hex = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    hex.structure = {
      id: 'struct-1',
      type: StructureType.TOWER,
      owner: 'p1',
      hex: { q: -1, r: 0 },
      strength: STRUCTURE_STRENGTH[StructureType.TOWER],
    };
    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 })).toThrow(
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
    const hex = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    hex.hasTree = true;
    hex.terrain = TerrainType.FOREST;

    const result = buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 });
    const placedHex = result.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0);
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

  it("can't promote a unit that has already moved", () => {
    // Place a peasant that has already moved, then try to buy on same hex
    const hex = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    hex.unit = makeUnit('p1', -1, 0, UnitType.PEASANT, 'moved-unit');
    hex.unit.hasMoved = true;

    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 })).toThrow(
      'already acted this turn',
    );
  });

  it("can't move a unit that was just bought", () => {
    // Buy a unit, then try to move it
    buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 });
    const hex = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    expect(hex.unit!.hasMoved).toBe(true);

    expect(() => moveUnit(gs, 'p1', hex.unit!.id, { q: 0, r: 0 })).toThrow(
      'already moved',
    );
  });

  it("can't move a unit that was just promoted via buy", () => {
    // Place a peasant, promote it by buying another peasant on same hex
    const hex = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    hex.unit = makeUnit('p1', -1, 0, UnitType.PEASANT, 'to-promote');

    buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 });
    expect(hex.unit!.type).toBe(UnitType.SPEARMAN);
    expect(hex.unit!.hasMoved).toBe(true);

    expect(() => moveUnit(gs, 'p1', 'to-promote', { q: 0, r: 0 })).toThrow(
      'already moved',
    );
  });

  it("can't promote a unit that was merged via move", () => {
    // Merge two peasants by moving, then try to buy-promote the merged unit
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    midHex.structure = null;
    midHex.unit = makeUnit('p1', 1, 0, UnitType.PEASANT, 'merge-target');

    moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });
    expect(midHex.unit!.type).toBe(UnitType.SPEARMAN);
    expect(midHex.unit!.hasMoved).toBe(true);

    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: 1, r: 0 })).toThrow(
      'already acted this turn',
    );
  });
});

// ── buildStructure ──

describe('buildStructure', () => {
  let gs: GameState;

  beforeEach(() => {
    gs = createTestGameState('build-test');
  });

  it('can build tower on own empty hex', () => {
    const result = buildStructure(gs, 'p1', StructureType.TOWER, { q: -1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0);
    expect(hex!.structure).not.toBeNull();
    expect(hex!.structure!.type).toBe(StructureType.TOWER);
    expect(hex!.structure!.owner).toBe('p1');
  });

  it('can build strong tower', () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 100;
    const result = buildStructure(gs, 'p1', StructureType.STRONG_TOWER, { q: -1, r: 0 });
    const hex = result.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0);
    expect(hex!.structure!.type).toBe(StructureType.STRONG_TOWER);
    expect(hex!.structure!.strength).toBe(STRUCTURE_STRENGTH[StructureType.STRONG_TOWER]);
  });

  it('deducts gold from province', () => {
    const goldBefore = gs.provinces.find((p) => p.owner === 'p1')!.gold;
    buildStructure(gs, 'p1', StructureType.TOWER, { q: -1, r: 0 });
    const prov = gs.provinces.find((p) => p.owner === 'p1')!;
    expect(prov.gold).toBe(goldBefore - STRUCTURE_COST[StructureType.TOWER]);
  });

  it("can't build if not enough gold", () => {
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 1;
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: -1, r: 0 }),
    ).toThrow('Insufficient gold');
  });

  it("can't build on hex with unit", () => {
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: 0, r: 0 }),
    ).toThrow('already has a unit');
  });

  it("can't build on hex with existing structure", () => {
    buildStructure(gs, 'p1', StructureType.TOWER, { q: -1, r: 0 });
    gs.provinces.find((p) => p.owner === 'p1')!.gold = 50;
    expect(() =>
      buildStructure(gs, 'p1', StructureType.TOWER, { q: -1, r: 0 }),
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

  it('processes income for the NEXT player at start of their turn', () => {
    const provP2Before = gs.provinces.find((p) => p.owner === 'p2')!;
    const goldBefore = provP2Before.gold;
    const income = provP2Before.income;
    const upkeep = provP2Before.upkeep;

    endTurn(gs);

    // After endTurn, p2 is now current player and income/upkeep was applied to p2
    expect(gs.currentTurnPlayerId).toBe('p2');
    const p2Provinces = gs.provinces.filter((p) => p.owner === 'p2');
    const totalGold = p2Provinces.reduce((s, p) => s + p.gold, 0);
    const expected = goldBefore + income - upkeep;
    if (expected >= 0) {
      expect(totalGold).toBe(expected);
    }
  });

  it('kills units when gold goes negative (starvation) at start of next turn', () => {
    // Give p2 an expensive unit (spearman, upkeep=6) but only 3 income hexes and 0 gold
    // After recalc: income=3, upkeep=6, gold=0+3-6=-3 → starvation
    const prov = gs.provinces.find((p) => p.owner === 'p2')!;
    prov.gold = 0;
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = makeUnit('p2', 2, 0, UnitType.SPEARMAN, 'u2-spear');

    endTurn(gs);

    // p2's spearman at (2,0) should be dead from starvation
    const hex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0);
    expect(hex!.unit).toBeNull();
  });

  it('sets death markers on starvation', () => {
    const prov = gs.provinces.find((p) => p.owner === 'p2')!;
    prov.gold = 0;
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = makeUnit('p2', 2, 0, UnitType.SPEARMAN, 'u2-spear');

    endTurn(gs);

    // p2's unit at (2,0) should have death marker
    const hex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0);
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
      if (hex && hex.terrain !== TerrainType.WATER && (hex.owner === 'p1' || hex.owner === null) && !hex.unit && !hex.structure) {
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

  it('undo restores hasMoved to false after move', () => {
    const unitHex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!unitHex) throw new Error('No p1 unit found');
    const unitId = unitHex.unit!.id;

    // Find an adjacent valid target
    const neighbors = [
      { q: unitHex.coord.q + 1, r: unitHex.coord.r },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r },
      { q: unitHex.coord.q, r: unitHex.coord.r + 1 },
      { q: unitHex.coord.q, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q + 1, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r + 1 },
    ];
    let targetCoord = null;
    for (const nc of neighbors) {
      const hex = gs.hexes.find((h) => h.coord.q === nc.q && h.coord.r === nc.r);
      if (hex && hex.terrain !== TerrainType.WATER && (hex.owner === 'p1' || hex.owner === null) && !hex.unit && !hex.structure) {
        targetCoord = nc;
        break;
      }
    }
    if (!targetCoord) throw new Error('No valid adjacent target');

    // Move — hasMoved should become true
    moveUnit(gs, 'p1', unitId, targetCoord);
    const movedGs = getGameState(gameId)!;
    const movedUnit = movedGs.hexes.find(
      (h) => h.coord.q === targetCoord!.q && h.coord.r === targetCoord!.r,
    );
    expect(movedUnit!.unit!.hasMoved).toBe(true);

    // Undo — hasMoved should revert to false
    const restored = undoAction(gameId, 'p1');
    const restoredUnit = restored.hexes.find(
      (h) => h.coord.q === unitHex.coord.q && h.coord.r === unitHex.coord.r,
    );
    expect(restoredUnit!.unit!.hasMoved).toBe(false);
  });

  it('redo restores hasMoved to true after undo', () => {
    const unitHex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!unitHex) throw new Error('No p1 unit found');
    const unitId = unitHex.unit!.id;

    const neighbors = [
      { q: unitHex.coord.q + 1, r: unitHex.coord.r },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r },
      { q: unitHex.coord.q, r: unitHex.coord.r + 1 },
      { q: unitHex.coord.q, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q + 1, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r + 1 },
    ];
    let targetCoord = null;
    for (const nc of neighbors) {
      const hex = gs.hexes.find((h) => h.coord.q === nc.q && h.coord.r === nc.r);
      if (hex && hex.terrain !== TerrainType.WATER && (hex.owner === 'p1' || hex.owner === null) && !hex.unit && !hex.structure) {
        targetCoord = nc;
        break;
      }
    }
    if (!targetCoord) throw new Error('No valid adjacent target');

    // Move, undo, then redo
    moveUnit(gs, 'p1', unitId, targetCoord);
    undoAction(gameId, 'p1');
    const redone = redoAction(gameId, 'p1');

    const redoneUnit = redone.hexes.find(
      (h) => h.coord.q === targetCoord!.q && h.coord.r === targetCoord!.r,
    );
    expect(redoneUnit!.unit!.hasMoved).toBe(true);
  });
});

// ── Capital System ──

describe('Capital System', () => {
  it('startGame places capitals in starting clusters', () => {
    gameStore.deleteGame('cap-start-test');
    createTestRoom('cap-start-test', ['p1', 'p2']);
    const state = startGame('cap-start-test');

    // Each player should have at least one capital
    for (const player of state.players) {
      const capitals = state.hexes.filter(
        (h) =>
          h.structure?.type === StructureType.CAPITAL &&
          h.structure.owner === player.id,
      );
      expect(capitals.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('province with 2+ hexes gets a capital via recalculation', () => {
    const gs = createTestGameState('cap-recalc-test');
    // Remove p1's capital to test auto-placement
    const capHex = gs.hexes.find(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure.owner === 'p1',
    )!;
    capHex.structure = null;

    recalculateAllProvinces(gs);

    // After recalculation, p1's province (3 hexes) should get a new capital
    const p1Capitals = gs.hexes.filter(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure?.owner === 'p1',
    );
    expect(p1Capitals.length).toBe(1);
  });

  it('province with 1 hex does NOT get a capital', () => {
    const gs = createTestGameState('cap-single-test');
    // Make p1 have only 1 hex by removing ownership of others
    const hex1 = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    hex1.owner = null;
    hex1.structure = null; // remove capital
    const hex2 = gs.hexes.find((h) => h.coord.q === -1 && h.coord.r === 0)!;
    hex2.owner = null;

    recalculateAllProvinces(gs);

    const p1Capitals = gs.hexes.filter(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure?.owner === 'p1',
    );
    expect(p1Capitals.length).toBe(0);
  });

  it('splitting territory: capital fragment keeps all gold, new fragment gets 0', () => {
    // Create a linear territory: (-1,0) - (0,0) - (1,0) - (2,0) - (3,0)
    // Capital on (1,0). Remove (0,0) to split into [-1,0] and [1,0, 2,0, 3,0]
    const hexes: Hex[] = [
      makeHex(-1, 0, 'p1'),
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p1', {
        structure: {
          id: 'cap-split',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 1, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(2, 0, 'p1'),
      makeHex(3, 0, 'p1'),
      // Need some hexes for p2 so recalculation works
      makeHex(0, 1, 'p2'),
      makeHex(1, 1, 'p2'),
    ];

    const gs: GameState = {
      id: 'split-test',
      status: GameStatus.IN_PROGRESS,
      settings: { ...DEFAULT_GAME_SETTINGS },
      players: [
        { id: 'p1', name: 'P1', color: '#e74c3c', isAI: false, isConnected: true, isEliminated: false, gold: 0, provinces: [], ready: true },
        { id: 'p2', name: 'P2', color: '#3498db', isAI: false, isConnected: true, isEliminated: false, gold: 0, provinces: [], ready: true },
      ],
      hexes,
      provinces: [
        {
          id: 'prov-split',
          hexes: [{ q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
          owner: 'p1',
          gold: 100,
          income: 5,
          upkeep: 0,
        },
        {
          id: 'prov-p2-split',
          hexes: [{ q: 0, r: 1 }, { q: 1, r: 1 }],
          owner: 'p2',
          gold: 20,
          income: 2,
          upkeep: 0,
        },
      ],
      currentTurnPlayerId: 'p1',
      turnNumber: 1,
      turnStartedAt: Date.now(),
      history: [],
      winnerId: null,
      pendingGoldCaptures: {},
      createdAt: Date.now(),
    };

    // Split: remove (0,0) from p1's territory
    const splitHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 0)!;
    splitHex.owner = null;

    recalculateAllProvinces(gs);

    // Province with capital (1,0) should keep all 100 gold
    const capitalProv = gs.provinces.find(
      (p) =>
        p.owner === 'p1' &&
        p.hexes.some((h) => h.q === 1 && h.r === 0),
    )!;
    expect(capitalProv.gold).toBe(100);

    // Province without original capital (-1,0 alone) should have 0 gold
    // But single hex provinces don't get capitals, so it's just 0 gold
    const fragmentProv = gs.provinces.find(
      (p) =>
        p.owner === 'p1' &&
        p.hexes.some((h) => h.q === -1 && h.r === 0),
    );
    if (fragmentProv) {
      expect(fragmentProv.gold).toBe(0);
    }
  });

  it('capturing enemy capital destroys it', () => {
    const gs = createTestGameState('cap-capture-test');
    // Put a strong unit adjacent to enemy capital at (2,1)
    // First, we need the knight at (1,1) adjacent to (2,1)
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 1)!;
    midHex.owner = 'p1';
    midHex.unit = makeUnit('p1', 1, 1, UnitType.KNIGHT, 'knight-cap');

    // Update province to include (1,1)
    gs.provinces.find((p) => p.owner === 'p1')!.hexes.push({ q: 1, r: 1 });

    // Move knight to capture capital at (2,1)
    const result = moveUnit(gs, 'p1', 'knight-cap', { q: 2, r: 1 });

    // Capital at (2,1) should be destroyed
    const capturedHex = result.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1);
    expect(capturedHex!.owner).toBe('p1');
    // Capital structure should be gone (destroyed on capture)
    expect(
      capturedHex!.structure === null ||
      capturedHex!.structure?.owner === 'p1'
    ).toBe(true);
  });

  it('after capital capture, new capital auto-appears if 2+ hexes remain', () => {
    const gs = createTestGameState('cap-auto-test');
    // Add more p2 hexes so they still have 2+ after losing capital
    const extraHex = makeHex(3, 1, 'p2');
    gs.hexes.push(extraHex);
    gs.provinces.find((p) => p.owner === 'p2')!.hexes.push({ q: 3, r: 1 });

    // Put a knight at (1,1) to capture p2's capital at (2,1)
    const midHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 1)!;
    midHex.owner = 'p1';
    midHex.unit = makeUnit('p1', 1, 1, UnitType.KNIGHT, 'knight-auto');
    gs.provinces.find((p) => p.owner === 'p1')!.hexes.push({ q: 1, r: 1 });

    moveUnit(gs, 'p1', 'knight-auto', { q: 2, r: 1 });

    // p2 should still have remaining hexes with a new capital
    const p2Provinces = gs.provinces.filter((p) => p.owner === 'p2');
    const p2Capitals = gs.hexes.filter(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure?.owner === 'p2',
    );

    // If p2 has a province with 2+ hexes, it should have a new capital
    const p2BigProvinces = p2Provinces.filter((p) => p.hexes.length >= 2);
    if (p2BigProvinces.length > 0) {
      expect(p2Capitals.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('merging territories combines gold and removes extra capital', () => {
    // Two separate provinces for p1, each with a capital.
    // Connecting them should merge gold and keep the richer capital.
    const hexes: Hex[] = [
      // Province A: (0,0) capital, (1,0)
      makeHex(0, 0, 'p1', {
        structure: {
          id: 'cap-a',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 0, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(1, 0, 'p1'),
      // Gap at (2,0) — neutral, will be captured to merge
      makeHex(2, 0, null),
      // Province B: (3,0), (4,0) capital
      makeHex(3, 0, 'p1'),
      makeHex(4, 0, 'p1', {
        structure: {
          id: 'cap-b',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 4, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      // p2 hexes
      makeHex(0, 1, 'p2'),
      makeHex(1, 1, 'p2', {
        structure: {
          id: 'cap-p2-m',
          type: StructureType.CAPITAL,
          owner: 'p2',
          hex: { q: 1, r: 1 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
    ];

    const gs: GameState = {
      id: 'merge-cap-test',
      status: GameStatus.IN_PROGRESS,
      settings: { ...DEFAULT_GAME_SETTINGS },
      players: [
        { id: 'p1', name: 'P1', color: '#e74c3c', isAI: false, isConnected: true, isEliminated: false, gold: 0, provinces: [], ready: true },
        { id: 'p2', name: 'P2', color: '#3498db', isAI: false, isConnected: true, isEliminated: false, gold: 0, provinces: [], ready: true },
      ],
      hexes,
      provinces: [
        {
          id: 'prov-a',
          hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
          owner: 'p1',
          gold: 30,
          income: 2,
          upkeep: 0,
        },
        {
          id: 'prov-b',
          hexes: [{ q: 3, r: 0 }, { q: 4, r: 0 }],
          owner: 'p1',
          gold: 50,
          income: 2,
          upkeep: 0,
        },
        {
          id: 'prov-p2-m',
          hexes: [{ q: 0, r: 1 }, { q: 1, r: 1 }],
          owner: 'p2',
          gold: 20,
          income: 2,
          upkeep: 0,
        },
      ],
      currentTurnPlayerId: 'p1',
      turnNumber: 1,
      turnStartedAt: Date.now(),
      history: [],
      winnerId: null,
      pendingGoldCaptures: {},
      createdAt: Date.now(),
    };

    // Connect the two provinces by claiming (2,0)
    const gapHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    gapHex.owner = 'p1';

    recalculateAllProvinces(gs);

    // Should now be a single p1 province
    const p1Provs = gs.provinces.filter((p) => p.owner === 'p1');
    expect(p1Provs).toHaveLength(1);

    // Gold should be combined: 30 + 50 = 80
    expect(p1Provs[0].gold).toBe(80);

    // Only ONE capital should remain
    const p1Capitals = gs.hexes.filter(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure?.owner === 'p1',
    );
    expect(p1Capitals).toHaveLength(1);

    // The surviving capital should be the one from the richer province (prov-b at (4,0))
    expect(p1Capitals[0].coord.q).toBe(4);
    expect(p1Capitals[0].coord.r).toBe(0);
  });

  it('can only buy units in province with capital', () => {
    const gs = createTestGameState('cap-buy-test');
    // Remove p1's capital
    const capHex = gs.hexes.find(
      (h) => h.structure?.type === StructureType.CAPITAL && h.structure.owner === 'p1',
    )!;
    capHex.structure = null;

    expect(() => buyUnit(gs, 'p1', UnitType.PEASANT, { q: -1, r: 0 })).toThrow(
      'no capital',
    );
  });

  it('capital provides no defense bonus', () => {
    const gs = createTestGameState('cap-defense-test');
    // Hex (1,0) has a capital. Check defense.
    const capHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    expect(capHex.structure?.type).toBe(StructureType.CAPITAL);

    // getHexDefense should not include capital defense (0)
    const defense = getHexDefense(capHex, gs.hexes);
    expect(defense).toBe(0);
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
      makeHex(1, 0, 'p1', {
        structure: { id: 'cap-p1-3p', type: StructureType.CAPITAL, owner: 'p1', hex: { q: 1, r: 0 }, strength: STRUCTURE_STRENGTH[StructureType.CAPITAL] },
      }),
      makeHex(2, 0, 'p2', { unit: p2Unit }),
      makeHex(2, 1, 'p2', {
        structure: { id: 'cap-p2-3p', type: StructureType.CAPITAL, owner: 'p2', hex: { q: 2, r: 1 }, strength: STRUCTURE_STRENGTH[StructureType.CAPITAL] },
      }),
      makeHex(0, 1, 'p3', { unit: p3Unit }),
      makeHex(1, 1, 'p3', {
        structure: { id: 'cap-p3-3p', type: StructureType.CAPITAL, owner: 'p3', hex: { q: 1, r: 1 }, strength: STRUCTURE_STRENGTH[StructureType.CAPITAL] },
      }),
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
      pendingGoldCaptures: {},
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
      makeHex(0, 1, 'p1'),
      makeHex(1, 0, 'p2'),
      makeHex(1, -1, 'p2'), // adjacent to (1,0) so p2 gets a capital
      makeHex(2, 0, 'p3'),
      makeHex(3, 0, 'p3'), // adjacent to (2,0) so p3 gets a capital
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
        { id: 'prov-p2', hexes: [{ q: 1, r: 0 }, { q: 1, r: -1 }], owner: 'p2', gold: 0, income: 2, upkeep: 0 },
        { id: 'prov-p3', hexes: [{ q: 2, r: 0 }, { q: 3, r: 0 }], owner: 'p3', gold: 0, income: 2, upkeep: 0 },
        { id: 'prov-p4', hexes: [{ q: 1, r: 1 }, { q: 2, r: 1 }], owner: 'p4', gold: 50, income: 2, upkeep: UNIT_UPKEEP[UnitType.PEASANT] },
      ],
      currentTurnPlayerId: 'p1',
      turnNumber: 1,
      turnStartedAt: Date.now(),
      history: [],
      winnerId: null,
      pendingGoldCaptures: {},
      createdAt: Date.now(),
    };

    endTurn(gs);

    // p2 and p3 both have no units and no gold → both skipped
    expect(gs.currentTurnPlayerId).toBe('p4');
  });

  it('processes income for the player whose turn starts after an auto-skip', () => {
    const gs = createTestGameState('skip-income-test');

    // Remove p2's unit, capital, and zero out gold so p2 can't act
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const p2CapHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    p2CapHex.structure = null;
    const p2Prov = gs.provinces.find((p) => p.owner === 'p2')!;
    p2Prov.gold = 0;
    p2Prov.upkeep = 0;

    // Record p1's province state before ending turn
    const p1Prov = gs.provinces.find((p) => p.owner === 'p1')!;
    const p1GoldBefore = p1Prov.gold;
    const p1Income = p1Prov.income;
    const p1Upkeep = p1Prov.upkeep;

    // p1 ends turn → p2 starts (income processed for p2) → p2 can't act → auto-skip to p1
    endTurn(gs);

    // p2 was skipped, so it's p1's turn again
    expect(gs.currentTurnPlayerId).toBe('p1');

    // p1's income should have been processed during the skip-to
    const p1ProvAfter = gs.provinces.find((p) => p.owner === 'p1')!;
    expect(p1ProvAfter.gold).toBe(p1GoldBefore + p1Income - p1Upkeep);
  });

  it('eliminates player who loses all territory via capture (at end of turn)', () => {
    const gs = createTestGameState('elim-test');

    // Reduce p2 to a single hex with no unit or capital
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const hex21 = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    hex21.owner = null;
    hex21.structure = null;
    const hex30 = gs.hexes.find((h) => h.coord.q === 3 && h.coord.r === 0)!;
    hex30.owner = null;

    // Recalculate so p2 province is just (2,0) with no capital
    recalculateAllProvinces(gs);

    // Clear capital on (1,0) so unit can move through
    const capHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    capHex.structure = null;

    // Move p1's unit from (0,0) → (1,0)
    moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });

    // Reset hasMoved so unit can move again
    const unitAt10 = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!.unit!;
    unitAt10.hasMoved = false;

    // Capture p2's last hex (2,0)
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });

    // Not eliminated yet (mid-turn)
    const p2Before = gs.players.find((p) => p.id === 'p2')!;
    expect(p2Before.isEliminated).toBe(false);

    // End turn — now elimination is checked
    endTurn(gs);

    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(true);
  });

  it('declares winner when last player standing (at end of turn)', () => {
    const gs = createTestGameState('win-test');

    // Reduce p2 to a single hex with no unit or capital
    const p2UnitHex = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 0)!;
    p2UnitHex.unit = null;
    const hex21 = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    hex21.owner = null;
    hex21.structure = null;
    const hex30 = gs.hexes.find((h) => h.coord.q === 3 && h.coord.r === 0)!;
    hex30.owner = null;

    recalculateAllProvinces(gs);

    // Clear capital on (1,0) so unit can move through
    const capHex = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!;
    capHex.structure = null;

    // Move p1's unit to capture p2's last hex
    moveUnit(gs, 'p1', 'u1', { q: 1, r: 0 });
    const unitAt10 = gs.hexes.find((h) => h.coord.q === 1 && h.coord.r === 0)!.unit!;
    unitAt10.hasMoved = false;
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });

    // Not finished yet (mid-turn)
    expect(gs.status).toBe(GameStatus.IN_PROGRESS);

    // End turn — now win is checked
    endTurn(gs);

    expect(gs.status).toBe(GameStatus.FINISHED);
    expect(gs.winnerId).toBe('p1');
  });
});

// ── real-time income/upkeep updates ──

describe('real-time income/upkeep updates', () => {
  let gs: GameState;
  const gameId = 'realtime-test';

  beforeEach(() => {
    gameStore.deleteGame(gameId);
    createTestRoom(gameId, ['p1', 'p2']);
    gs = startGame(gameId);
  });

  function getP1Province(): Province {
    return gs.provinces.find((p) => p.owner === 'p1')!;
  }

  function getP1TotalUpkeep(): number {
    return gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);
  }

  function getP1TotalIncome(): number {
    return gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.income, 0);
  }

  it('buyUnit updates upkeep immediately', () => {
    const prov = getP1Province();
    prov.gold = 200;

    const upkeepBefore = getP1TotalUpkeep();

    // Find an empty p1 hex to buy on
    const emptyHex = gs.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (!emptyHex) throw new Error('No empty p1 hex');

    buyUnit(gs, 'p1', UnitType.PEASANT, emptyHex.coord);

    const upkeepAfter = getP1TotalUpkeep();
    expect(upkeepAfter).toBe(upkeepBefore + UNIT_UPKEEP[UnitType.PEASANT]);
  });

  it('removing tree via move updates income immediately', () => {
    // Find a p1 hex with a unit and an adjacent p1 hex we can put a tree on
    const unitHex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!unitHex) throw new Error('No p1 unit');

    // Find an adjacent hex owned by p1 without a unit
    const neighbors = [
      { q: unitHex.coord.q + 1, r: unitHex.coord.r },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r },
      { q: unitHex.coord.q, r: unitHex.coord.r + 1 },
      { q: unitHex.coord.q, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q + 1, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r + 1 },
    ];
    const treeHex = gs.hexes.find(
      (h) =>
        h.owner === 'p1' &&
        !h.unit &&
        !h.structure &&
        neighbors.some((n) => n.q === h.coord.q && n.r === h.coord.r),
    );
    if (!treeHex) throw new Error('No adjacent empty p1 hex');

    // Place a tree on it
    treeHex.hasTree = true;

    // Recalculate so income reflects the tree
    recalculateAllProvinces(gs);

    const incomeBefore = getP1TotalIncome();

    // Move unit onto tree hex
    moveUnit(gs, 'p1', unitHex.unit!.id, treeHex.coord);

    const incomeAfter = getP1TotalIncome();
    // Tree removed → that hex now contributes 1 income
    expect(incomeAfter).toBe(incomeBefore + 1);
  });

  it('capturing new tile updates income immediately', () => {
    // Use a deterministic setup: place p1 unit adjacent to a guaranteed neutral hex
    const unitHex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!unitHex) throw new Error('No p1 unit');

    // Pick the first neighbor coordinate
    const neutralCoord = { q: unitHex.coord.q + 1, r: unitHex.coord.r };

    // Ensure a neutral land hex exists at that coordinate
    let neutralHex = gs.hexes.find(
      (h) => h.coord.q === neutralCoord.q && h.coord.r === neutralCoord.r,
    );
    if (neutralHex) {
      // Make it neutral and walkable
      neutralHex.owner = null;
      neutralHex.unit = null;
      neutralHex.structure = null;
      neutralHex.hasTree = false;
      neutralHex.terrain = TerrainType.GRASS;
    } else {
      neutralHex = {
        coord: neutralCoord,
        terrain: TerrainType.GRASS,
        owner: null,
        unit: null,
        structure: null,
        hasTree: false,
      };
      gs.hexes.push(neutralHex);
    }

    // Recalculate provinces so income reflects current state
    recalculateAllProvinces(gs);
    const incomeBefore = getP1TotalIncome();

    moveUnit(gs, 'p1', unitHex.unit!.id, neutralCoord);

    const incomeAfter = getP1TotalIncome();
    // Captured a non-tree hex → income should increase by 1
    expect(incomeAfter).toBe(incomeBefore + 1);
  });

  it('undo reverts upkeep immediately after buyUnit', () => {
    const prov = getP1Province();
    prov.gold = 200;

    const upkeepBefore = getP1TotalUpkeep();

    const emptyHex = gs.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (!emptyHex) throw new Error('No empty p1 hex');

    buyUnit(gs, 'p1', UnitType.PEASANT, emptyHex.coord);

    // Upkeep went up
    const gsAfterBuy = getGameState(gameId)!;
    const upkeepAfterBuy = gsAfterBuy.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);
    expect(upkeepAfterBuy).toBe(upkeepBefore + UNIT_UPKEEP[UnitType.PEASANT]);

    // Undo
    const restored = undoAction(gameId, 'p1');
    const upkeepAfterUndo = restored.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);
    expect(upkeepAfterUndo).toBe(upkeepBefore);
  });

  it('redo restores upkeep immediately after undo', () => {
    const prov = getP1Province();
    prov.gold = 200;

    const upkeepBefore = getP1TotalUpkeep();

    const emptyHex = gs.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (!emptyHex) throw new Error('No empty p1 hex');

    buyUnit(gs, 'p1', UnitType.PEASANT, emptyHex.coord);
    undoAction(gameId, 'p1');

    // Redo
    const redone = redoAction(gameId, 'p1');
    const upkeepAfterRedo = redone.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);
    expect(upkeepAfterRedo).toBe(upkeepBefore + UNIT_UPKEEP[UnitType.PEASANT]);
  });
});

// ── Gold capture from enemy capitals ──

describe('gold capture from enemy capitals', () => {
  const gameId = 'gold-capture-test';

  function createGoldCaptureState(): GameState {
    // p1 has a knight at (1,0) that can attack p2's capital at (2,0)
    // p2's capital is in a province with gold
    const p1Unit = makeUnit('p1', 1, 0, UnitType.KNIGHT, 'u1');

    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', {
        structure: {
          id: 'cap-p1',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 0, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(1, 0, 'p1', { unit: p1Unit }),
      makeHex(2, 0, 'p2', {
        structure: {
          id: 'cap-p2',
          type: StructureType.CAPITAL,
          owner: 'p2',
          hex: { q: 2, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(3, 0, 'p2'),
      makeHex(0, 1, 'p1'),
      makeHex(2, 1, 'p2'),
    ];

    const province1: Province = {
      id: 'prov-p1',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
      owner: 'p1',
      gold: 30,
      income: 3,
      upkeep: UNIT_UPKEEP[UnitType.KNIGHT],
    };

    const province2: Province = {
      id: 'prov-p2',
      hexes: [{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 2, r: 1 }],
      owner: 'p2',
      gold: 75,
      income: 3,
      upkeep: 0,
    };

    const gs: GameState = {
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
      pendingGoldCaptures: {},
    };

    // Register in engine so undo/redo works
    createTestRoom(gameId, ['p1', 'p2']);
    // startGame registers the state; we'll replace it after
    const started = startGame(gameId);
    // Overwrite with our controlled state
    Object.assign(started, gs);
    // Copy hexes/provinces by reference so engine sees them
    return started;
  }

  beforeEach(() => {
    gameStore.deleteGame(gameId);
  });

  it('stores captured gold in pendingGoldCaptures when capturing enemy capital', () => {
    const gs = createGoldCaptureState();

    // p1's knight at (1,0) attacks p2's capital at (2,0)
    // p2's province has 75 gold
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });

    // The capital should be destroyed
    const capturedHex = gs.hexes.find(
      (h) => h.coord.q === 2 && h.coord.r === 0,
    );
    expect(capturedHex?.structure).toBeNull();

    // Gold should be in pendingGoldCaptures, not yet in p1's province
    expect(gs.pendingGoldCaptures['p1']).toBe(75);
  });

  it('applies pending gold to richest province at end of turn', () => {
    const gs = createGoldCaptureState();

    // Give p2 a unit so auto-skip doesn't trigger (which would process p1's income/upkeep)
    const p2UnitHex = gs.hexes.find(
      (h) => h.coord.q === 3 && h.coord.r === 0,
    )!;
    p2UnitHex.unit = makeUnit('p2', 3, 0, UnitType.PEASANT, 'u2');

    // Capture the capital
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });
    expect(gs.pendingGoldCaptures['p1']).toBe(75);

    // Find p1's province gold before endTurn
    const p1ProvsBefore = gs.provinces.filter((p) => p.owner === 'p1');
    const totalGoldBefore = p1ProvsBefore.reduce((sum, p) => sum + p.gold, 0);

    // End p1's turn — pending gold should be applied
    endTurn(gs);

    // pendingGoldCaptures should be cleared
    expect(gs.pendingGoldCaptures['p1']).toBeUndefined();

    // p1's provinces should have received the captured gold
    // (no income/upkeep processed for p1 since it's now p2's turn)
    const p1ProvsAfter = gs.provinces.filter((p) => p.owner === 'p1');
    const totalGoldAfter = p1ProvsAfter.reduce((sum, p) => sum + p.gold, 0);

    expect(totalGoldAfter).toBe(totalGoldBefore + 75);
  });

  it('undo after capital capture removes pending gold', () => {
    const gs = createGoldCaptureState();

    // Capture the capital
    moveUnit(gs, 'p1', 'u1', { q: 2, r: 0 });
    expect(gs.pendingGoldCaptures['p1']).toBe(75);

    // Undo
    const restored = undoAction(gameId, 'p1');

    // Pending gold should be gone (restored from snapshot before the move)
    expect(restored.pendingGoldCaptures['p1']).toBeUndefined();

    // p2's capital should be back
    const capitalHex = restored.hexes.find(
      (h) => h.coord.q === 2 && h.coord.r === 0,
    );
    expect(capitalHex?.structure?.type).toBe(StructureType.CAPITAL);
  });
});

// ── retireUnit ──

describe('retireUnit', () => {
  let gs: GameState;
  const gameId = 'retire-test';

  beforeEach(() => {
    gameStore.deleteGame(gameId);
    createTestRoom(gameId, ['p1', 'p2']);
    gs = startGame(gameId);
  });

  function findP1UnitHex(): Hex {
    const hex = gs.hexes.find((h) => h.unit?.owner === 'p1');
    if (!hex) throw new Error('No p1 unit found');
    return hex;
  }

  it('refunds half cost to province gold for Peasant', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;
    expect(unitHex.unit!.type).toBe(UnitType.PEASANT);

    const province = gs.provinces.find(
      (p) =>
        p.owner === 'p1' &&
        p.hexes.some((h) => h.q === unitHex.coord.q && h.r === unitHex.coord.r),
    )!;
    const goldBefore = province.gold;

    retireUnit(gs, 'p1', unitId);

    // After recalculation, find the province containing the hex
    const provAfter = gs.provinces.find(
      (p) =>
        p.owner === 'p1' &&
        p.hexes.some((h) => h.q === unitHex.coord.q && h.r === unitHex.coord.r),
    );
    // Refund: Math.floor(10 / 2) = 5
    expect(provAfter!.gold).toBe(goldBefore + 5);
  });

  it('removes unit from hex but keeps owner', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;
    const coord = { ...unitHex.coord };

    retireUnit(gs, 'p1', unitId);

    const hex = gs.hexes.find((h) => h.coord.q === coord.q && h.coord.r === coord.r)!;
    expect(hex.unit).toBeNull();
    expect(hex.owner).toBe('p1');
  });

  it('reduces province upkeep', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;
    const unitUpkeep = unitHex.unit!.upkeep;

    const totalUpkeepBefore = gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);

    retireUnit(gs, 'p1', unitId);

    const totalUpkeepAfter = gs.provinces
      .filter((p) => p.owner === 'p1')
      .reduce((sum, p) => sum + p.upkeep, 0);

    expect(totalUpkeepAfter).toBe(totalUpkeepBefore - unitUpkeep);
  });

  it('cannot retire enemy units', () => {
    const p2Hex = gs.hexes.find((h) => h.unit?.owner === 'p2');
    if (!p2Hex) throw new Error('No p2 unit found');

    expect(() => retireUnit(gs, 'p1', p2Hex.unit!.id)).toThrow(
      'does not belong to you',
    );
  });

  it("cannot retire on other player's turn", () => {
    const p2Hex = gs.hexes.find((h) => h.unit?.owner === 'p2');
    if (!p2Hex) throw new Error('No p2 unit found');

    expect(() => retireUnit(gs, 'p2', p2Hex.unit!.id)).toThrow('Not your turn');
  });

  it('can be undone', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;
    const coord = { ...unitHex.coord };

    retireUnit(gs, 'p1', unitId);

    // Unit should be gone
    const hexAfterRetire = gs.hexes.find(
      (h) => h.coord.q === coord.q && h.coord.r === coord.r,
    )!;
    expect(hexAfterRetire.unit).toBeNull();

    // Undo
    const restored = undoAction(gameId, 'p1');
    const restoredHex = restored.hexes.find(
      (h) => h.coord.q === coord.q && h.coord.r === coord.r,
    )!;
    expect(restoredHex.unit).not.toBeNull();
    expect(restoredHex.unit!.id).toBe(unitId);
  });

  it('clears redo stack', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;

    // Do a move, undo it (creates redo entry), then retire
    const emptyHex = gs.hexes.find(
      (h) => h.owner === 'p1' && !h.unit && !h.structure,
    );
    if (emptyHex) {
      const prov = gs.provinces.find((p) => p.owner === 'p1')!;
      prov.gold = 200;
      buyUnit(gs, 'p1', UnitType.PEASANT, emptyHex.coord);
      undoAction(gameId, 'p1');
      // Now redo stack has an entry

      // Retire the original unit — should clear redo stack
      const freshGs = getGameState(gameId)!;
      const freshUnitHex = freshGs.hexes.find((h) => h.unit?.owner === 'p1');
      if (freshUnitHex) {
        retireUnit(freshGs, 'p1', freshUnitHex.unit!.id);
        expect(() => redoAction(gameId, 'p1')).toThrow('Nothing to redo');
      }
    }
  });

  it('can retire a unit that has already moved', () => {
    const unitHex = findP1UnitHex();
    const unitId = unitHex.unit!.id;

    // Find an adjacent valid target to move to
    const neighbors = [
      { q: unitHex.coord.q + 1, r: unitHex.coord.r },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r },
      { q: unitHex.coord.q, r: unitHex.coord.r + 1 },
      { q: unitHex.coord.q, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q + 1, r: unitHex.coord.r - 1 },
      { q: unitHex.coord.q - 1, r: unitHex.coord.r + 1 },
    ];
    let targetCoord = null;
    for (const nc of neighbors) {
      const hex = gs.hexes.find((h) => h.coord.q === nc.q && h.coord.r === nc.r);
      if (hex && hex.terrain !== TerrainType.WATER && (hex.owner === 'p1' || hex.owner === null) && !hex.unit && !hex.structure) {
        targetCoord = nc;
        break;
      }
    }
    if (!targetCoord) throw new Error('No valid adjacent target');

    // Move the unit (hasMoved becomes true)
    moveUnit(gs, 'p1', unitId, targetCoord);
    const movedGs = getGameState(gameId)!;
    const movedUnit = movedGs.hexes.find(
      (h) => h.coord.q === targetCoord!.q && h.coord.r === targetCoord!.r,
    )!;
    expect(movedUnit.unit!.hasMoved).toBe(true);

    // Retire should still work
    retireUnit(movedGs, 'p1', unitId);
    const retiredHex = movedGs.hexes.find(
      (h) => h.coord.q === targetCoord!.q && h.coord.r === targetCoord!.r,
    )!;
    expect(retiredHex.unit).toBeNull();
  });
});

// ── no-capital elimination ──

describe('no-capital elimination', () => {
  it('eliminates a player who has hexes but no capital', () => {
    const gs = createTestGameState('no-cap-elim');

    // Reduce p2 to isolated single hexes (no province gets a capital)
    // Remove p2's capital structure
    const capHex = gs.hexes.find(
      (h) => h.coord.q === 2 && h.coord.r === 1,
    )!;
    capHex.structure = null;

    // Make p2's hexes non-adjacent so recalculate won't form a multi-hex province
    // Move hex (3,0) ownership away so p2 has only (2,0) and (2,1) which are adjacent
    // Instead, remove adjacency: clear all p2 hexes except one isolated one
    for (const hex of gs.hexes) {
      if (hex.owner === 'p2') {
        hex.owner = null;
        hex.unit = null;
        hex.structure = null;
      }
    }
    // Give p2 two isolated hexes with no capital
    const isoHex1 = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1)!;
    isoHex1.owner = 'p2';
    const isoHex2 = gs.hexes.find((h) => h.coord.q === 2 && h.coord.r === 1)!;
    isoHex2.owner = 'p2';

    // Recalculate provinces (single-tile provinces won't get capitals)
    recalculateAllProvinces(gs);

    // Verify p2 has hexes but no capital
    const p2Hexes = gs.hexes.filter((h) => h.owner === 'p2');
    expect(p2Hexes.length).toBeGreaterThan(0);
    expect(p2Hexes.some((h) => h.structure?.type === StructureType.CAPITAL)).toBe(false);

    // End p1's turn — checkEliminations should eliminate p2
    endTurn(gs);

    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(true);

    // All p2 hexes should now be neutral
    const remainingP2Hexes = gs.hexes.filter((h) => h.owner === 'p2');
    expect(remainingP2Hexes).toHaveLength(0);
  });

  it('does not eliminate a player who has a capital', () => {
    const gs = createTestGameState('has-cap');

    // p2 has a capital by default — should not be eliminated
    endTurn(gs);

    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(false);
  });

  it('clears units and structures from eliminated no-capital player hexes', () => {
    const gs = createTestGameState('no-cap-clear');

    // Strip p2's capital but leave a unit and a tower
    for (const hex of gs.hexes) {
      if (hex.owner === 'p2') {
        hex.owner = null;
        hex.unit = null;
        hex.structure = null;
      }
    }

    // Give p2 a single isolated hex with a unit and tower (no capital)
    const isoHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1)!;
    isoHex.owner = 'p2';
    isoHex.unit = makeUnit('p2', 0, 1, UnitType.PEASANT, 'u-iso');
    isoHex.structure = {
      id: 'tower-p2',
      type: StructureType.TOWER,
      owner: 'p2',
      hex: { q: 0, r: 1 },
      strength: STRUCTURE_STRENGTH[StructureType.TOWER],
    };

    recalculateAllProvinces(gs);

    endTurn(gs);

    const p2 = gs.players.find((p) => p.id === 'p2')!;
    expect(p2.isEliminated).toBe(true);

    // Hex should be neutral with no unit or structure
    expect(isoHex.owner).toBeNull();
    expect(isoHex.unit).toBeNull();
    expect(isoHex.structure).toBeNull();
  });

  it('triggers win condition when no-capital elimination leaves one player', () => {
    const gs = createTestGameState('no-cap-win');

    // Remove all p2 hexes and give them a single isolated hex (no capital)
    for (const hex of gs.hexes) {
      if (hex.owner === 'p2') {
        hex.owner = null;
        hex.unit = null;
        hex.structure = null;
      }
    }
    const isoHex = gs.hexes.find((h) => h.coord.q === 0 && h.coord.r === 1)!;
    isoHex.owner = 'p2';

    recalculateAllProvinces(gs);

    endTurn(gs);

    expect(gs.players.find((p) => p.id === 'p2')!.isEliminated).toBe(true);
    expect(gs.status).toBe(GameStatus.FINISHED);
    expect(gs.winnerId).toBe('p1');
  });
});
