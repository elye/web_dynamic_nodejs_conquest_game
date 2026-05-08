import type { Hex, HexCoord, Province, GameState } from '@conquest/shared';
import { StructureType, TerrainType, STRUCTURE_STRENGTH } from '@conquest/shared';
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
      // Farmhouse provides x2 income on its hex
      if (hex.structure?.type === StructureType.FARMHOUSE) {
        income += 2;
      } else {
        income += 1;
      }
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

    const oldPlayerProvinces = oldProvinces.filter(
      (p) => p.owner === playerId,
    );

    // First: remove capitols from single-hex provinces BEFORE gold distribution
    for (const province of playerProvinces) {
      if (province.hexes.length < 2) {
        for (const coord of province.hexes) {
          const hex = lookup.get(coordKey(coord.q, coord.r));
          if (hex?.structure?.isCapitol) {
            hex.structure.isCapitol = false;
          }
        }
      }
    }

    // For each new province, find all capitols and sum gold from old provinces
    for (const province of playerProvinces) {
      // Find all capitol hexes in this new province
      const capitolCoords: HexCoord[] = [];
      for (const coord of province.hexes) {
        const hex = lookup.get(coordKey(coord.q, coord.r));
        if (hex?.structure?.isCapitol && hex.structure.owner === playerId) {
          capitolCoords.push(coord);
        }
      }

      if (capitolCoords.length > 0) {
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

        // If multiple capitols (from merged provinces), keep the one whose
        // old province had the most gold and clear isCapitol from others
        if (capitolCoords.length > 1) {
          let bestCapitol: HexCoord = capitolCoords[0];
          let bestGold = -1;
          for (const capCoord of capitolCoords) {
            const oldProv = oldPlayerProvinces.find((op) =>
              op.hexes.some((h) => h.q === capCoord.q && h.r === capCoord.r),
            );
            const oldGold = oldProv?.gold ?? 0;
            if (oldGold > bestGold) {
              bestGold = oldGold;
              bestCapitol = capCoord;
            }
          }
          // Remove capitol flag from all except the best one (keep the structure)
          for (const capCoord of capitolCoords) {
            if (capCoord.q === bestCapitol.q && capCoord.r === bestCapitol.r) continue;
            const hex = lookup.get(coordKey(capCoord.q, capCoord.r));
            if (hex?.structure) {
              hex.structure.isCapitol = false;
            }
          }
        }
      } else {
        // No capitol — this is a split fragment. Gets 0 gold and needs a new capitol.
        province.gold = 0;
        if (province.hexes.length >= 2) {
          // Try to promote the strongest existing structure to capitol first
          const structureStrengthOrder = [StructureType.CASTLE, StructureType.TOWER, StructureType.FARMHOUSE];
          let promoted = false;

          for (const sType of structureStrengthOrder) {
            if (promoted) break;
            for (const coord of province.hexes) {
              const hex = lookup.get(coordKey(coord.q, coord.r));
              if (hex?.structure?.type === sType && hex.structure.owner === playerId) {
                hex.structure.isCapitol = true;
                promoted = true;
                break;
              }
            }
          }

          // If no existing structure, place a new Farmhouse capitol
          if (!promoted) {
            const waterScore = (coord: HexCoord): number => {
              let score = 0;
              for (const n of getHexNeighbors(coord.q, coord.r)) {
                const nHex = lookup.get(coordKey(n.q, n.r));
                if (!nHex || nHex.terrain === TerrainType.WATER) {
                  score++;
                }
              }
              return score;
            };

            // Collect empty hex candidates (no unit, no structure)
            const emptyCandidates: HexCoord[] = [];
            for (const coord of province.hexes) {
              const hex = lookup.get(coordKey(coord.q, coord.r));
              if (hex && !hex.unit && !hex.structure) {
                emptyCandidates.push(coord);
              }
            }

            let placed = false;
            if (emptyCandidates.length > 0) {
              let bestCoord = emptyCandidates[0];
              let bestScore = waterScore(bestCoord);
              for (let i = 1; i < emptyCandidates.length; i++) {
                const s = waterScore(emptyCandidates[i]);
                if (s > bestScore) {
                  bestScore = s;
                  bestCoord = emptyCandidates[i];
                }
              }
              const hex = lookup.get(coordKey(bestCoord.q, bestCoord.r))!;
              hex.hasTree = false;
              hex.structure = {
                id: randomUUID(),
                type: StructureType.FARMHOUSE,
                owner: playerId,
                hex: bestCoord,
                strength: STRUCTURE_STRENGTH[StructureType.FARMHOUSE],
                isCapitol: true,
              };
              placed = true;
            }

            // If no completely empty hex, place on a hex with a unit but no structure
            if (!placed) {
              const unitCandidates: HexCoord[] = [];
              for (const coord of province.hexes) {
                const hex = lookup.get(coordKey(coord.q, coord.r));
                if (hex && !hex.structure) {
                  unitCandidates.push(coord);
                }
              }
              if (unitCandidates.length > 0) {
                let bestCoord = unitCandidates[0];
                let bestScore = waterScore(bestCoord);
                for (let i = 1; i < unitCandidates.length; i++) {
                  const s = waterScore(unitCandidates[i]);
                  if (s > bestScore) {
                    bestScore = s;
                    bestCoord = unitCandidates[i];
                  }
                }
                const hex = lookup.get(coordKey(bestCoord.q, bestCoord.r))!;
                hex.hasTree = false;
                hex.structure = {
                  id: randomUUID(),
                  type: StructureType.FARMHOUSE,
                  owner: playerId,
                  hex: bestCoord,
                  strength: STRUCTURE_STRENGTH[StructureType.FARMHOUSE],
                  isCapitol: true,
                };
              }
            }
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
