import {
  type GameState,
  type Hex,
  type HexCoord,
  type Player,
  type Province,
  type Unit,
  GameStatus,
  UnitType,
  StructureType,
  TerrainType,
  UNIT_COST,
  UNIT_STRENGTH,
  UNIT_UPKEEP,
  STRUCTURE_COST,
  STRUCTURE_STRENGTH,
  DEFAULT_GAME_SETTINGS,
} from '@conquest/shared';
import { randomUUID } from 'node:crypto';
import { gameStore } from '../store/gameStore.js';
import {
  generateMap,
  coordKey,
  getHexNeighbors,
  hexDistance,
} from './mapGenerator.js';
import {
  calculateProvinces,
  recalculateAllProvinces,
} from './provinces.js';
import { canCapture, resolveCombat } from './combat.js';

// ── Helpers ──

function buildHexLookup(hexes: Hex[]): Map<string, Hex> {
  const map = new Map<string, Hex>();
  for (const hex of hexes) {
    map.set(coordKey(hex.coord.q, hex.coord.r), hex);
  }
  return map;
}

function getHex(hexes: Hex[], coord: HexCoord): Hex | undefined {
  return hexes.find(
    (h) => h.coord.q === coord.q && h.coord.r === coord.r,
  );
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

function getNextPlayer(gameState: GameState): Player | undefined {
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  if (activePlayers.length === 0) return undefined;

  const currentIdx = activePlayers.findIndex(
    (p) => p.id === gameState.currentTurnPlayerId,
  );
  const nextIdx = (currentIdx + 1) % activePlayers.length;
  return activePlayers[nextIdx];
}

const UNIT_MERGE_MAP: Record<string, UnitType> = {
  [`${UnitType.PEASANT}+${UnitType.PEASANT}`]: UnitType.SPEARMAN,
  [`${UnitType.SPEARMAN}+${UnitType.PEASANT}`]: UnitType.BARON,
  [`${UnitType.PEASANT}+${UnitType.SPEARMAN}`]: UnitType.BARON,
  [`${UnitType.BARON}+${UnitType.PEASANT}`]: UnitType.KNIGHT,
  [`${UnitType.PEASANT}+${UnitType.BARON}`]: UnitType.KNIGHT,
  [`${UnitType.SPEARMAN}+${UnitType.SPEARMAN}`]: UnitType.KNIGHT,
};

const TREE_SPREAD_CHANCE = 0.1;

function canPlayerAct(gameState: GameState, playerId: string): boolean {
  const hasUnits = gameState.hexes.some(
    (h) => h.unit && h.unit.owner === playerId,
  );
  if (hasUnits) return true;

  const cheapestCost = UNIT_COST[UnitType.PEASANT];
  return gameState.provinces
    .filter((p) => p.owner === playerId)
    .some((p) => p.gold >= cheapestCost);
}

function checkEliminations(gameState: GameState): void {
  for (const player of gameState.players) {
    if (player.isEliminated) continue;
    const hasHexes = gameState.hexes.some((h) => h.owner === player.id);
    if (!hasHexes) {
      player.isEliminated = true;
    }
  }
  checkWinCondition(gameState);
}

// ── Game store for GameState instances ──

const gameStates = new Map<string, GameState>();
const turnSnapshotStacks = new Map<string, GameState[]>();
const redoStacks = new Map<string, GameState[]>();

// ── Engine ──

export function getGameState(gameId: string): GameState | undefined {
  return gameStates.get(gameId);
}

export function startGame(gameId: string): GameState {
  const room = gameStore.getGame(gameId);
  if (!room) throw new Error(`Game room ${gameId} not found`);

  if (room.players.length < 2) {
    throw new Error('At least 2 players are required to start');
  }

  const mapSize =
    room.settings.mapWidth <= 10
      ? 'SMALL'
      : room.settings.mapWidth <= 15
        ? 'MEDIUM'
        : 'LARGE';

  const hexes = generateMap(mapSize, room.players.length);

  // Assign real player IDs to the placeholder player-N IDs from map gen
  const playerIdMap = new Map<string, string>();
  for (let i = 0; i < room.players.length; i++) {
    playerIdMap.set(`player-${i}`, room.players[i].id);
  }

  for (const hex of hexes) {
    if (hex.owner && playerIdMap.has(hex.owner)) {
      hex.owner = playerIdMap.get(hex.owner)!;
    }
    if (hex.unit && playerIdMap.has(hex.unit.owner)) {
      hex.unit.owner = playerIdMap.get(hex.unit.owner)!;
      hex.unit.hex = hex.coord;
    }
  }

  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

  const players: Player[] = room.players.map((rp, i) => ({
    id: rp.id,
    name: rp.name,
    color: colors[i % colors.length],
    isAI: rp.isAI,
    aiDifficulty: rp.aiDifficulty,
    isConnected: true,
    isEliminated: false,
    gold: room.settings.startingGold ?? DEFAULT_GAME_SETTINGS.startingGold,
    provinces: [],
    ready: true,
  }));

  const gameState: GameState = {
    id: gameId,
    status: GameStatus.IN_PROGRESS,
    settings: room.settings,
    players,
    hexes,
    provinces: [],
    currentTurnPlayerId: players[0].id,
    turnNumber: 1,
    turnStartedAt: Date.now(),
    history: [],
    winnerId: null,
    createdAt: Date.now(),
  };

  // Calculate initial provinces for each player
  for (const player of players) {
    const playerProvinces = calculateProvinces(hexes, player.id);
    for (const province of playerProvinces) {
      province.gold = room.settings.startingGold ?? DEFAULT_GAME_SETTINGS.startingGold;
    }
    gameState.provinces.push(...playerProvinces);
    player.provinces = playerProvinces.map((p) => p.id);
  }

  gameStates.set(gameId, gameState);
  gameStore.updateGame(gameId, { status: GameStatus.IN_PROGRESS });

  // Clear snapshot stack for the new game
  turnSnapshotStacks.set(gameId, []);
  redoStacks.set(gameId, []);

  return gameState;
}

export function moveUnit(
  gameState: GameState,
  playerId: string,
  unitId: string,
  toHex: HexCoord,
): GameState {
  // Validate turn
  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  // Snapshot before mutation for step-by-step undo
  const stack = turnSnapshotStacks.get(gameState.id) ?? [];
  stack.push(structuredClone(gameState));
  turnSnapshotStacks.set(gameState.id, stack);

  // Clear redo stack (new action invalidates redo history)
  redoStacks.set(gameState.id, []);

  // Find unit
  const sourceHex = gameState.hexes.find(
    (h) => h.unit?.id === unitId,
  );
  if (!sourceHex?.unit) throw new Error('Unit not found');
  if (sourceHex.unit.owner !== playerId) {
    throw new Error('Unit does not belong to you');
  }
  if (sourceHex.unit.hasMoved) {
    throw new Error('Unit has already moved this turn');
  }

  const unit = sourceHex.unit;

  // Validate target hex exists and is land
  const targetHex = getHex(gameState.hexes, toHex);
  if (!targetHex) throw new Error('Target hex does not exist');
  if (targetHex.terrain === TerrainType.WATER) {
    throw new Error('Cannot move to water');
  }

  // Validate adjacency: target must be adjacent to the unit
  const dist = hexDistance(sourceHex.coord, toHex);
  if (dist !== 1) {
    throw new Error('Target hex is not adjacent to unit');
  }

  // Validate: target must be own territory or adjacent to own territory
  const isOwnTerritory = targetHex.owner === playerId;
  if (!isOwnTerritory) {
    const neighborCoords = getHexNeighbors(toHex.q, toHex.r);
    const adjacentToOwn = neighborCoords.some((nc) => {
      const h = getHex(gameState.hexes, nc);
      return h?.owner === playerId;
    });
    // The source hex is owned by the player and is adjacent, so this should pass
    // But we also check explicitly
    if (!adjacentToOwn && sourceHex.owner !== playerId) {
      throw new Error(
        'Target hex must be your territory or adjacent to your territory',
      );
    }
  }

  // Handle friendly unit merge (move onto own unit)
  if (targetHex.owner === playerId && targetHex.unit && targetHex.unit.owner === playerId) {
    const mergeKey = `${targetHex.unit.type}+${unit.type}`;
    const mergedType = UNIT_MERGE_MAP[mergeKey];
    if (!mergedType) {
      throw new Error('Cannot merge these units');
    }

    // Merge: upgrade target unit, remove source unit
    sourceHex.unit = null;
    targetHex.unit.type = mergedType;
    targetHex.unit.strength = UNIT_STRENGTH[mergedType];
    targetHex.unit.upkeep = UNIT_UPKEEP[mergedType];
    targetHex.unit.hasMoved = true;

    recalculateAllProvinces(gameState);
    for (const player of gameState.players) {
      player.provinces = gameState.provinces
        .filter((p) => p.owner === player.id)
        .map((p) => p.id);
    }
    return gameState;
  }

  // Handle combat if enemy hex
  if (targetHex.owner !== null && targetHex.owner !== playerId) {
    if (targetHex.unit) {
      const result = resolveCombat(unit, targetHex, gameState.hexes);
      if (!result.success) {
        // Attack failed — unit stays, mark as moved
        sourceHex.unit.hasMoved = true;
        return gameState;
      }
      // Defender destroyed
      targetHex.unit = null;
    } else {
      // No defender but hex is enemy — check if we can capture (tower defense)
      if (!canCapture(unit, targetHex, gameState.hexes)) {
        sourceHex.unit.hasMoved = true;
        return gameState;
      }
    }

    // Destroy enemy structure on capture
    if (targetHex.structure && targetHex.structure.owner !== playerId) {
      targetHex.structure = null;
    }

    // Capture the hex
    const previousOwner = targetHex.owner;
    targetHex.owner = playerId;

    // Recalculate provinces for both players
    recalculateAllProvinces(gameState);

    // Update player province references
    for (const player of gameState.players) {
      player.provinces = gameState.provinces
        .filter((p) => p.owner === player.id)
        .map((p) => p.id);
    }

    // Check if any player lost all territory
    checkEliminations(gameState);
  }

  // Remove tree if present
  if (targetHex.hasTree) {
    targetHex.hasTree = false;
    if (targetHex.terrain === TerrainType.FOREST) {
      targetHex.terrain = TerrainType.GRASS;
    }
  }

  // Move unit
  sourceHex.unit = null;
  unit.hex = toHex;
  unit.hasMoved = true;
  targetHex.unit = unit;
  delete targetHex.deathMarker;

  // If target was neutral, claim it
  if (targetHex.owner === null) {
    targetHex.owner = playerId;
  }

  // Always recalculate provinces after all mutations (capture, tree removal, unit move)
  recalculateAllProvinces(gameState);
  for (const player of gameState.players) {
    player.provinces = gameState.provinces
      .filter((p) => p.owner === player.id)
      .map((p) => p.id);
  }

  return gameState;
}

export function buyUnit(
  gameState: GameState,
  playerId: string,
  unitType: UnitType,
  hex: HexCoord,
): GameState {
  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  // Snapshot before mutation for step-by-step undo
  const stack = turnSnapshotStacks.get(gameState.id) ?? [];
  stack.push(structuredClone(gameState));
  turnSnapshotStacks.set(gameState.id, stack);

  // Clear redo stack (new action invalidates redo history)
  redoStacks.set(gameState.id, []);

  const targetHex = getHex(gameState.hexes, hex);
  if (!targetHex) throw new Error('Hex does not exist');
  if (targetHex.owner !== playerId) {
    throw new Error('Hex is not owned by you');
  }

  // Handle merging: if hex has a unit, try to merge
  if (targetHex.unit) {
    const mergeKey = `${targetHex.unit.type}+${unitType}`;
    const mergedType = UNIT_MERGE_MAP[mergeKey];
    if (!mergedType) {
      throw new Error('Cannot place unit here: hex already has a unit that cannot be merged');
    }

    const province = findProvinceForHex(gameState.provinces, hex, playerId);
    if (!province) throw new Error('Hex does not belong to any province');

    const cost = UNIT_COST[unitType];
    if (province.gold < cost) {
      throw new Error(`Insufficient gold: need ${cost}, have ${province.gold}`);
    }

    province.gold -= cost;

    // Upgrade the existing unit
    targetHex.unit.type = mergedType;
    targetHex.unit.strength = UNIT_STRENGTH[mergedType];
    targetHex.unit.upkeep = UNIT_UPKEEP[mergedType];
    targetHex.unit.hasMoved = true;

    // Recalculate province upkeep
    recalculateAllProvinces(gameState);
    for (const player of gameState.players) {
      player.provinces = gameState.provinces
        .filter((p) => p.owner === player.id)
        .map((p) => p.id);
    }

    return gameState;
  }

  // No existing unit — normal placement
  if (targetHex.structure) {
    throw new Error('Hex already has a structure');
  }

  const province = findProvinceForHex(gameState.provinces, hex, playerId);
  if (!province) throw new Error('Hex does not belong to any province');

  const cost = UNIT_COST[unitType];
  if (province.gold < cost) {
    throw new Error(`Insufficient gold: need ${cost}, have ${province.gold}`);
  }

  province.gold -= cost;

  // Remove tree if present (unit chops it down)
  targetHex.hasTree = false;

  targetHex.unit = {
    id: randomUUID(),
    type: unitType,
    owner: playerId,
    hex,
    hasMoved: true,
    strength: UNIT_STRENGTH[unitType],
    upkeep: UNIT_UPKEEP[unitType],
  };

  // Recalculate province upkeep
  recalculateAllProvinces(gameState);
  for (const player of gameState.players) {
    player.provinces = gameState.provinces
      .filter((p) => p.owner === player.id)
      .map((p) => p.id);
  }

  return gameState;
}

export function buildStructure(
  gameState: GameState,
  playerId: string,
  structureType: StructureType,
  hex: HexCoord,
): GameState {
  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  // Snapshot before mutation for step-by-step undo
  const stack = turnSnapshotStacks.get(gameState.id) ?? [];
  stack.push(structuredClone(gameState));
  turnSnapshotStacks.set(gameState.id, stack);

  // Clear redo stack (new action invalidates redo history)
  redoStacks.set(gameState.id, []);

  const targetHex = getHex(gameState.hexes, hex);
  if (!targetHex) throw new Error('Hex does not exist');
  if (targetHex.owner !== playerId) {
    throw new Error('Hex is not owned by you');
  }
  if (targetHex.structure) {
    throw new Error('Hex already has a structure');
  }
  if (targetHex.unit) {
    throw new Error('Hex already has a unit');
  }

  const province = findProvinceForHex(gameState.provinces, hex, playerId);
  if (!province) throw new Error('Hex does not belong to any province');

  const cost = STRUCTURE_COST[structureType];
  if (province.gold < cost) {
    throw new Error(`Insufficient gold: need ${cost}, have ${province.gold}`);
  }

  province.gold -= cost;

  targetHex.structure = {
    id: randomUUID(),
    type: structureType,
    owner: playerId,
    hex,
    strength: STRUCTURE_STRENGTH[structureType],
  };

  return gameState;
}

export function endTurn(gameState: GameState): GameState {
  const currentPlayerId = gameState.currentTurnPlayerId;
  if (!currentPlayerId) throw new Error('No current player');

  // Process income and upkeep for current player's provinces
  const playerProvinces = gameState.provinces.filter(
    (p) => p.owner === currentPlayerId,
  );

  // Clear old death markers
  for (const hex of gameState.hexes) {
    if (hex.deathMarker) {
      delete hex.deathMarker;
    }
  }

  for (const province of playerProvinces) {
    province.gold += province.income;
    province.gold -= province.upkeep;

    if (province.gold < 0) {
      // Kill all units in this province
      const lookup = buildHexLookup(gameState.hexes);
      for (const coord of province.hexes) {
        const hex = lookup.get(coordKey(coord.q, coord.r));
        if (hex?.unit && hex.unit.owner === currentPlayerId) {
          hex.unit = null;
          hex.deathMarker = 'starvation';
        }
      }
      province.gold = 0;
    }
  }

  // Check if any player lost all territory after starvation
  checkEliminations(gameState);

  // Determine if this is the end of a full round
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  const currentIdx = activePlayers.findIndex(
    (p) => p.id === currentPlayerId,
  );
  const isEndOfRound = currentIdx === activePlayers.length - 1;

  // Tree spreading at end of full round
  if (isEndOfRound) {
    const lookup = buildHexLookup(gameState.hexes);
    const newTrees: HexCoord[] = [];

    for (const hex of gameState.hexes) {
      if (!hex.hasTree) continue;

      const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
      for (const nc of neighbors) {
        const neighbor = lookup.get(coordKey(nc.q, nc.r));
        if (
          neighbor &&
          neighbor.terrain !== TerrainType.WATER &&
          !neighbor.hasTree &&
          !neighbor.unit &&
          !neighbor.structure
        ) {
          if (Math.random() < TREE_SPREAD_CHANCE) {
            newTrees.push(nc);
          }
        }
      }
    }

    for (const coord of newTrees) {
      const hex = lookup.get(coordKey(coord.q, coord.r));
      if (hex) {
        hex.hasTree = true;
      }
    }
  }

  // Advance to next player
  const nextPlayer = getNextPlayer(gameState);
  if (!nextPlayer) throw new Error('No active players remaining');

  gameState.currentTurnPlayerId = nextPlayer.id;

  if (isEndOfRound) {
    gameState.turnNumber += 1;
  }

  gameState.turnStartedAt = Date.now();

  // Reset hasMoved for the next player's units
  for (const hex of gameState.hexes) {
    if (hex.unit && hex.unit.owner === nextPlayer.id) {
      hex.unit.hasMoved = false;
    }
  }

  // Recalculate provinces (upkeep/income may have changed due to tree spread or unit deaths)
  recalculateAllProvinces(gameState);
  for (const player of gameState.players) {
    player.provinces = gameState.provinces
      .filter((p) => p.owner === player.id)
      .map((p) => p.id);
  }

  // Check win condition
  checkWinCondition(gameState);

  // Auto-skip players who can't act (no units and can't afford any)
  if (gameState.status !== GameStatus.FINISHED) {
    const activeCount = gameState.players.filter(
      (p) => !p.isEliminated,
    ).length;
    let skips = 0;

    while (
      skips < activeCount &&
      gameState.status !== GameStatus.FINISHED &&
      !canPlayerAct(gameState, gameState.currentTurnPlayerId)
    ) {
      const skipPlayer = getNextPlayer(gameState);
      if (!skipPlayer) break;

      gameState.currentTurnPlayerId = skipPlayer.id;
      gameState.turnStartedAt = Date.now();

      for (const hex of gameState.hexes) {
        if (hex.unit && hex.unit.owner === skipPlayer.id) {
          hex.unit.hasMoved = false;
        }
      }

      skips++;
    }
  }

  // Clear snapshot stack and redo stack for the new turn
  turnSnapshotStacks.set(gameState.id, []);
  redoStacks.set(gameState.id, []);

  return gameState;
}

export function undoAction(gameId: string, playerId: string): GameState {
  const gameState = gameStates.get(gameId);
  if (!gameState) throw new Error('Game not found');
  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  const stack = turnSnapshotStacks.get(gameId);
  if (!stack || stack.length === 0) throw new Error('Nothing to undo');

  // Push current state onto redo stack before restoring
  const redoStack = redoStacks.get(gameId) ?? [];
  redoStack.push(structuredClone(gameState));
  redoStacks.set(gameId, redoStack);

  // Pop the last snapshot and restore it
  const snapshot = stack.pop()!;
  const restored = structuredClone(snapshot);
  gameStates.set(gameId, restored);

  return restored;
}

export function redoAction(gameId: string, playerId: string): GameState {
  const gameState = gameStates.get(gameId);
  if (!gameState) throw new Error('Game not found');
  if (gameState.currentTurnPlayerId !== playerId) {
    throw new Error('Not your turn');
  }

  const redoStack = redoStacks.get(gameId);
  if (!redoStack || redoStack.length === 0) throw new Error('Nothing to redo');

  // Push current state onto undo stack
  const undoStack = turnSnapshotStacks.get(gameId) ?? [];
  undoStack.push(structuredClone(gameState));
  turnSnapshotStacks.set(gameId, undoStack);

  // Pop from redo stack and restore
  const snapshot = redoStack.pop()!;
  const restored = structuredClone(snapshot);
  gameStates.set(gameId, restored);

  return restored;
}

export function surrender(
  gameState: GameState,
  playerId: string,
): GameState {
  const player = gameState.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  if (player.isEliminated) throw new Error('Player is already eliminated');

  player.isEliminated = true;

  // Neutralize all hexes and remove units
  for (const hex of gameState.hexes) {
    if (hex.owner === playerId) {
      hex.owner = null;
      hex.unit = null;
      hex.structure = null;
    }
  }

  // Recalculate provinces
  recalculateAllProvinces(gameState);
  for (const p of gameState.players) {
    p.provinces = gameState.provinces
      .filter((prov) => prov.owner === p.id)
      .map((prov) => prov.id);
  }

  // If it was the surrendering player's turn, advance
  if (gameState.currentTurnPlayerId === playerId) {
    const nextPlayer = getNextPlayer(gameState);
    if (nextPlayer) {
      gameState.currentTurnPlayerId = nextPlayer.id;
      gameState.turnStartedAt = Date.now();
    }
  }

  checkWinCondition(gameState);

  return gameState;
}

function checkWinCondition(gameState: GameState): void {
  const activePlayers = gameState.players.filter((p) => !p.isEliminated);
  if (activePlayers.length <= 1) {
    gameState.status = GameStatus.FINISHED;
    gameState.winnerId = activePlayers[0]?.id ?? null;
  }
}
