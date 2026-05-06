import { describe, it, expect } from 'vitest';
import { generateMap, coordKey, hexDistance, getHexNeighbors } from '../mapGenerator.js';
import { TerrainType, UnitType } from '@conquest/shared';

// ── Helper utilities ──

describe('coordKey', () => {
  it('returns comma-separated q,r', () => {
    expect(coordKey(3, -2)).toBe('3,-2');
  });
});

describe('hexDistance', () => {
  it('returns 0 for same hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it('returns 1 for adjacent hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });

  it('returns correct distance for distant hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });
});

describe('getHexNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    const neighbors = getHexNeighbors(0, 0);
    expect(neighbors).toHaveLength(6);
  });

  it('all neighbors are distance 1 from origin', () => {
    const neighbors = getHexNeighbors(2, 3);
    for (const n of neighbors) {
      expect(hexDistance({ q: 2, r: 3 }, n)).toBe(1);
    }
  });
});

// ── Map generation ──

describe('generateMap', () => {
  it('generates a valid hex map with correct terrain types', () => {
    const hexes = generateMap('SMALL', 2);
    for (const hex of hexes) {
      expect(Object.values(TerrainType)).toContain(hex.terrain);
    }
  });

  it('contains water hexes at boundaries', () => {
    const hexes = generateMap('SMALL', 2);
    const waterHexes = hexes.filter((h) => h.terrain === TerrainType.WATER);
    expect(waterHexes.length).toBeGreaterThan(0);
  });

  it('contains land hexes (GRASS or FOREST)', () => {
    const hexes = generateMap('SMALL', 2);
    const landHexes = hexes.filter(
      (h) => h.terrain === TerrainType.GRASS || h.terrain === TerrainType.FOREST,
    );
    expect(landHexes.length).toBeGreaterThan(0);
  });

  it('player starting positions are placed correctly for 2 players', () => {
    const hexes = generateMap('SMALL', 2);
    const ownedHexes = hexes.filter((h) => h.owner !== null);
    const owners = new Set(ownedHexes.map((h) => h.owner));
    expect(owners.size).toBe(2);
  });

  it('player starting positions are placed correctly for 4 players', () => {
    const hexes = generateMap('MEDIUM', 4);
    const ownedHexes = hexes.filter((h) => h.owner !== null);
    const owners = new Set(ownedHexes.map((h) => h.owner));
    expect(owners.size).toBe(4);
  });

  it('each player gets a starting peasant unit', () => {
    const hexes = generateMap('SMALL', 2);
    const unitHexes = hexes.filter((h) => h.unit !== null);
    expect(unitHexes).toHaveLength(2);
    for (const hex of unitHexes) {
      expect(hex.unit!.type).toBe(UnitType.PEASANT);
    }
  });

  it('tree coverage is reasonable (~15% of neutral land)', () => {
    // Run multiple times to get average
    const samples = 5;
    let totalTreeRatio = 0;
    for (let i = 0; i < samples; i++) {
      const hexes = generateMap('MEDIUM', 2);
      const neutralLand = hexes.filter(
        (h) => h.terrain !== TerrainType.WATER && h.owner === null,
      );
      const treeLand = neutralLand.filter((h) => h.hasTree);
      if (neutralLand.length > 0) {
        totalTreeRatio += treeLand.length / neutralLand.length;
      }
    }
    const avgTreeRatio = totalTreeRatio / samples;
    // Allow a wide range due to randomness
    expect(avgTreeRatio).toBeGreaterThan(0.02);
    expect(avgTreeRatio).toBeLessThan(0.40);
  });

  it('different map sizes produce different hex counts', () => {
    const small = generateMap('SMALL', 2);
    const medium = generateMap('MEDIUM', 2);
    const large = generateMap('LARGE', 2);
    expect(medium.length).toBeGreaterThan(small.length);
    expect(large.length).toBeGreaterThan(medium.length);
  });

  it('forest terrain hexes have hasTree=true', () => {
    const hexes = generateMap('SMALL', 2);
    const forests = hexes.filter((h) => h.terrain === TerrainType.FOREST);
    for (const f of forests) {
      expect(f.hasTree).toBe(true);
    }
  });

  it('water hexes are not owned', () => {
    const hexes = generateMap('SMALL', 2);
    const waterHexes = hexes.filter((h) => h.terrain === TerrainType.WATER);
    for (const w of waterHexes) {
      expect(w.owner).toBeNull();
      expect(w.unit).toBeNull();
    }
  });
});
