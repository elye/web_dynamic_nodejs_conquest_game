import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config.js';
import routes from './routes/index.js';
import { setupWebSocket } from './ws/index.js';
import { authMiddleware } from './routes/middleware/auth.js';
import { findActiveGameByPlayerId } from './game/engine.js';
import { gameStore } from './store/gameStore.js';
import { GameStatus } from '@conquest/shared';

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/active-game', authMiddleware, (req, res) => {
  const playerId = req.playerId!;

  // Check in-progress games first
  const activeGame = findActiveGameByPlayerId(playerId);
  if (activeGame) {
    res.json({ gameId: activeGame.gameId, status: activeGame.status });
    return;
  }

  // Check lobby rooms
  const room = gameStore.findGameByPlayerId(playerId);
  if (room && room.status === GameStatus.LOBBY) {
    res.json({ gameId: room.id, status: room.status });
    return;
  }

  res.json({ gameId: null });
});

app.use('/api', routes);

const server = createServer(app);

setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`Conquest server running on http://localhost:${config.port}`);
});
