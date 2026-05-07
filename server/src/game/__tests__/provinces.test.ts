import { describe, it, expect } from 'vitest';
import {
  calculateProvinces,
  calculateProvinceIncome,
  calculateProvinceUpkeep,
  recalculateAllProvinces,
} from '../provinces.js';
import type { Hex, GameState, Province } from '@conquest/shared';
import { TerrainType, UnitType, StructureType, GameStatus, UNIT_UPKEEP, UNIT_STRENGTH, STRUCTURE_STRENGTH } from '@conquest/shared';

// ── Helpers ──

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

function makeUnit(owner: string, q: number, r: number, type: UnitType = UnitType.PEASANT) {
  return {
    id: `unit-${q}-${r}`,
    type,
    owner,
    hex: { q, r },
    hasMoved: false,
    strength: UNIT_STRENGTH[type],
    upkeep: UNIT_UPKEEP[type],
  };
}

// ── calculateProvinces ──

describe('calculateProvinces', () => {
  it('groups connected hexes into a single province', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p1'),
      makeHex(0, 1, 'p1'),
      makeHex(2, 0, null),
    ];
    const provinces = calculateProvinces(hexes, 'p1');
    expect(provinces).toHaveLength(1);
    expect(provinces[0].hexes).toHaveLength(3);
    expect(provinces[0].owner).toBe('p1');
  });

  it('separates disconnected components into separate provinces', () => {
    // Two groups separated by a gap
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p1'),
      // gap at (2,0)
      makeHex(2, 0, null),
      makeHex(3, 0, 'p1'),
      makeHex(4, 0, 'p1'),
    ];
    const provinces = calculateProvinces(hexes, 'p1');
    expect(provinces).toHaveLength(2);
  });

  it('returns empty for player with no hexes', () => {
    const hexes: Hex[] = [makeHex(0, 0, 'p2')];
    const provinces = calculateProvinces(hexes, 'p1');
    expect(provinces).toHaveLength(0);
  });

  it('does not include hexes owned by other players', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p2'),
      makeHex(0, 1, 'p1'),
    ];
    const provinces = calculateProvinces(hexes, 'p1');
    // (0,0) and (0,1) are connected through adjacency but (1,0) is p2
    // They share the neighbor link through (q+1,r-1)=(1,-1) which isn't present.
    // (0,0) neighbors: (1,0) [p2], (-1,0), (0,1) [p1], (0,-1), (1,-1), (-1,1)
    // So (0,0) and (0,1) are connected via direct adjacency
    expect(provinces).toHaveLength(1);
    expect(provinces[0].hexes).toHaveLength(2);
  });
});

// ── calculateProvinceIncome ──

describe('calculateProvinceIncome', () => {
  it('counts non-tree hexes as 1 income each', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p1'),
      makeHex(0, 1, 'p1'),
    ];
    const province: Province = {
      id: 'prov-1',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
      owner: 'p1',
      gold: 0,
      income: 0,
      upkeep: 0,
    };
    const income = calculateProvinceIncome(province, hexes);
    expect(income).toBe(3);
  });

  it('tree hexes give 0 income', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1'),
      makeHex(1, 0, 'p1', { hasTree: true, terrain: TerrainType.FOREST }),
      makeHex(0, 1, 'p1', { hasTree: true, terrain: TerrainType.FOREST }),
    ];
    const province: Province = {
      id: 'prov-1',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
      owner: 'p1',
      gold: 0,
      income: 0,
      upkeep: 0,
    };
    const income = calculateProvinceIncome(province, hexes);
    expect(income).toBe(1); // only (0,0) counts
  });
});

// ── calculateProvinceUpkeep ──

describe('calculateProvinceUpkeep', () => {
  it('sums unit upkeep correctly', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', { unit: makeUnit('p1', 0, 0, UnitType.PEASANT) }),
      makeHex(1, 0, 'p1', { unit: makeUnit('p1', 1, 0, UnitType.SPEARMAN) }),
      makeHex(0, 1, 'p1'),
    ];
    const province: Province = {
      id: 'prov-1',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
      owner: 'p1',
      gold: 0,
      income: 0,
      upkeep: 0,
    };
    const upkeep = calculateProvinceUpkeep(province, hexes);
    expect(upkeep).toBe(UNIT_UPKEEP[UnitType.PEASANT] + UNIT_UPKEEP[UnitType.SPEARMAN]);
  });

  it('returns 0 when no units', () => {
    const hexes: Hex[] = [makeHex(0, 0, 'p1'), makeHex(1, 0, 'p1')];
    const province: Province = {
      id: 'prov-1',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      owner: 'p1',
      gold: 0,
      income: 0,
      upkeep: 0,
    };
    const upkeep = calculateProvinceUpkeep(province, hexes);
    expect(upkeep).toBe(0);
  });
});

// ── recalculateAllProvinces ──

describe('recalculateAllProvinces', () => {
  it('handles province splits with capital-based gold', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', {
        structure: {
          id: 'cap-1',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 0, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(1, 0, 'p1'),
      // gap
      makeHex(3, 0, 'p1'),
    ];
    const gameState = {
      hexes,
      provinces: [
        {
          id: 'old-prov',
          hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 3, r: 0 }],
          owner: 'p1',
          gold: 30,
          income: 3,
          upkeep: 0,
        },
      ],
      players: [{ id: 'p1', provinces: ['old-prov'] }],
    } as unknown as GameState;

    recalculateAllProvinces(gameState);

    expect(gameState.provinces).toHaveLength(2);
    // Capital fragment keeps all gold, other fragment gets 0
    const capitalProv = gameState.provinces.find((p) =>
      p.hexes.some((h) => h.q === 0 && h.r === 0),
    )!;
    expect(capitalProv.gold).toBe(30);
    const otherProv = gameState.provinces.find((p) =>
      p.hexes.some((h) => h.q === 3 && h.r === 0),
    )!;
    expect(otherProv.gold).toBe(0);
  });

  it('preserves gold for province with capital', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', {
        structure: {
          id: 'cap-1',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 0, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(1, 0, 'p1'),
      makeHex(0, 1, 'p1'),
      // disconnected
      makeHex(5, 0, 'p1'),
      makeHex(5, 1, 'p1'),
    ];
    const gameState = {
      hexes,
      provinces: [
        {
          id: 'old-prov',
          hexes: hexes.map((h) => h.coord),
          owner: 'p1',
          gold: 100,
          income: 5,
          upkeep: 0,
        },
      ],
      players: [{ id: 'p1', provinces: ['old-prov'] }],
    } as unknown as GameState;

    recalculateAllProvinces(gameState);

    // Capital province keeps 100, split fragment gets 0
    const capitalProv = gameState.provinces.find((p) =>
      p.hexes.some((h) => h.q === 0 && h.r === 0),
    )!;
    expect(capitalProv.gold).toBe(100);
  });

  it('recalculates income and upkeep', () => {
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', {
        unit: makeUnit('p1', 0, 0, UnitType.PEASANT),
      }),
      makeHex(1, 0, 'p1', {
        structure: {
          id: 'cap-1',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 1, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
      }),
      makeHex(0, 1, 'p1', { hasTree: true, terrain: TerrainType.FOREST }),
    ];
    const gameState = {
      hexes,
      provinces: [
        {
          id: 'old-prov',
          hexes: hexes.map((h) => h.coord),
          owner: 'p1',
          gold: 50,
          income: 0,
          upkeep: 0,
        },
      ],
      players: [{ id: 'p1', provinces: ['old-prov'] }],
    } as unknown as GameState;

    recalculateAllProvinces(gameState);

    expect(gameState.provinces).toHaveLength(1);
    const prov = gameState.provinces[0];
    expect(prov.income).toBe(2); // 3 hexes minus 1 tree
    expect(prov.upkeep).toBe(UNIT_UPKEEP[UnitType.PEASANT]);
    expect(prov.gold).toBe(50);
  });

  it('auto-placed capital clears trees on that hex', () => {
    // Province splits: the fragment without a capital has all tree hexes
    // The new capital should clear the tree on the hex it's placed on
    const hexes: Hex[] = [
      // Province A: has capital
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
      // Gap: neutral hex splits the territory
      makeHex(2, 0, null),
      // Province B: no capital, has trees
      makeHex(3, 0, 'p1', { hasTree: true }),
      makeHex(4, 0, 'p1', { hasTree: true }),
    ];
    const gameState = {
      hexes,
      provinces: [
        {
          id: 'old-prov-a',
          hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
          owner: 'p1',
          gold: 20,
          income: 2,
          upkeep: 0,
        },
        {
          id: 'old-prov-b',
          hexes: [{ q: 3, r: 0 }, { q: 4, r: 0 }],
          owner: 'p1',
          gold: 0,
          income: 0,
          upkeep: 0,
        },
      ],
      players: [{ id: 'p1', provinces: ['old-prov-a', 'old-prov-b'] }],
    } as unknown as GameState;

    recalculateAllProvinces(gameState);

    // Province B should get a new capital
    const provB = gameState.provinces.find((p) =>
      p.hexes.some((h) => h.q === 3 && h.r === 0),
    )!;
    // Find the hex with the new capital
    const capitalHex = hexes.find(
      (h) => (h.coord.q === 3 || h.coord.q === 4) && h.structure?.type === StructureType.CAPITAL,
    );
    expect(capitalHex).toBeDefined();
    // Tree should be cleared on the capital hex
    expect(capitalHex!.hasTree).toBe(false);
    // Province B income should reflect the cleared tree (1 income from capital hex)
    expect(provB.income).toBeGreaterThanOrEqual(1);
  });

  it('single-hex province with capital does NOT inherit gold from old province', () => {
    // Scenario: province shrinks from 3 hexes to 1 hex.
    // The surviving hex has the capital. It should NOT keep the old gold.
    const hexes: Hex[] = [
      makeHex(0, 0, 'p1', {
        structure: {
          id: 'cap1',
          type: StructureType.CAPITAL,
          owner: 'p1',
          hex: { q: 0, r: 0 },
          strength: STRUCTURE_STRENGTH[StructureType.CAPITAL],
        },
        unit: makeUnit('p1', 0, 0),
      }),
      // The other two hexes were captured by p2
      makeHex(1, 0, 'p2'),
      makeHex(0, 1, 'p2'),
    ];

    const oldProvince: Province = {
      id: 'old-prov',
      hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }],
      owner: 'p1',
      gold: 50,
      income: 3,
      upkeep: 2,
    };

    const gameState = {
      hexes,
      provinces: [oldProvince],
      players: [
        { id: 'p1', provinces: ['old-prov'], isEliminated: false },
        { id: 'p2', provinces: [], isEliminated: false },
      ],
    } as unknown as GameState;

    recalculateAllProvinces(gameState);

    const p1Province = gameState.provinces.find((p) => p.owner === 'p1');
    expect(p1Province).toBeDefined();
    // Single-hex province should get 0 gold, NOT 50 from old province
    expect(p1Province!.gold).toBe(0);
    // Capital should be removed from single-hex province
    expect(hexes[0].structure).toBeNull();
  });
});
