import type { GameRoom } from '@conquest/shared';
import { GameStatus } from '@conquest/shared';

class GameStore {
  private games = new Map<string, GameRoom>();

  createGame(gameRoom: GameRoom): GameRoom {
    this.games.set(gameRoom.id, gameRoom);
    return gameRoom;
  }

  getGame(gameId: string): GameRoom | undefined {
    return this.games.get(gameId);
  }

  updateGame(gameId: string, updates: Partial<GameRoom>): GameRoom | undefined {
    const game = this.games.get(gameId);
    if (!game) return undefined;
    const updated = { ...game, ...updates };
    this.games.set(gameId, updated);
    return updated;
  }

  deleteGame(gameId: string): boolean {
    return this.games.delete(gameId);
  }

  listPublicGames(): GameRoom[] {
    return Array.from(this.games.values()).filter(
      (g) => g.passwordHash === null && g.status === GameStatus.LOBBY,
    );
  }

  findGameByPlayerId(playerId: string): GameRoom | undefined {
    for (const game of this.games.values()) {
      if (game.players.some((p) => p.id === playerId)) return game;
    }
    return undefined;
  }
}

export const gameStore = new GameStore();
