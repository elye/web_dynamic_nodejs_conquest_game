import type { GameRoom, GameState, GameSettings } from '@conquest/shared';

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
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createGuestSession(): Promise<{ playerId: string; token: string; name: string }> {
  return request('POST', '/auth/guest');
}

export function createGame(settings: GameSettings & { name: string; password?: string; aiPlayers?: { difficulty: string }[] }): Promise<GameRoom> {
  return request('POST', '/games', settings);
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

export function ping(gameId: string, playerId: string): Promise<void> {
  return request('GET', `/ping?gameId=${encodeURIComponent(gameId)}&playerId=${encodeURIComponent(playerId)}`);
}
