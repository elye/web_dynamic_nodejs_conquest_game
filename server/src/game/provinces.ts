import type { Hex, HexCoord, Province, GameState } from '@conquest/shared';
import { randomUUID } from 'node:crypto';
import { coordKey, getHexNeighbors } from './mapGenerator.js';

// ── Helpers ──

function buildHexLookup(hexes: Hex[]): Map<string, Hex> {
  const map = new Map<string, Hex>();
  for (const hex of hexes) {
    map.set(coordKey(hex.coord.q, hex.coord.r), hex);
  }
  return map;
}

// ── Income / Upkeep ──

export function calculateProvinceIncome(
  province: Province,
  hexes: Hex[],
): number {
  const lookup = buildHexLookup(hexes);
  let income = 0;
  for (const coord of province.hexes) {
    const hex = lookup.get(coordKey(coord.q, coord.r));
    if (hex && !hex.hasTree) {
      income += 1;
    }
  }
  return income;
}

export function calculateProvinceUpkeep(
  province: Province,
  hexes: Hex[],
): number {
  const lookup = buildHexLookup(hexes);
  let upkeep = 0;
  for (const coord of province.hexes) {
    const hex = lookup.get(coordKey(coord.q, coord.r));
    if (hex?.unit) {
      upkeep += hex.unit.upkeep;
    }
  }
  return upkeep;
}

// ── Province calculation ──

export function calculateProvinces(
  hexes: Hex[],
  playerId: string,
): Province[] {
  const lookup = buildHexLookup(hexes);
  const playerHexes = hexes.filter((h) => h.owner === playerId);
  const visited = new Set<string>();
  const provinces: Province[] = [];

  for (const hex of playerHexes) {
    const key = coordKey(hex.coord.q, hex.coord.r);
    if (visited.has(key)) continue;

    // BFS flood-fill for this connected component
    const component: HexCoord[] = [];
    const queue: HexCoord[] = [hex.coord];
    visited.add(key);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const n of getHexNeighbors(current.q, current.r)) {
        const nKey = coordKey(n.q, n.r);
        if (visited.has(nKey)) continue;
        const nHex = lookup.get(nKey);
        if (nHex && nHex.owner === playerId) {
          visited.add(nKey);
          queue.push(n);
        }
      }
    }

    const province: Province = {
      id: randomUUID(),
      hexes: component,
      owner: playerId,
      gold: 0,
      income: 0,
      upkeep: 0,
    };

    province.income = calculateProvinceIncome(province, hexes);
    province.upkeep = calculateProvinceUpkeep(province, hexes);
    provinces.push(province);
  }

  return provinces;
}

// ── Full recalculation ──

export function recalculateAllProvinces(gameState: GameState): void {
  const oldProvinces = gameState.provinces;
  const newProvinces: Province[] = [];

  const playerIds = new Set<string>();
  for (const hex of gameState.hexes) {
    if (hex.owner) playerIds.add(hex.owner);
  }

  for (const playerId of playerIds) {
    const playerProvinces = calculateProvinces(gameState.hexes, playerId);

    // Preserve treasury: distribute old gold proportionally by hex count
    const oldPlayerProvinces = oldProvinces.filter(
      (p) => p.owner === playerId,
    );
    const oldTotalGold = oldPlayerProvinces.reduce(
      (sum, p) => sum + p.gold,
      0,
    );
    const totalNewHexes = playerProvinces.reduce(
      (sum, p) => sum + p.hexes.length,
      0,
    );

    if (totalNewHexes > 0 && oldTotalGold > 0) {
      let distributed = 0;
      for (const province of playerProvinces) {
        province.gold = Math.floor(
          (oldTotalGold * province.hexes.length) / totalNewHexes,
        );
        distributed += province.gold;
      }
      // Give any rounding remainder to the largest province
      const remainder = oldTotalGold - distributed;
      if (remainder > 0) {
        playerProvinces.sort((a, b) => b.hexes.length - a.hexes.length);
        playerProvinces[0].gold += remainder;
      }
    }

    newProvinces.push(...playerProvinces);
  }

  gameState.provinces = newProvinces;
}
