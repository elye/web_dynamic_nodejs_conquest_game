import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GameStatus, ServerMessageType, type AiDifficulty, type GameRoom, type GameRoomPlayer } from '@conquest/shared';
import { gameStore } from '../store/gameStore.js';
import { sessionStore } from '../store/sessionStore.js';
import { startGame } from '../game/engine.js';
import { authMiddleware } from './middleware/auth.js';
import { broadcastToGame } from '../ws/index.js';

const router = Router();

function sanitizeRoom(room: GameRoom): Omit<GameRoom, 'passwordHash'> & { hasPassword: boolean } {
  const { passwordHash, ...rest } = room;
  return { ...rest, hasPassword: passwordHash !== null };
}

// POST /games — Create a new game room
router.post('/', authMiddleware, (req, res) => {
  try {
    const playerId = req.playerId!;
    const { name, mapSize, maxPlayers, turnTimer, winCondition, password, aiPlayers } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Game name is required' });
      return;
    }

    if (!mapSize || typeof mapSize !== 'string') {
      res.status(400).json({ error: 'mapSize is required' });
      return;
    }

    const sizeMap: Record<string, { width: number; height: number }> = {
      SMALL: { width: 10, height: 10 },
      MEDIUM: { width: 15, height: 15 },
      LARGE: { width: 20, height: 20 },
    };

    const dimensions = sizeMap[mapSize.toUpperCase()];
    if (!dimensions) {
      res.status(400).json({ error: 'Invalid mapSize. Use SMALL, MEDIUM, or LARGE' });
      return;
    }

    const session = sessionStore.getSession(playerId);
    const playerName = session?.name ?? 'Unknown';

    const hostPlayer: GameRoomPlayer = {
      id: playerId,
      name: playerName,
      isReady: false,
      isAI: false,
    };

    const players: GameRoomPlayer[] = [hostPlayer];

    // Add AI players if specified
    if (Array.isArray(aiPlayers)) {
      for (const ai of aiPlayers) {
        const aiPlayer: GameRoomPlayer = {
          id: uuidv4(),
          name: `AI_${String(Math.floor(1000 + Math.random() * 9000))}`,
          isReady: true,
          isAI: true,
          aiDifficulty: (ai.difficulty as AiDifficulty) ?? 'EASY',
        };
        players.push(aiPlayer);
      }
    }

    const room: GameRoom = {
      id: uuidv4(),
      name: name.trim().slice(0, 50),
      hostId: playerId,
      settings: {
        mapWidth: dimensions.width,
        mapHeight: dimensions.height,
        maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 6),
        turnTimeLimit: Math.min(Math.max(Number(turnTimer) || 60000, 10000), 120000),
        startingGold: 20,
      },
      players,
      passwordHash: password ? String(password) : null,
      status: GameStatus.LOBBY,
      createdAt: Date.now(),
    };

    gameStore.createGame(room);
    res.status(201).json(sanitizeRoom(room));
  } catch {
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// GET /games — List public game rooms
router.get('/', (_req, res) => {
  try {
    const games = gameStore.listPublicGames();
    res.json(games.map(sanitizeRoom));
  } catch {
    res.status(500).json({ error: 'Failed to list games' });
  }
});

// GET /games/:id — Get game room details
router.get('/:id', (req, res) => {
  try {
    const gameId = req.params.id as string;
    const game = gameStore.getGame(gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(sanitizeRoom(game));
  } catch {
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// POST /games/:id/join — Join a game room
router.post('/:id/join', authMiddleware, (req, res) => {
  try {
    const playerId = req.playerId!;
    const gameId = req.params.id as string;
    const game = gameStore.getGame(gameId);

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (game.status !== GameStatus.LOBBY) {
      res.status(400).json({ error: 'Game is not in lobby' });
      return;
    }
    if (game.players.length >= game.settings.maxPlayers) {
      res.status(400).json({ error: 'Game is full' });
      return;
    }
    if (game.players.some((p) => p.id === playerId)) {
      res.status(400).json({ error: 'Already in this game' });
      return;
    }
    if (game.passwordHash && req.body.password !== game.passwordHash) {
      res.status(403).json({ error: 'Incorrect password' });
      return;
    }

    const session = sessionStore.getSession(playerId);
    const playerName = session?.name ?? 'Unknown';

    const newPlayer: GameRoomPlayer = {
      id: playerId,
      name: playerName,
      isReady: false,
      isAI: false,
    };

    const updated = gameStore.updateGame(gameId, {
      players: [...game.players, newPlayer],
    });

    broadcastToGame(gameId, {
      type: ServerMessageType.LOBBY_UPDATE,
      room: { ...updated!, passwordHash: null },
    });

    res.json(sanitizeRoom(updated!));
  } catch {
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// POST /games/:id/leave — Leave a game room
router.post('/:id/leave', authMiddleware, (req, res) => {
  try {
    const playerId = req.playerId!;
    const gameId = req.params.id as string;
    const game = gameStore.getGame(gameId);

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const playerInGame = game.players.some((p) => p.id === playerId);
    if (!playerInGame) {
      res.status(400).json({ error: 'Not in this game' });
      return;
    }

    const remainingPlayers = game.players.filter((p) => p.id !== playerId);

    if (remainingPlayers.length === 0) {
      gameStore.deleteGame(gameId);
      res.json({ message: 'Game deleted (no players remaining)' });
      return;
    }

    const updates: Partial<GameRoom> = { players: remainingPlayers };

    // If host leaves, assign new host
    if (game.hostId === playerId) {
      const newHost = remainingPlayers.find((p) => !p.isAI) ?? remainingPlayers[0];
      updates.hostId = newHost.id;
    }

    const updated = gameStore.updateGame(gameId, updates);

    broadcastToGame(gameId, {
      type: ServerMessageType.LOBBY_UPDATE,
      room: { ...updated!, passwordHash: null },
    });

    res.json(sanitizeRoom(updated!));
  } catch {
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// POST /games/:id/start — Start the game
router.post('/:id/start', authMiddleware, (req, res) => {
  try {
    const playerId = req.playerId!;
    const gameId = req.params.id as string;
    const game = gameStore.getGame(gameId);

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    if (game.hostId !== playerId) {
      res.status(403).json({ error: 'Only the host can start the game' });
      return;
    }
    if (game.players.length < 2) {
      res.status(400).json({ error: 'At least 2 players are required to start' });
      return;
    }

    const gameState = startGame(gameId);

    broadcastToGame(gameId, {
      type: ServerMessageType.GAME_STARTED,
      state: gameState,
    });

    res.json(gameState);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start game';
    res.status(500).json({ error: message });
  }
});

export default router;
