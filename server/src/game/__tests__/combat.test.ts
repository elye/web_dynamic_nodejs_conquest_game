import { describe, it, expect } from 'vitest';
import { canCapture, getHexDefense, resolveCombat } from '../combat.js';
import type { Hex, Unit } from '@conquest/shared';
import {
  TerrainType,
  UnitType,
  StructureType,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
  STRUCTURE_STRENGTH,
} from '@conquest/shared';

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

function makeUnit(
  owner: string,
  q: number,
  r: number,
  type: UnitType = UnitType.PEASANT,
): Unit {
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

// ── getHexDefense ──

describe('getHexDefense', () => {
  it('returns unit strength as base defense', () => {
    const defender = makeUnit('p2', 1, 0, UnitType.SPEARMAN);
    const targetHex = makeHex(1, 0, 'p2', { unit: defender });
    const allHexes = [makeHex(0, 0), targetHex];
    expect(getHexDefense(targetHex, allHexes)).toBe(UNIT_STRENGTH[UnitType.SPEARMAN]);
  });

  it('returns 0 for empty unowned hex', () => {
    const targetHex = makeHex(1, 0);
    const allHexes = [targetHex];
    expect(getHexDefense(targetHex, allHexes)).toBe(0);
  });

  it('tower on hex adds +1', () => {
    const targetHex = makeHex(1, 0, 'p2', {
      structure: {
        id: 'tower-1',
        type: StructureType.TOWER,
        owner: 'p2',
        hex: { q: 1, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.TOWER],
      },
    });
    const allHexes = [makeHex(0, 0), targetHex];
    // No unit, just tower defense
    expect(getHexDefense(targetHex, allHexes)).toBe(STRUCTURE_STRENGTH[StructureType.TOWER]);
  });

  it('strong tower on hex adds +2', () => {
    const targetHex = makeHex(1, 0, 'p2', {
      structure: {
        id: 'stower-1',
        type: StructureType.STRONG_TOWER,
        owner: 'p2',
        hex: { q: 1, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.STRONG_TOWER],
      },
    });
    const allHexes = [makeHex(0, 0), targetHex];
    expect(getHexDefense(targetHex, allHexes)).toBe(STRUCTURE_STRENGTH[StructureType.STRONG_TOWER]);
  });

  it('adjacent tower adds to defense', () => {
    // Target hex at (1,0), adjacent tower at (0,0) owned by same player
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT),
    });
    const adjacentHex = makeHex(0, 0, 'p2', {
      structure: {
        id: 'tower-adj',
        type: StructureType.TOWER,
        owner: 'p2',
        hex: { q: 0, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.TOWER],
      },
    });
    const allHexes = [adjacentHex, targetHex];
    // Peasant(1) + adjacent tower(1) = 2
    expect(getHexDefense(targetHex, allHexes)).toBe(
      UNIT_STRENGTH[UnitType.PEASANT] + STRUCTURE_STRENGTH[StructureType.TOWER],
    );
  });

  it('enemy tower does not add to defense', () => {
    // Target hex owned by p2, adjacent tower owned by p1 (enemy)
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT),
    });
    const adjacentHex = makeHex(0, 0, 'p1', {
      structure: {
        id: 'tower-enemy',
        type: StructureType.TOWER,
        owner: 'p1',
        hex: { q: 0, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.TOWER],
      },
    });
    const allHexes = [adjacentHex, targetHex];
    // Only peasant defense, enemy tower doesn't help
    expect(getHexDefense(targetHex, allHexes)).toBe(UNIT_STRENGTH[UnitType.PEASANT]);
  });
});

// ── canCapture ──

describe('canCapture', () => {
  it('stronger unit beats weaker defender', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.SPEARMAN);
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT),
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    expect(canCapture(attacker, targetHex, allHexes)).toBe(true);
  });

  it('equal strength fails', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.PEASANT);
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT),
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    expect(canCapture(attacker, targetHex, allHexes)).toBe(false);
  });

  it('weaker attacker fails', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.PEASANT);
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.SPEARMAN),
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    expect(canCapture(attacker, targetHex, allHexes)).toBe(false);
  });

  it('can capture empty hex defended by tower when strong enough', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.SPEARMAN); // str 2
    const targetHex = makeHex(1, 0, 'p2', {
      structure: {
        id: 'tower-1',
        type: StructureType.TOWER,
        owner: 'p2',
        hex: { q: 1, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.TOWER], // 1
      },
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    expect(canCapture(attacker, targetHex, allHexes)).toBe(true);
  });

  it('cannot capture empty hex defended by tower when too weak', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.PEASANT); // str 1
    const targetHex = makeHex(1, 0, 'p2', {
      structure: {
        id: 'tower-1',
        type: StructureType.TOWER,
        owner: 'p2',
        hex: { q: 1, r: 0 },
        strength: STRUCTURE_STRENGTH[StructureType.TOWER], // 1
      },
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    expect(canCapture(attacker, targetHex, allHexes)).toBe(false);
  });
});

// ── resolveCombat ──

describe('resolveCombat', () => {
  it('attacker wins when stronger', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.BARON); // str 3
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT), // str 1
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    const result = resolveCombat(attacker, targetHex, allHexes);
    expect(result.success).toBe(true);
    expect(result.defenderDestroyed).toBe(true);
  });

  it('attacker fails when equal', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.PEASANT);
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.PEASANT),
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    const result = resolveCombat(attacker, targetHex, allHexes);
    expect(result.success).toBe(false);
    expect(result.defenderDestroyed).toBe(false);
  });

  it('attacker fails when weaker', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.PEASANT); // str 1
    const targetHex = makeHex(1, 0, 'p2', {
      unit: makeUnit('p2', 1, 0, UnitType.KNIGHT), // str 4
    });
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    const result = resolveCombat(attacker, targetHex, allHexes);
    expect(result.success).toBe(false);
    expect(result.defenderDestroyed).toBe(false);
  });

  it('defenderDestroyed is false when no defender unit present', () => {
    const attacker = makeUnit('p1', 0, 0, UnitType.SPEARMAN);
    const targetHex = makeHex(1, 0, 'p2'); // no unit
    const allHexes = [makeHex(0, 0, 'p1'), targetHex];
    const result = resolveCombat(attacker, targetHex, allHexes);
    expect(result.success).toBe(true);
    expect(result.defenderDestroyed).toBe(false); // no unit to destroy
  });
});
