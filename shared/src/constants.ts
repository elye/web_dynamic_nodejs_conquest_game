import { UnitType, StructureType } from './types/game.js';

// ── Unit Stats ──

export const UNIT_STRENGTH: Record<UnitType, number> = {
  [UnitType.PEASANT]: 1,
  [UnitType.SPEARMAN]: 2,
  [UnitType.BARON]: 3,
  [UnitType.KNIGHT]: 4,
};

export const UNIT_UPKEEP: Record<UnitType, number> = {
  [UnitType.PEASANT]: 2,
  [UnitType.SPEARMAN]: 6,
  [UnitType.BARON]: 18,
  [UnitType.KNIGHT]: 54,
};

export const UNIT_COST: Record<UnitType, number> = {
  [UnitType.PEASANT]: 10,
  [UnitType.SPEARMAN]: 20,
  [UnitType.BARON]: 30,
  [UnitType.KNIGHT]: 40,
};

// ── Structure Stats ──

export const STRUCTURE_COST: Record<StructureType, number> = {
  [StructureType.FARMHOUSE]: 10,
  [StructureType.TOWER]: 20,
  [StructureType.CASTLE]: 30,
};

export const STRUCTURE_STRENGTH: Record<StructureType, number> = {
  [StructureType.FARMHOUSE]: 0,
  [StructureType.TOWER]: 1,
  [StructureType.CASTLE]: 2,
};

// ── Map ──

export const MAP_SIZES = {
  SMALL: { width: 10, height: 10 },
  MEDIUM: { width: 15, height: 15 },
  LARGE: { width: 20, height: 20 },
} as const;

// ── Game Defaults ──

export const DEFAULT_GAME_SETTINGS = {
  mapWidth: MAP_SIZES.MEDIUM.width,
  mapHeight: MAP_SIZES.MEDIUM.height,
  maxPlayers: 4,
  turnTimeLimit: 60_000,
  startingGold: 20,
} as const;

// ── Income ──

export const HEX_INCOME = 1;
export const TREE_INCOME = 0;

// ── Turn ──

export const MIN_TURN_TIME_MS = 10_000;
export const MAX_TURN_TIME_MS = 120_000;

// ── Server ──

export const DEFAULT_PORT = 3001;
export const RECONNECT_TIMEOUT_MS = 30_000;
export const MAX_PLAYERS = 6;
