import type { AiDifficulty, GameRoom, GameState } from '@conquest/shared';

const API_BASE = '/api';

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
}

export function getToken(): string | null {
  return authToken;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (authToken) {
    h['Authorization'] = `Bearer ${authToken}`;
  }
  return h;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (res.status === 401) {
      // Clear stale auth and force re-login
      authToken = null;
      localStorage.removeItem('conquest_auth');
      window.location.reload();
      throw new Error('Session expired');
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? err.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createGuestSession(name?: string): Promise<{ playerId: string; token: string; name: string }> {
  return request('POST', '/auth/guest', name ? { name } : undefined);
}

export function createGame(body: { name: string; mapSize: string; maxPlayers: number; turnTimer: number; winCondition: string; password?: string }): Promise<GameRoom> {
  return request('POST', '/games', body);
}

export function listGames(): Promise<GameRoom[]> {
  return request('GET', '/games');
}

export function getGame(id: string): Promise<GameRoom> {
  return request('GET', `/games/${encodeURIComponent(id)}`);
}

export function joinGame(id: string, password?: string): Promise<GameRoom> {
  return request('POST', `/games/${encodeURIComponent(id)}/join`, password ? { password } : undefined);
}

export function leaveGame(id: string): Promise<void> {
  return request('POST', `/games/${encodeURIComponent(id)}/leave`);
}

export function startGame(id: string): Promise<GameState> {
  return request('POST', `/games/${encodeURIComponent(id)}/start`);
}

export function addAI(gameId: string, difficulty: AiDifficulty): Promise<GameRoom> {
  return request('POST', `/games/${encodeURIComponent(gameId)}/add-ai`, { difficulty });
}

export function removeAI(gameId: string, playerId: string): Promise<GameRoom> {
  return request('POST', `/games/${encodeURIComponent(gameId)}/remove-ai`, { playerId });
}

export function startSoloGame(body: { mapSize: string; aiCount: number; aiDifficulty: string }): Promise<GameState> {
  return request('POST', '/games/solo', body);
}

export function ping(gameId: string, playerId: string): Promise<void> {
  return request('GET', `/ping?gameId=${encodeURIComponent(gameId)}&playerId=${encodeURIComponent(playerId)}`);
}

export function getActiveGame(): Promise<{ gameId: string | null; status?: string }> {
  return request('GET', '/active-game');
}
