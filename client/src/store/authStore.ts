import { create } from 'zustand';
import { createGuestSession, setToken } from '../utils/api';

const STORAGE_KEY = 'conquest_auth';

interface AuthState {
  playerId: string | null;
  playerName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  restore: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  playerId: null,
  playerName: null,
  token: null,
  isAuthenticated: false,

  login: async () => {
    const { playerId, token, name } = await createGuestSession();
    setToken(token);
    const data = { playerId, playerName: name, token, isAuthenticated: true };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, token, name }));
    set(data);
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { playerId, token, name } = JSON.parse(raw) as { playerId: string; token: string; name: string };
      if (playerId && token) {
        setToken(token);
        set({ playerId, playerName: name, token, isAuthenticated: true });
      }
    } catch {
      // corrupted storage, ignore
    }
  },

  logout: () => {
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    set({ playerId: null, playerName: null, token: null, isAuthenticated: false });
  },
}));
