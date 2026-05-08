import {
  type Hex,
  type HexCoord,
  TerrainType,
  UnitType,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
  MAP_SIZES,
} from '@conquest/shared';
import { randomUUID } from 'node:crypto';

export type MapSize = keyof typeof MAP_SIZES;

const TARGET_LAND_HEXES: Record<MapSize, number> = {
  SMALL: 60,
  MEDIUM: 120,
  LARGE: 250,
};

const MAP_RADIUS: Record<MapSize, number> = {
  SMALL: 5,
  MEDIUM: 7,
  LARGE: 10,
};

// ── Helpers ──

export function coordKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

export function getHexNeighbors(q: number, r: number): HexCoord[] {
  return [
    { q: q + 1, r },
    { q: q - 1, r },
    { q, r: r + 1 },
    { q, r: r - 1 },
    { q: q + 1, r: r - 1 },
    { q: q - 1, r: r + 1 },
  ];
}

// ── Landmass generation ──

function parseCoordKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/**
 * Grow an organic landmass outward from the center using weighted random
 * expansion. Closer-to-center candidates are picked more often, producing
 * a roughly circular but irregular shape. Connectivity is guaranteed
 * because every new hex is adjacent to an existing land hex.
 */
function generateLandmass(radius: number, targetLand: number): Set<string> {
  const center: HexCoord = { q: 0, r: 0 };
  const landSet = new Set<string>();
  const candidateSet = new Set<string>();
  const candidates: { coord: HexCoord; key: string }[] = [];

  landSet.add(coordKey(0, 0));

  for (const n of getHexNeighbors(0, 0)) {
    const key = coordKey(n.q, n.r);
    candidateSet.add(key);
    candidates.push({ coord: n, key });
  }

  while (landSet.size < targetLand && candidates.length > 0) {
    const weights = candidates.map((c) => {
      const dist = hexDistance(c.coord, center);
      return Math.max(0.1, 1 - dist / (radius + 2));
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let roll = Math.random() * totalWeight;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        idx = i;
        break;
      }
    }

    const picked = candidates[idx];
    candidates.splice(idx, 1);
    candidateSet.delete(picked.key);
    landSet.add(picked.key);

    for (const n of getHexNeighbors(picked.coord.q, picked.coord.r)) {
      const key = coordKey(n.q, n.r);
      if (!landSet.has(key) && !candidateSet.has(key)) {
        candidateSet.add(key);
        candidates.push({ coord: n, key });
      }
    }
  }

  return landSet;
}

// ── Starting positions ──

function placeStartingPositions(
  landSet: Set<string>,
  landCoords: HexCoord[],
  playerCount: number,
  radius: number,
): { playerIndex: number; hexes: HexCoord[]; unitHex: HexCoord }[] {
  const targetDist = radius * 0.55;
  const positions: {
    playerIndex: number;
    hexes: HexCoord[];
    unitHex: HexCoord;
  }[] = [];
  const claimed = new Set<string>();

  // Random rotation so players don't always start at the same positions
  const randomOffset = Math.random() * 2 * Math.PI;

  for (let i = 0; i < playerCount; i++) {
    const angle = randomOffset + (2 * Math.PI * i) / playerCount;

    // Convert polar to axial: x = q + r/2, y = r * √3/2
    const x = targetDist * Math.cos(angle);
    const y = targetDist * Math.sin(angle);
    const targetR = Math.round((2 * y) / Math.sqrt(3));
    const targetQ = Math.round(x - targetR / 2);
    const target: HexCoord = { q: targetQ, r: targetR };

    // Find closest unclaimed land hex to the target position
    let bestHex: HexCoord | null = null;
    let bestDist = Infinity;
    for (const coord of landCoords) {
      const key = coordKey(coord.q, coord.r);
      if (claimed.has(key)) continue;
      const dist = hexDistance(coord, target);
      if (dist < bestDist) {
        bestDist = dist;
        bestHex = coord;
      }
    }

    if (!bestHex) continue;

    // BFS to claim a cluster of 4-5 connected land hexes
    const cluster: HexCoord[] = [bestHex];
    claimed.add(coordKey(bestHex.q, bestHex.r));
    const queue: HexCoord[] = getHexNeighbors(bestHex.q, bestHex.r);

    while (cluster.length < 5 && queue.length > 0) {
      const next = queue.shift()!;
      const key = coordKey(next.q, next.r);
      if (!landSet.has(key) || claimed.has(key)) continue;

      cluster.push(next);
      claimed.add(key);
      queue.push(...getHexNeighbors(next.q, next.r));
    }

    positions.push({ playerIndex: i, hexes: cluster, unitHex: cluster[0] });
  }

  return positions;
}

// ── Public API ──

export function generateMap(mapSize: MapSize, playerCount: number): Hex[] {
  const radius = MAP_RADIUS[mapSize];
  const targetLand = TARGET_LAND_HEXES[mapSize];

  // 1. Grow organic landmass from center
  const landSet = generateLandmass(radius, targetLand);
  const landCoords = Array.from(landSet).map(parseCoordKey);

  // 2. Determine outer boundary for water ring
  const outerRadius = radius + 3;
  const allCoords: HexCoord[] = [];
  for (let q = -outerRadius; q <= outerRadius; q++) {
    for (let r = -outerRadius; r <= outerRadius; r++) {
      if (hexDistance({ q, r }, { q: 0, r: 0 }) <= outerRadius) {
        allCoords.push({ q, r });
      }
    }
  }

  // 3. Assign starting positions
  const startingPositions = placeStartingPositions(
    landSet,
    landCoords,
    playerCount,
    radius,
  );

  const ownerMap = new Map<string, string>();
  const unitMap = new Map<string, Hex['unit']>();

  for (const pos of startingPositions) {
    const playerId = `player-${pos.playerIndex}`;
    for (const hex of pos.hexes) {
      ownerMap.set(coordKey(hex.q, hex.r), playerId);
    }
    unitMap.set(coordKey(pos.unitHex.q, pos.unitHex.r), {
      id: randomUUID(),
      type: UnitType.PEASANT,
      owner: playerId,
      hex: pos.unitHex,
      hasMoved: false,
      strength: UNIT_STRENGTH[UnitType.PEASANT],
      upkeep: UNIT_UPKEEP[UnitType.PEASANT],
    });
  }

  // 4. Scatter trees on ~15% of neutral land hexes
  const treeSet = new Set<string>();
  for (const coord of landCoords) {
    const key = coordKey(coord.q, coord.r);
    if (!ownerMap.has(key) && Math.random() < 0.15) {
      treeSet.add(key);
    }
  }

  // 5. Build final hex array
  return allCoords.map((coord) => {
    const key = coordKey(coord.q, coord.r);
    const isLand = landSet.has(key);
    const hasTree = treeSet.has(key);

    return {
      coord,
      terrain: isLand
        ? hasTree
          ? TerrainType.FOREST
          : TerrainType.GRASS
        : TerrainType.WATER,
      owner: ownerMap.get(key) ?? null,
      unit: unitMap.get(key) ?? null,
      structure: null,
      hasTree,
    };
  });
}
