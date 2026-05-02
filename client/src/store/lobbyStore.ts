import { create } from 'zustand';
import type { AiDifficulty, GameRoom, GameState } from '@conquest/shared';
import * as api from '../utils/api';

interface LobbyState {
  games: GameRoom[];
  currentRoom: GameRoom | null;
  gameState: GameState | null;
  isLoading: boolean;
  error: string | null;
  fetchGames: () => Promise<void>;
  createGame: (body: { name: string; mapSize: string; maxPlayers: number; turnTimer: number; winCondition: string; password?: string }) => Promise<void>;
  joinGame: (gameId: string, password?: string) => Promise<void>;
  leaveGame: () => Promise<void>;
  startGame: () => Promise<void>;
  addAI: (difficulty: AiDifficulty) => Promise<void>;
  removeAI: (playerId: string) => Promise<void>;
  setCurrentRoom: (room: GameRoom | null) => void;
  fetchRoom: () => Promise<void>;
  setGameState: (gameState: GameState | null) => void;
}

export const useLobbyStore = create<LobbyState>((set, get) => ({
  games: [],
  currentRoom: null,
  gameState: null,
  isLoading: false,
  error: null,

  fetchGames: async () => {
    set({ isLoading: true, error: null });
    try {
      const games = await api.listGames();
      set({ games, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  createGame: async (body) => {
    set({ isLoading: true, error: null });
    try {
      const room = await api.createGame(body);
      set({ currentRoom: room, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  joinGame: async (gameId, password?) => {
    set({ isLoading: true, error: null });
    try {
      const room = await api.joinGame(gameId, password);
      set({ currentRoom: room, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  leaveGame: async () => {
    const room = get().currentRoom;
    if (!room) return;
    set({ isLoading: true, error: null });
    try {
      await api.leaveGame(room.id);
      set({ currentRoom: null, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  startGame: async () => {
    const room = get().currentRoom;
    if (!room) return;
    set({ isLoading: true, error: null });
    try {
      const gameState = await api.startGame(room.id);
      set({ gameState, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  addAI: async (difficulty) => {
    const room = get().currentRoom;
    if (!room) return;
    set({ isLoading: true, error: null });
    try {
      const updated = await api.addAI(room.id, difficulty);
      set({ currentRoom: updated, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  removeAI: async (playerId) => {
    const room = get().currentRoom;
    if (!room) return;
    set({ isLoading: true, error: null });
    try {
      const updated = await api.removeAI(room.id, playerId);
      set({ currentRoom: updated, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  setCurrentRoom: (room) => set({ currentRoom: room }),

  fetchRoom: async () => {
    const room = get().currentRoom;
    if (!room) return;
    try {
      const updated = await api.getGame(room.id);
      set({ currentRoom: updated });
    } catch {
      // Background poll — silently fail
    }
  },

  setGameState: (gameState) => set({ gameState }),
}));
