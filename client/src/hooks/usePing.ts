import { useEffect, useRef, useState } from 'react';
import { ping } from '../utils/api';

export function usePing(gameId: string | null, playerId: string | null) {
  const [failures, setFailures] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!gameId || !playerId) return;

    const doPing = () => {
      ping(gameId, playerId).then(
        () => setFailures(0),
        () => setFailures((f) => f + 1),
      );
    };

    intervalRef.current = setInterval(doPing, 60_000);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [gameId, playerId]);

  return { pingWarning: failures >= 3 };
}

// Keep-alive: ping the server health endpoint to prevent Render free-tier
// spin-down (15-minute idle timeout). Runs at App level, always active.
const KEEP_ALIVE_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function useKeepAlive() {
  useEffect(() => {
    const keepAlive = () => {
      fetch('/api/health').catch(() => {});
    };

    keepAlive(); // immediate first ping

    const intervalId = setInterval(keepAlive, KEEP_ALIVE_INTERVAL);

    // Also ping immediately when tab becomes visible (mobile browser resume)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        keepAlive();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
