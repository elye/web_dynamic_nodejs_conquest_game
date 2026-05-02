import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { sessionStore } from '../store/sessionStore.js';

const router = Router();

router.post('/guest', (_req, res) => {
  try {
    const playerId = uuidv4();
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const name = `Guest_${digits}`;

    const token = jwt.sign({ playerId }, config.jwtSecret, { expiresIn: '24h' });

    sessionStore.createSession(playerId, name, token);

    res.json({ playerId, token, name });
  } catch {
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

export default router;
