import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';

export interface AuthPayload {
  playerId: string;
}

declare global {
  namespace Express {
    interface Request {
      playerId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.playerId = payload.playerId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
