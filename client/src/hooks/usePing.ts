import { useEffect, useRef, useState } from 'react';
import { ping } from '../utils/api';

// Keep-alive: ping the server health endpoint every 5 minutes to prevent
// Render free-tier spin-down (15-minute idle timeout)
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function usePing(gameId: string | null, playerId: string | null) {
  const [failures, setFailures] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const keepAliveRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!gameId || !playerId) return;

    const doPing = () => {
      ping(gameId, playerId).then(
        () => setFailures(0),
        () => setFailures((f) => f + 1),
      );
    };

    intervalRef.current = setInterval(doPing, 60_000);

    // Keep-alive ping to /api/health to prevent server spin-down
    const keepAlive = () => {
      fetch('/api/health').catch(() => {});
    };
    keepAlive(); // immediate first ping
    keepAliveRef.current = setInterval(keepAlive, KEEP_ALIVE_INTERVAL);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(keepAliveRef.current);
    };
  }, [gameId, playerId]);

  return { pingWarning: failures >= 3 };
}
