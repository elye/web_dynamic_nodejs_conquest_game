import {
  type GameState,
  type Hex,
  type HexCoord,
  type Province,
  type Unit,
  AiDifficulty,
  GameStatus,
  UnitType,
  StructureType,
  TerrainType,
  UNIT_COST,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
  STRUCTURE_COST,
  ServerMessageType,
} from '@conquest/shared';
import {
  getGameState,
  moveUnit,
  buyUnit,
  buildStructure,
  retireUnit,
  endTurn,
} from '../game/engine.js';
import { coordKey, getHexNeighbors, hexDistance } from '../game/mapGenerator.js';
import { canCapture, getHexDefense } from '../game/combat.js';
import { broadcastToGame, startTurnTimer } from '../ws/handler.js';

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  return delay(500 + Math.random() * 1000);
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildHexLookup(hexes: Hex[]): Map<string, Hex> {
  const map = new Map<string, Hex>();
  for (const hex of hexes) {
    map.set(coordKey(hex.coord.q, hex.coord.r), hex);
  }
  return map;
}

function findProvinceForHex(
  provinces: Province[],
  coord: HexCoord,
  owner: string,
): Province | undefined {
  return provinces.find(
    (p) =>
      p.owner === owner &&
      p.hexes.some((h) => h.q === coord.q && h.r === coord.r),
  );
}

// ── Analysis Helpers ──

interface UnitMove {
  unitId: string;
  from: HexCoord;
  to: HexCoord;
}

function getPlayerUnits(gameState: GameState, playerId: string): { unit: Unit; hex: Hex }[] {
  const results: { unit: Unit; hex: Hex }[] = [];
  for (const hex of gameState.hexes) {
    if (hex.unit && hex.unit.owner === playerId && !hex.unit.hasMoved) {
      results.push({ unit: hex.unit, hex });
    }
  }
  return results;
}

function getValidMoves(gameState: GameState, playerId: string): UnitMove[] {
  const moves: UnitMove[] = [];
  const lookup = buildHexLookup(gameState.hexes);
  const units = getPlayerUnits(gameState, playerId);

  for (const { unit, hex: sourceHex } of units) {
    const neighbors = getHexNeighbors(sourceHex.coord.q, sourceHex.coord.r);
    for (const nc of neighbors) {
      const targetHex = lookup.get(coordKey(nc.q, nc.r));
      if (!targetHex || targetHex.terrain === TerrainType.WATER) continue;

      // Check if we can actually move there
      if (targetHex.owner === playerId) {
        // Own structure — can't land on it, but can jump through to adjacent tiles
        if (targetHex.structure) {
          // Jump through: find tiles adjacent to both the structure and not the source
          const structNeighbors = getHexNeighbors(nc.q, nc.r);
          for (const sn of structNeighbors) {
            if (sn.q === sourceHex.coord.q && sn.r === sourceHex.coord.r) continue;
            const jumpTarget = lookup.get(coordKey(sn.q, sn.r));
            if (!jumpTarget || jumpTarget.terrain === TerrainType.WATER) continue;
            if (jumpTarget.owner === playerId && jumpTarget.structure) continue;
            if (jumpTarget.owner === playerId && !jumpTarget.unit) {
              moves.push({ unitId: unit.id, from: sourceHex.coord, to: sn });
            } else if (jumpTarget.owner === null) {
              moves.push({ unitId: unit.id, from: sourceHex.coord, to: sn });
            } else if (jumpTarget.owner !== playerId) {
              if (canCapture(unit, jumpTarget, gameState.hexes)) {
                moves.push({ unitId: unit.id, from: sourceHex.coord, to: sn });
              }
            }
          }
          continue;
        }
        // Can move to own territory if no unit or mergeable
        if (!targetHex.unit) {
          moves.push({ unitId: unit.id, from: sourceHex.coord, to: nc });
        }
        // Skip merge moves in valid moves enumeration — handled by buyUnit
      } else if (targetHex.owner === null) {
        // Neutral territory — always valid
        moves.push({ unitId: unit.id, from: sourceHex.coord, to: nc });
      } else {
        // Enemy territory — check if we can capture
        if (canCapture(unit, targetHex, gameState.hexes)) {
          moves.push({ unitId: unit.id, from: sourceHex.coord, to: nc });
        }
      }
    }
  }

  return moves;
}

function getBorderHexes(gameState: GameState, playerId: string): Hex[] {
  const lookup = buildHexLookup(gameState.hexes);
  const borders: Hex[] = [];

  for (const hex of gameState.hexes) {
    if (hex.owner !== playerId) continue;
    const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
    const isBorder = neighbors.some((nc) => {
      const neighbor = lookup.get(coordKey(nc.q, nc.r));
      return neighbor && neighbor.terrain !== TerrainType.WATER && neighbor.owner !== playerId;
    });
    if (isBorder) {
      borders.push(hex);
    }
  }

  return borders;
}

function getAffordableUnits(province: Province): UnitType[] {
  const affordable: UnitType[] = [];
  for (const unitType of [UnitType.PEASANT, UnitType.SPEARMAN, UnitType.BARON, UnitType.KNIGHT]) {
    if (province.gold >= UNIT_COST[unitType]) {
      affordable.push(unitType);
    }
  }
  return affordable;
}

function evaluateHexValue(hex: Hex, gameState: GameState, playerId: string): number {
  const lookup = buildHexLookup(gameState.hexes);
  let value = 0;

  // Base income value
  if (!hex.hasTree) {
    value += 1;
  }

  // Border pressure: how many of our hexes does this border?
  const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
  let ownNeighborCount = 0;
  let enemyNeighborCount = 0;

  for (const nc of neighbors) {
    const neighbor = lookup.get(coordKey(nc.q, nc.r));
    if (!neighbor || neighbor.terrain === TerrainType.WATER) continue;
    if (neighbor.owner === playerId) {
      ownNeighborCount++;
    } else if (neighbor.owner !== null) {
      enemyNeighborCount++;
    }
  }

  // More adjacent own hexes = more valuable (fills gaps, connects provinces)
  value += ownNeighborCount * 2;

  // Province merging potential — if capturing this could merge two provinces
  const adjacentProvinceIds = new Set<string>();
  for (const nc of neighbors) {
    const neighbor = lookup.get(coordKey(nc.q, nc.r));
    if (neighbor && neighbor.owner === playerId) {
      const prov = findProvinceForHex(gameState.provinces, nc, playerId);
      if (prov) adjacentProvinceIds.add(prov.id);
    }
  }
  if (adjacentProvinceIds.size > 1) {
    value += 10; // Province merger is very valuable
  }

  // Enemy splitting potential — could this split an enemy province?
  if (hex.owner !== null && hex.owner !== playerId) {
    value += 3;
    // Check if this hex connects different enemy hex clusters
    const enemyOwner = hex.owner;
    const enemyNeighbors = neighbors.filter((nc) => {
      const n = lookup.get(coordKey(nc.q, nc.r));
      return n && n.owner === enemyOwner;
    });
    if (enemyNeighbors.length >= 2) {
      value += 5; // Potential province split
    }
  }

  return value;
}

function findWeakEnemyHexes(gameState: GameState, playerId: string): { hex: Hex; defense: number }[] {
  const lookup = buildHexLookup(gameState.hexes);
  const weakHexes: { hex: Hex; defense: number }[] = [];

  for (const hex of gameState.hexes) {
    if (hex.owner === null || hex.owner === playerId) continue;
    if (hex.terrain === TerrainType.WATER) continue;

    // Must be adjacent to one of our hexes
    const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
    const adjacentToUs = neighbors.some((nc) => {
      const n = lookup.get(coordKey(nc.q, nc.r));
      return n && n.owner === playerId;
    });
    if (!adjacentToUs) continue;

    const defense = getHexDefense(hex, gameState.hexes);
    weakHexes.push({ hex, defense });
  }

  weakHexes.sort((a, b) => a.defense - b.defense);
  return weakHexes;
}

function getEmptyOwnedHexes(gameState: GameState, playerId: string): Hex[] {
  return gameState.hexes.filter(
    (h) =>
      h.owner === playerId &&
      !h.unit &&
      (!h.structure || h.structure.isCapitol) &&
      h.terrain !== TerrainType.WATER,
  );
}

function findCapitalHexes(gameState: GameState, playerId: string): Hex[] {
  return gameState.hexes.filter(
    (h) =>
      h.structure?.isCapitol &&
      h.structure.owner === playerId,
  );
}

function findEnemyCapitalHexes(gameState: GameState, playerId: string): Hex[] {
  return gameState.hexes.filter(
    (h) =>
      h.structure?.isCapitol &&
      h.structure.owner !== playerId &&
      h.owner !== playerId &&
      h.owner !== null,
  );
}

// ── Broadcast helper ──

function broadcastDelta(gameState: GameState): void {
  broadcastToGame(gameState.id, {
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
}

// ── Easy AI ──

async function playEasyTurn(gameState: GameState, playerId: string): Promise<void> {
  // Buy random units (sometimes skip)
  if (Math.random() > 0.3) {
    const provinces = gameState.provinces.filter((p) => p.owner === playerId);
    for (const province of provinces) {
      const affordable = getAffordableUnits(province);
      if (affordable.length === 0) continue;
      if (Math.random() > 0.5) continue; // Sometimes skip

      const unitType = randomElement(affordable);
      const emptyHexes = province.hexes
        .map((c) => gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r))
        .filter((h): h is Hex => !!h && !h.unit && !h.structure);

      if (emptyHexes.length === 0) continue;

      const targetHex = randomElement(emptyHexes);
      try {
        buyUnit(gameState, playerId, unitType, targetHex.coord);
        broadcastDelta(gameState);
        await randomDelay();
      } catch {
        // Invalid buy — skip
      }
    }
  }

  // Move units randomly
  const moves = getValidMoves(gameState, playerId);
  const shuffled = [...moves].sort(() => Math.random() - 0.5);

  for (const move of shuffled.slice(0, Math.min(shuffled.length, 5))) {
    try {
      moveUnit(gameState, playerId, move.unitId, move.to);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Invalid move — skip
    }
  }
}

// ── Medium AI ──

async function playMediumTurn(gameState: GameState, playerId: string): Promise<void> {
  const lookup = buildHexLookup(gameState.hexes);

  // Buy cheap units for expansion — avoid bankruptcy
  const provinces = gameState.provinces.filter((p) => p.owner === playerId);
  for (const province of provinces) {
    const projectedBalance = province.gold + province.income - province.upkeep;
    if (projectedBalance < UNIT_COST[UnitType.PEASANT]) continue;

    const affordable = getAffordableUnits(province);
    if (affordable.length === 0) continue;

    // Buy Peasants for expansion (cheapest)
    const unitType = UnitType.PEASANT;
    if (province.gold < UNIT_COST[unitType]) continue;

    // Check upkeep won't bankrupt: province needs positive balance after new unit
    const newUpkeep = province.upkeep + UNIT_UPKEEP[unitType];
    if (province.gold - UNIT_COST[unitType] + province.income - newUpkeep < 0) continue;

    // Place on border hexes if possible
    const borderCoords = province.hexes.filter((c) => {
      const hex = gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r);
      if (!hex || hex.unit || hex.structure) return false;
      const neighbors = getHexNeighbors(c.q, c.r);
      return neighbors.some((nc) => {
        const n = lookup.get(coordKey(nc.q, nc.r));
        return n && n.terrain !== TerrainType.WATER && n.owner !== playerId;
      });
    });

    const emptyHexes = province.hexes
      .map((c) => gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r))
      .filter((h): h is Hex => !!h && !h.unit && !h.structure);

    const placementHex = borderCoords.length > 0
      ? gameState.hexes.find(
          (h) => h.coord.q === borderCoords[0].q && h.coord.r === borderCoords[0].r,
        )
      : emptyHexes[0];

    if (!placementHex) continue;

    try {
      buyUnit(gameState, playerId, unitType, placementHex.coord);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Skip
    }
  }

  // Build towers on border hexes
  const borderHexes = getBorderHexes(gameState, playerId);

  // Retire units in provinces about to go bankrupt (upkeep > income + gold)
  for (const province of provinces) {
    while (province.upkeep > province.income + province.gold) {
      // Find the weakest unit in this province
      const provinceUnits = province.hexes
        .map((c) => gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r))
        .filter((h): h is Hex => !!h && !!h.unit && h.unit.owner === playerId)
        .sort((a, b) => UNIT_STRENGTH[a.unit!.type] - UNIT_STRENGTH[b.unit!.type]);

      if (provinceUnits.length === 0) break;

      try {
        retireUnit(gameState, playerId, provinceUnits[0].unit!.id);
        broadcastDelta(gameState);
        await randomDelay();
      } catch {
        break;
      }
    }
  }

  for (const hex of borderHexes) {
    if (hex.unit || hex.structure) continue;

    const province = findProvinceForHex(gameState.provinces, hex.coord, playerId);
    if (!province || province.gold < STRUCTURE_COST[StructureType.TOWER]) continue;

    // Only build if we can afford it without going negative
    if (province.gold - STRUCTURE_COST[StructureType.TOWER] < 0) continue;

    // Only build one tower per turn
    try {
      buildStructure(gameState, playerId, StructureType.TOWER, hex.coord);
      broadcastDelta(gameState);
      await randomDelay();
      break;
    } catch {
      // Skip
    }
  }

  // Move units toward nearest unowned/enemy land
  const moves = getValidMoves(gameState, playerId);

  // Prioritize moves toward non-owned hexes, and also prioritize enemy capitals
  const enemyCapitals = findEnemyCapitalHexes(gameState, playerId);
  const scored = moves.map((move) => {
    const targetHex = lookup.get(coordKey(move.to.q, move.to.r));
    let score = 0;
    if (targetHex) {
      if (targetHex.owner === null) score = 5; // Neutral expansion
      else if (targetHex.owner !== playerId) {
        score = 8; // Enemy capture
        // Bonus for attacking enemy capitals
        if (targetHex.structure?.isCapitol) {
          score += 10;
          // Extra bonus proportional to province gold (every 5 gold = +1)
          const province = gameState.provinces.find((p) =>
            p.hexes.some((h) => h.q === move.to.q && h.r === move.to.r)
          );
          if (province) score += Math.floor(province.gold / 5);
        }
      }
      else score = 1; // Own territory repositioning
    }
    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const executed = new Set<string>();
  for (const { move } of scored) {
    if (executed.has(move.unitId)) continue;

    try {
      moveUnit(gameState, playerId, move.unitId, move.to);
      executed.add(move.unitId);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Skip
    }
  }
}

// ── Hard AI ──

async function playHardTurn(gameState: GameState, playerId: string): Promise<void> {
  const lookup = buildHexLookup(gameState.hexes);

  // 1. Save provinces at risk of bankruptcy — don't buy if going bankrupt
  const provinces = gameState.provinces.filter((p) => p.owner === playerId);

  // Retire units in provinces about to go bankrupt — prefer isolated/non-border units
  for (const province of provinces) {
    while (province.upkeep > province.income + province.gold) {
      const provinceUnits = province.hexes
        .map((c) => gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r))
        .filter((h): h is Hex => !!h && !!h.unit && h.unit.owner === playerId);

      if (provinceUnits.length === 0) break;

      // Score units: prefer retiring isolated/non-border units first
      const scored = provinceUnits.map((h) => {
        const neighbors = getHexNeighbors(h.coord.q, h.coord.r);
        const nearBorder = neighbors.some((nc) => {
          const n = lookup.get(coordKey(nc.q, nc.r));
          return n && n.terrain !== TerrainType.WATER && n.owner !== playerId && n.owner !== null;
        });
        // Lower score = retire first: weak units far from borders
        let score = UNIT_STRENGTH[h.unit!.type] * 10;
        if (nearBorder) score += 50; // Keep border units
        return { hex: h, score };
      });
      scored.sort((a, b) => a.score - b.score);

      try {
        retireUnit(gameState, playerId, scored[0].hex.unit!.id);
        broadcastDelta(gameState);
        await randomDelay();
      } catch {
        break;
      }
    }
  }

  // 2. Buy units strategically
  for (const province of provinces) {
    const projectedBalance = province.gold + province.income - province.upkeep;

    // Don't buy if province will go bankrupt next turn
    if (projectedBalance <= 0) continue;

    const borderCoords = province.hexes.filter((c) => {
      const hex = gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r);
      if (!hex || hex.unit || hex.structure) return false;
      const neighbors = getHexNeighbors(c.q, c.r);
      return neighbors.some((nc) => {
        const n = lookup.get(coordKey(nc.q, nc.r));
        return n && n.terrain !== TerrainType.WATER && n.owner !== playerId;
      });
    });

    const isFrontline = borderCoords.length > 0;
    const weakEnemies = findWeakEnemyHexes(gameState, playerId);
    const hasNearbyThreats = weakEnemies.some(
      (w) =>
        w.defense >= 2 &&
        province.hexes.some((c) => hexDistance(c, w.hex.coord) <= 2),
    );

    // Determine best unit to buy
    let desiredUnit = UnitType.PEASANT;
    if (isFrontline && hasNearbyThreats) {
      // Buy strongest affordable unit for border defense
      const affordable = getAffordableUnits(province);
      if (affordable.length > 0) {
        // Pick strongest that won't bankrupt us
        for (const ut of [UnitType.KNIGHT, UnitType.BARON, UnitType.SPEARMAN, UnitType.PEASANT]) {
          if (
            affordable.includes(ut) &&
            province.gold - UNIT_COST[ut] + province.income - province.upkeep - UNIT_UPKEEP[ut] >= 0
          ) {
            desiredUnit = ut;
            break;
          }
        }
      }
    }

    if (province.gold < UNIT_COST[desiredUnit]) continue;
    const newUpkeep = province.upkeep + UNIT_UPKEEP[desiredUnit];
    if (province.gold - UNIT_COST[desiredUnit] + province.income - newUpkeep < 0) continue;

    // Place on best border hex (highest value target neighbor)
    let bestPlacement: Hex | undefined;
    let bestValue = -Infinity;

    for (const c of borderCoords) {
      const hex = gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r);
      if (!hex) continue;

      const neighbors = getHexNeighbors(c.q, c.r);
      let maxNeighborValue = 0;
      for (const nc of neighbors) {
        const n = lookup.get(coordKey(nc.q, nc.r));
        if (n && n.owner !== playerId && n.terrain !== TerrainType.WATER) {
          maxNeighborValue = Math.max(maxNeighborValue, evaluateHexValue(n, gameState, playerId));
        }
      }
      if (maxNeighborValue > bestValue) {
        bestValue = maxNeighborValue;
        bestPlacement = hex;
      }
    }

    // Fallback: any empty hex
    if (!bestPlacement) {
      const emptyHexes = province.hexes
        .map((c) => gameState.hexes.find((h) => h.coord.q === c.q && h.coord.r === c.r))
        .filter((h): h is Hex => !!h && !h.unit && !h.structure);
      if (emptyHexes.length > 0) bestPlacement = emptyHexes[0];
    }

    if (!bestPlacement) continue;

    try {
      buyUnit(gameState, playerId, desiredUnit, bestPlacement.coord);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Skip
    }
  }

  // 3. Move units strategically
  const moves = getValidMoves(gameState, playerId);
  const weakEnemyHexes = findWeakEnemyHexes(gameState, playerId);
  const enemyCapitals = findEnemyCapitalHexes(gameState, playerId);

  const scored = moves.map((move) => {
    const targetHex = lookup.get(coordKey(move.to.q, move.to.r));
    if (!targetHex) return { move, score: 0 };

    let score = 0;

    if (targetHex.owner !== null && targetHex.owner !== playerId) {
      // Attacking enemy
      const value = evaluateHexValue(targetHex, gameState, playerId);
      const defense = getHexDefense(targetHex, gameState.hexes);
      const sourceHex = gameState.hexes.find((h) => h.unit?.id === move.unitId);
      const attackStrength = sourceHex?.unit?.strength ?? 0;

      if (attackStrength > defense) {
        score = 15 + value;
        // Bonus for weak enemies
        if (defense === 0) score += 5;
        // HIGH bonus for capturing enemy capitals
        if (targetHex.structure?.isCapitol) {
          score += 25;
          // Extra bonus proportional to province gold (every 3 gold = +1)
          const province = gameState.provinces.find((p) =>
            p.hexes.some((h) => h.q === move.to.q && h.r === move.to.r)
          );
          if (province) score += Math.floor(province.gold / 3);
        }
        // Bonus for province splitting
        const enemyOwner = targetHex.owner;
        const enemyNeighbors = getHexNeighbors(move.to.q, move.to.r).filter((nc) => {
          const n = lookup.get(coordKey(nc.q, nc.r));
          return n && n.owner === enemyOwner;
        });
        if (enemyNeighbors.length >= 3) score += 8;
      }
    } else if (targetHex.owner === null) {
      // Neutral expansion
      score = 5 + evaluateHexValue(targetHex, gameState, playerId);
    } else {
      // Own territory — reposition toward border
      const neighbors = getHexNeighbors(move.to.q, move.to.r);
      const isNowBorder = neighbors.some((nc) => {
        const n = lookup.get(coordKey(nc.q, nc.r));
        return n && n.terrain !== TerrainType.WATER && n.owner !== playerId;
      });
      score = isNowBorder ? 3 : 1;
    }

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const executed = new Set<string>();
  for (const { move, score } of scored) {
    if (executed.has(move.unitId)) continue;
    if (score <= 0) continue;

    try {
      moveUnit(gameState, playerId, move.unitId, move.to);
      executed.add(move.unitId);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Skip
    }
  }

  // 4. Build defensive towers on strategic border hexes
  const borderHexes = getBorderHexes(gameState, playerId);
  const towerCandidates = borderHexes
    .filter((h) => !h.unit && !h.structure)
    .map((h) => {
      const neighbors = getHexNeighbors(h.coord.q, h.coord.r);
      let ownNeighbors = 0;
      let enemyNeighbors = 0;
      for (const nc of neighbors) {
        const n = lookup.get(coordKey(nc.q, nc.r));
        if (!n || n.terrain === TerrainType.WATER) continue;
        if (n.owner === playerId) ownNeighbors++;
        else if (n.owner !== null) enemyNeighbors++;
      }
      // Bottleneck: many own neighbors but also enemy neighbors = important defense point
      const strategic = ownNeighbors * 2 + enemyNeighbors * 3;
      return { hex: h, score: strategic };
    })
    .sort((a, b) => b.score - a.score);

  for (const candidate of towerCandidates.slice(0, 2)) {
    const province = findProvinceForHex(gameState.provinces, candidate.hex.coord, playerId);
    if (!province) continue;

    const structureType =
      province.gold >= STRUCTURE_COST[StructureType.CASTLE] && candidate.score >= 8
        ? StructureType.CASTLE
        : StructureType.TOWER;

    if (province.gold < STRUCTURE_COST[structureType]) continue;

    try {
      buildStructure(gameState, playerId, structureType, candidate.hex.coord);
      broadcastDelta(gameState);
      await randomDelay();
    } catch {
      // Skip
    }
  }

  // 5. Merge units for tougher opponents (buy onto existing units)
  const playerUnits = getPlayerUnits(gameState, playerId);
  for (const { unit, hex } of playerUnits) {
    if (unit.type === UnitType.KNIGHT) continue; // Already max

    const province = findProvinceForHex(gameState.provinces, hex.coord, playerId);
    if (!province) continue;

    // Only merge on frontline hexes facing strong enemies
    const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
    const facesStrongEnemy = neighbors.some((nc) => {
      const n = lookup.get(coordKey(nc.q, nc.r));
      return n && n.owner !== null && n.owner !== playerId && getHexDefense(n, gameState.hexes) >= unit.strength;
    });

    if (!facesStrongEnemy) continue;

    // Try to merge with a Peasant
    if (province.gold >= UNIT_COST[UnitType.PEASANT]) {
      const newUpkeep = province.upkeep - unit.upkeep; // Old unit upkeep removed after merge
      const mergedUpkeep = UNIT_UPKEEP[unit.type === UnitType.PEASANT ? UnitType.SPEARMAN : unit.type === UnitType.SPEARMAN ? UnitType.BARON : UnitType.KNIGHT];
      if (province.gold - UNIT_COST[UnitType.PEASANT] + province.income - newUpkeep - mergedUpkeep >= 0) {
        try {
          buyUnit(gameState, playerId, UnitType.PEASANT, hex.coord);
          broadcastDelta(gameState);
          await randomDelay();
        } catch {
          // Skip
        }
      }
    }
  }
}

// ── Main Entry Point ──

export async function playAITurn(gameId: string, playerId: string): Promise<void> {
  const gameState = getGameState(gameId);
  if (!gameState) return;
  if (gameState.status !== GameStatus.IN_PROGRESS) return;
  if (gameState.currentTurnPlayerId !== playerId) return;

  const player = gameState.players.find((p) => p.id === playerId);
  if (!player || !player.isAI || player.isEliminated) return;

  const difficulty = player.aiDifficulty ?? AiDifficulty.EASY;

  try {
    switch (difficulty) {
      case AiDifficulty.EASY:
        await playEasyTurn(gameState, playerId);
        break;
      case AiDifficulty.MEDIUM:
        await playMediumTurn(gameState, playerId);
        break;
      case AiDifficulty.HARD:
        await playHardTurn(gameState, playerId);
        break;
    }

    // End the AI's turn
    if (gameState.status === GameStatus.IN_PROGRESS && gameState.currentTurnPlayerId === playerId) {
      endTurn(gameState);

      broadcastToGame(gameId, {
        type: ServerMessageType.TURN_CHANGED,
        playerId: gameState.currentTurnPlayerId!,
        turnNumber: gameState.turnNumber,
      });

      broadcastDelta(gameState);

      // Restart turn timer for the next player
      if (gameState.status === GameStatus.IN_PROGRESS) {
        startTurnTimer(gameState, gameId);
      }
    }
  } catch {
    // If AI errors, just end turn to avoid blocking the game
    try {
      if (gameState.status === GameStatus.IN_PROGRESS && gameState.currentTurnPlayerId === playerId) {
        endTurn(gameState);

        broadcastToGame(gameId, {
          type: ServerMessageType.TURN_CHANGED,
          playerId: gameState.currentTurnPlayerId!,
          turnNumber: gameState.turnNumber,
        });

        broadcastDelta(gameState);

        // Restart turn timer for the next player
        if (gameState.status === GameStatus.IN_PROGRESS) {
          startTurnTimer(gameState, gameId);
        }
      }
    } catch {
      // Game may have ended
    }
  }
}

/**
 * Schedule an AI turn if the current player is AI.
 * Called after endTurn or game start.
 */
export function scheduleAITurnIfNeeded(gameState: GameState): void {
  if (gameState.status !== GameStatus.IN_PROGRESS) return;

  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentTurnPlayerId,
  );
  if (!currentPlayer || !currentPlayer.isAI || currentPlayer.isEliminated) return;

  const aiDelay = 1000 + Math.random() * 2000; // 1-3 seconds
  setTimeout(() => {
    void playAITurn(gameState.id, currentPlayer.id).then(() => {
      // After AI finishes, check if the NEXT player is also AI
      const updatedState = getGameState(gameState.id);
      if (updatedState) {
        scheduleAITurnIfNeeded(updatedState);
      }
    });
  }, aiDelay);
}
