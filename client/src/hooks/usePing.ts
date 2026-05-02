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
    return () => clearInterval(intervalRef.current);
  }, [gameId, playerId]);

  return { pingWarning: failures >= 3 };
}
