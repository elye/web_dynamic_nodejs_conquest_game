import { create } from 'zustand';
import { createGuestSession, exchangeLogtoToken, setToken } from '../utils/api';

const STORAGE_KEY = 'conquest_auth';

interface AuthState {
  playerId: string | null;
  playerName: string | null;
  token: string | null;
  isAuthenticated: boolean;
  authMode: 'guest' | 'logto' | null;
  login: (name?: string) => Promise<void>;
  loginWithLogto: (idToken: string) => Promise<void>;
  logout: () => void;
  restore: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  playerId: null,
  playerName: null,
  token: null,
  isAuthenticated: false,
  authMode: null,

  login: async (name?: string) => {
    const { playerId, token, name: assignedName } = await createGuestSession(name);
    setToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, token, name: assignedName, authMode: 'guest' }));
    set({ playerId, playerName: assignedName, token, isAuthenticated: true, authMode: 'guest' });
  },

  loginWithLogto: async (idToken: string) => {
    const { playerId, token, name } = await exchangeLogtoToken(idToken);
    setToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId, token, name, authMode: 'logto' }));
    set({ playerId, playerName: name, token, isAuthenticated: true, authMode: 'logto' });
  },

  logout: () => {
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    set({ playerId: null, playerName: null, token: null, isAuthenticated: false, authMode: null });
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { playerId, token, name, authMode } = JSON.parse(raw);
      if (playerId && token && name) {
        setToken(token);
        set({ playerId, playerName: name, token, isAuthenticated: true, authMode: authMode ?? 'guest' });
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
}));
