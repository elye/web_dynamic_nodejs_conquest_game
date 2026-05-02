import { create } from 'zustand';
import { createGuestSession, setToken } from '../utils/api';

const STORAGE_KEY = 'conquest_auth';

interface AuthState {
  playerId: string | null;
  playerName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (name?: string) => Promise<void>;
  logout: () => void;
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  playerId: null,
  playerName: null,
  token: null,
  isAuthenticated: false,

  login: async (name?: string) => {
    const { playerId, token, name: assignedName } = await createGuestSession(name);
    setToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, token, name: assignedName }));
    set({ playerId, playerName: assignedName, token, isAuthenticated: true });
  },

  logout: () => {
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    set({ playerId: null, playerName: null, token: null, isAuthenticated: false });
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { playerId, token, name } = JSON.parse(raw);
      if (playerId && token && name) {
        setToken(token);
        set({ playerId, playerName: name, token, isAuthenticated: true });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
}));
