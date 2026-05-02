import { Router, type Request, type Response } from 'express';
import authRoutes from './auth.js';
import gameRoutes from './games.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/games', gameRoutes);

router.get('/ping', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

export default router;
