// ── Hex Grid ──

export interface HexCoord {
  q: number;
  r: number;
}

export enum TerrainType {
  GRASS = 'GRASS',
  FOREST = 'FOREST',
  MOUNTAIN = 'MOUNTAIN',
  WATER = 'WATER',
}

export interface Hex {
  coord: HexCoord;
  terrain: TerrainType;
  owner: string | null;
  unit: Unit | null;
  structure: Structure | null;
  hasTree: boolean;
  deathMarker?: 'starvation';
}

// ── Units ──

export enum UnitType {
  PEASANT = 'PEASANT',
  SPEARMAN = 'SPEARMAN',
  BARON = 'BARON',
  KNIGHT = 'KNIGHT',
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: string;
  hex: HexCoord;
  hasMoved: boolean;
  strength: number;
  upkeep: number;
}

// ── Structures ──

export enum StructureType {
  TOWER = 'TOWER',
  STRONG_TOWER = 'STRONG_TOWER',
}

export interface Structure {
  id: string;
  type: StructureType;
  owner: string;
  hex: HexCoord;
  strength: number;
}

// ── Province ──

export interface Province {
  id: string;
  hexes: HexCoord[];
  owner: string;
  gold: number;
  income: number;
  upkeep: number;
}

// ── AI ──

export enum AiDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

// ── Player ──

export interface Player {
  id: string;
  name: string;
  color: string;
  isAI: boolean;
  aiDifficulty?: AiDifficulty;
  isConnected: boolean;
  isEliminated: boolean;
  gold: number;
  provinces: string[];
  ready: boolean;
}

// ── Game ──

export enum GameStatus {
  LOBBY = 'LOBBY',
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
}

export interface GameSettings {
  mapWidth: number;
  mapHeight: number;
  maxPlayers: number;
  turnTimeLimit: number;
  startingGold: number;
}

export interface GameAction {
  type: string;
  playerId: string;
  turnNumber: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface GameState {
  id: string;
  status: GameStatus;
  settings: GameSettings;
  players: Player[];
  hexes: Hex[];
  provinces: Province[];
  currentTurnPlayerId: string | null;
  turnNumber: number;
  turnStartedAt: number | null;
  history: GameAction[];
  winnerId: string | null;
  createdAt: number;
}

// ── Game Room (Lobby) ──

export interface GameRoomPlayer {
  id: string;
  name: string;
  isReady: boolean;
  isAI: boolean;
  aiDifficulty?: AiDifficulty;
}

export interface GameRoom {
  id: string;
  name: string;
  hostId: string;
  settings: GameSettings;
  players: GameRoomPlayer[];
  passwordHash: string | null;
  status: GameStatus;
  createdAt: number;
}
