import type { Hex, HexCoord, Province, GameState } from '@conquest/shared';
import { StructureType } from '@conquest/shared';
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
  const lookup = buildHexLookup(gameState.hexes);

  const playerIds = new Set<string>();
  for (const hex of gameState.hexes) {
    if (hex.owner) playerIds.add(hex.owner);
  }

  for (const playerId of playerIds) {
    const playerProvinces = calculateProvinces(gameState.hexes, playerId);

    // Build a set of old province hex→gold mappings to identify which new
    // province inherited the capital (and therefore the gold).
    const oldPlayerProvinces = oldProvinces.filter(
      (p) => p.owner === playerId,
    );

    // For each new province, find all capitals and sum gold from old provinces
    for (const province of playerProvinces) {
      // Find all capital hexes in this new province
      const capitalCoords: HexCoord[] = [];
      for (const coord of province.hexes) {
        const hex = lookup.get(coordKey(coord.q, coord.r));
        if (hex?.structure?.type === StructureType.CAPITAL && hex.structure.owner === playerId) {
          capitalCoords.push(coord);
        }
      }

      if (capitalCoords.length > 0) {
        // Sum gold from ALL old provinces that contributed hexes to this new province
        let totalGold = 0;
        const matchedOldProvIds = new Set<string>();
        for (const oldProv of oldPlayerProvinces) {
          const contributes = province.hexes.some((newCoord) =>
            oldProv.hexes.some((oldCoord) => oldCoord.q === newCoord.q && oldCoord.r === newCoord.r),
          );
          if (contributes && !matchedOldProvIds.has(oldProv.id)) {
            matchedOldProvIds.add(oldProv.id);
            totalGold += oldProv.gold;
          }
        }
        province.gold = totalGold;

        // If multiple capitals (from merged provinces), keep the one whose
        // old province had the most gold and remove the others
        if (capitalCoords.length > 1) {
          let bestCapital: HexCoord = capitalCoords[0];
          let bestGold = -1;
          for (const capCoord of capitalCoords) {
            // Find which old province this capital belonged to
            const oldProv = oldPlayerProvinces.find((op) =>
              op.hexes.some((h) => h.q === capCoord.q && h.r === capCoord.r),
            );
            const oldGold = oldProv?.gold ?? 0;
            if (oldGold > bestGold) {
              bestGold = oldGold;
              bestCapital = capCoord;
            }
          }
          // Remove all capitals except the best one
          for (const capCoord of capitalCoords) {
            if (capCoord.q === bestCapital.q && capCoord.r === bestCapital.r) continue;
            const hex = lookup.get(coordKey(capCoord.q, capCoord.r));
            if (hex) {
              hex.structure = null;
            }
          }
        }
      } else {
        // No capital — this is a split fragment. Gets 0 gold and a new capital.
        province.gold = 0;
        // Auto-place a capital if 2+ hexes
        if (province.hexes.length >= 2) {
          // Find an empty hex (no unit, no structure)
          let placed = false;
          for (const coord of province.hexes) {
            const hex = lookup.get(coordKey(coord.q, coord.r));
            if (hex && !hex.unit && !hex.structure) {
              hex.hasTree = false;
              hex.structure = {
                id: randomUUID(),
                type: StructureType.CAPITAL,
                owner: playerId,
                hex: coord,
                strength: 2,
              };
              placed = true;
              break;
            }
          }
          // If no completely empty hex, place on a hex with a unit but no structure
          if (!placed) {
            for (const coord of province.hexes) {
              const hex = lookup.get(coordKey(coord.q, coord.r));
              if (hex && !hex.structure) {
                hex.hasTree = false;
                hex.structure = {
                  id: randomUUID(),
                  type: StructureType.CAPITAL,
                  owner: playerId,
                  hex: coord,
                  strength: 2,
                };
                break;
              }
            }
          }
        }
      }
    }

    // Remove provinces with fewer than 2 hexes from having a capital
    // (single-hex provinces don't get capitals)
    for (const province of playerProvinces) {
      if (province.hexes.length < 2) {
        for (const coord of province.hexes) {
          const hex = lookup.get(coordKey(coord.q, coord.r));
          if (hex?.structure?.type === StructureType.CAPITAL) {
            hex.structure = null;
          }
        }
      }
    }

    newProvinces.push(...playerProvinces);
  }

  gameState.provinces = newProvinces;

  // Recalculate income/upkeep after capital placement may have cleared trees
  for (const province of gameState.provinces) {
    province.income = calculateProvinceIncome(province, gameState.hexes);
    province.upkeep = calculateProvinceUpkeep(province, gameState.hexes);
  }
}
