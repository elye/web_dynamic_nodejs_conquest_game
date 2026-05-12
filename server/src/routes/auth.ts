import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { sessionStore } from '../store/sessionStore.js';

const router = Router();

router.post('/guest', (req, res) => {
  try {
    const playerId = uuidv4();
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const sanitized = rawName.replace(/[<>"'&]/g, '').slice(0, 20);
    const name = sanitized || `Guest_${String(Math.floor(1000 + Math.random() * 9000))}`;

    const token = jwt.sign({ playerId, name }, config.jwtSecret, { expiresIn: '24h' });

    sessionStore.createSession(playerId, name, token);

    res.json({ playerId, token, name });
  } catch {
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

// Map of Logto sub → server playerId for consistent identity across sessions
const logtoPlayerMap = new Map<string, string>();

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks && config.logtoEndpoint) {
    jwks = createRemoteJWKSet(new URL(`${config.logtoEndpoint}/oidc/jwks`));
  }
  return jwks;
}

router.post('/logto', async (req, res) => {
  try {
    if (!config.logtoEndpoint) {
      res.status(500).json({ error: 'Logto is not configured on this server' });
      return;
    }

    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) {
      res.status(400).json({ error: 'Missing idToken' });
      return;
    }

    const keySet = getJWKS();
    if (!keySet) {
      res.status(500).json({ error: 'Failed to initialize JWKS' });
      return;
    }

    const { payload } = await jwtVerify(idToken, keySet, {
      issuer: `${config.logtoEndpoint}/oidc`,
    });

    const sub = payload.sub;
    if (!sub) {
      res.status(400).json({ error: 'Invalid token: missing sub claim' });
      return;
    }

    // Derive a stable playerId from the Logto sub
    let playerId = logtoPlayerMap.get(sub);
    if (!playerId) {
      playerId = uuidv4();
      logtoPlayerMap.set(sub, playerId);
    }

    const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
    const sanitized = rawName.replace(/[<>"'&]/g, '').slice(0, 20);
    const fallbackName = typeof payload.username === 'string'
      ? (payload.username as string).replace(/[<>"'&]/g, '').slice(0, 20)
      : '';
    const name = sanitized || fallbackName || `Player_${sub.slice(0, 6)}`;

    const token = jwt.sign({ playerId, name }, config.jwtSecret, { expiresIn: '24h' });
    sessionStore.createSession(playerId, name, token);

    res.json({ playerId, token, name });
  } catch (err) {
    console.error('Logto auth error:', err);
    res.status(401).json({ error: 'Invalid or expired Logto token' });
  }
});

export default router;
