import type { GameState, GameRoom, GameSettings, HexCoord, UnitType, StructureType } from './game.js';

// ── Message Types ──

export enum ClientMessageType {
  // Lobby
  CREATE_GAME = 'CREATE_GAME',
  JOIN_GAME = 'JOIN_GAME',
  LEAVE_GAME = 'LEAVE_GAME',
  LIST_GAMES = 'LIST_GAMES',
  // In-game
  MOVE_UNIT = 'MOVE_UNIT',
  BUY_UNIT = 'BUY_UNIT',
  BUILD_STRUCTURE = 'BUILD_STRUCTURE',
  END_TURN = 'END_TURN',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  SURRENDER = 'SURRENDER',
  REQUEST_STATE = 'REQUEST_STATE',
  READY = 'READY',
}

export enum ServerMessageType {
  // Lobby
  GAME_CREATED = 'GAME_CREATED',
  GAME_LIST = 'GAME_LIST',
  LOBBY_UPDATE = 'LOBBY_UPDATE',
  // In-game
  GAME_STATE_FULL = 'GAME_STATE_FULL',
  GAME_STATE_DELTA = 'GAME_STATE_DELTA',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  PLAYER_DISCONNECTED = 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED = 'PLAYER_RECONNECTED',
  TURN_CHANGED = 'TURN_CHANGED',
  TURN_TIMER_UPDATE = 'TURN_TIMER_UPDATE',
  GAME_STARTED = 'GAME_STARTED',
  GAME_OVER = 'GAME_OVER',
  CHAT_BROADCAST = 'CHAT_BROADCAST',
  ERROR = 'ERROR',
}

// ── Client → Server Messages ──

export interface CreateGameMessage {
  type: ClientMessageType.CREATE_GAME;
  name: string;
  settings: GameSettings;
  password?: string;
}

export interface JoinGameMessage {
  type: ClientMessageType.JOIN_GAME;
  gameId: string;
  password?: string;
}

export interface LeaveGameMessage {
  type: ClientMessageType.LEAVE_GAME;
}

export interface ListGamesMessage {
  type: ClientMessageType.LIST_GAMES;
}

// ── Client → Server Messages ──

export interface MoveUnitMessage {
  type: ClientMessageType.MOVE_UNIT;
  unitId: string;
  from: HexCoord;
  to: HexCoord;
}

export interface BuyUnitMessage {
  type: ClientMessageType.BUY_UNIT;
  unitType: UnitType;
  hex: HexCoord;
}

export interface BuildStructureMessage {
  type: ClientMessageType.BUILD_STRUCTURE;
  structureType: StructureType;
  hex: HexCoord;
}

export interface EndTurnMessage {
  type: ClientMessageType.END_TURN;
}

export interface ChatMessage {
  type: ClientMessageType.CHAT_MESSAGE;
  content: string;
}

export interface SurrenderMessage {
  type: ClientMessageType.SURRENDER;
}

export interface RequestStateMessage {
  type: ClientMessageType.REQUEST_STATE;
}

export interface ReadyMessage {
  type: ClientMessageType.READY;
}

export type ClientMessage =
  | CreateGameMessage
  | JoinGameMessage
  | LeaveGameMessage
  | ListGamesMessage
  | MoveUnitMessage
  | BuyUnitMessage
  | BuildStructureMessage
  | EndTurnMessage
  | ChatMessage
  | SurrenderMessage
  | RequestStateMessage
  | ReadyMessage;

// ── Server → Client Messages ──

export interface GameCreatedMessage {
  type: ServerMessageType.GAME_CREATED;
  gameId: string;
  room: GameRoom;
}

export interface GameListMessage {
  type: ServerMessageType.GAME_LIST;
  games: GameRoom[];
}

export interface LobbyUpdateMessage {
  type: ServerMessageType.LOBBY_UPDATE;
  room: GameRoom;
  deleted?: boolean;
}

export interface GameStateFullMessage {
  type: ServerMessageType.GAME_STATE_FULL;
  state: GameState;
}

export interface GameStateDeltaMessage {
  type: ServerMessageType.GAME_STATE_DELTA;
  delta: Partial<GameState>;
}

export interface PlayerJoinedMessage {
  type: ServerMessageType.PLAYER_JOINED;
  playerId: string;
  playerName: string;
}

export interface PlayerLeftMessage {
  type: ServerMessageType.PLAYER_LEFT;
  playerId: string;
}

export interface PlayerDisconnectedMessage {
  type: ServerMessageType.PLAYER_DISCONNECTED;
  playerId: string;
}

export interface PlayerReconnectedMessage {
  type: ServerMessageType.PLAYER_RECONNECTED;
  playerId: string;
}

export interface TurnChangedMessage {
  type: ServerMessageType.TURN_CHANGED;
  playerId: string;
  turnNumber: number;
}

export interface TurnTimerUpdateMessage {
  type: ServerMessageType.TURN_TIMER_UPDATE;
  remainingMs: number;
}

export interface GameStartedMessage {
  type: ServerMessageType.GAME_STARTED;
  state: GameState;
}

export interface GameOverMessage {
  type: ServerMessageType.GAME_OVER;
  winnerId: string;
  reason: string;
}

export interface ErrorMessage {
  type: ServerMessageType.ERROR;
  code: string;
  message: string;
}

export interface ChatBroadcastMessage {
  type: ServerMessageType.CHAT_BROADCAST;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
}

export type ServerMessage =
  | GameCreatedMessage
  | GameListMessage
  | LobbyUpdateMessage
  | GameStateFullMessage
  | GameStateDeltaMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerDisconnectedMessage
  | PlayerReconnectedMessage
  | TurnChangedMessage
  | TurnTimerUpdateMessage
  | GameStartedMessage
  | GameOverMessage
  | ChatBroadcastMessage
  | ErrorMessage;
