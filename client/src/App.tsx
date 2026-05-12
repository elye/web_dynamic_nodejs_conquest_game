import { Component, useEffect, useState, useCallback } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { GameStatus } from '@conquest/shared';
import { useLogto, useHandleSignInCallback } from '@logto/react';
import LobbyPage from './pages/LobbyPage';
import GameRoomPage from './pages/GameRoomPage';
import GamePage from './pages/GamePage';
import { useAuthStore } from './store/authStore';
import { useLobbyStore } from './store/lobbyStore';
import { getActiveGame, getGame } from './utils/api';
import { parseHash, navigateTo } from './utils/navigation';
import { useKeepAlive } from './hooks/usePing';

// ── Error Boundary ──

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-6 max-w-lg text-center">
            <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
            <p className="text-gray-300 text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => {
                this.setState({ error: null });
                navigateTo('lobby');
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function LogtoCallback() {
  const loginWithLogto = useAuthStore((s) => s.loginWithLogto);
  const { getIdToken } = useLogto();

  const { isLoading } = useHandleSignInCallback(async () => {
    try {
      const idToken = await getIdToken();
      if (idToken) {
        await loginWithLogto(idToken);
      }
    } catch (err) {
      console.error('Logto callback error:', err);
    }
    // Full reload to clear callback state and render the app fresh
    window.location.replace('/');
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-gray-400">Signing in...</p>
      </div>
    );
  }
  return null;
}

const logtoEnabled = !!(import.meta.env.VITE_LOGTO_ENDPOINT && import.meta.env.VITE_LOGTO_APP_ID);

function WelcomeScreen() {
  const login = useAuthStore((s) => s.login);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const logto = logtoEnabled ? useLogto() : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(name.trim() || undefined);
    } catch {
      // retry allowed
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogtoSignIn = () => {
    const callbackUrl = `${window.location.origin}/callback`;
    logto?.signIn(callbackUrl);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-xl p-8 w-full max-w-sm text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Conquest</h1>
        <p className="text-gray-400 text-sm mb-6">Enter your name to play</p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name..."
          maxLength={20}
          autoFocus
          className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500 mb-4"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Connecting...' : 'Play as Guest'}
        </button>
        {logtoEnabled && (
          <>
            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-slate-600" />
              <span className="px-3 text-gray-500 text-xs">or</span>
              <div className="flex-1 border-t border-slate-600" />
            </div>
            <button
              type="button"
              onClick={handleLogtoSignIn}
              className="w-full px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
            >
              Sign in with Account
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const restore = useAuthStore((s) => s.restore);
  const { currentRoom, gameState, setGameState, setCurrentRoom } = useLobbyStore();
  const route = useHashRoute();
  const [isRejoining, setIsRejoining] = useState(false);

  // Keep server alive (Render free-tier spin-down prevention)
  useKeepAlive();

  useEffect(() => {
    restore();
  }, [restore]);

  // Handle Logto callback redirect
  if (logtoEnabled && window.location.pathname === '/callback') {
    return <LogtoCallback />;
  }

  // Rejoin game/room from URL hash on page load
  useEffect(() => {
    if (!isAuthenticated || gameState || currentRoom) return;
    if (route.page === 'lobby' || !route.gameId) return;

    setIsRejoining(true);
    getActiveGame()
      .then(async (result) => {
        if (result.gameId === route.gameId && result.status === GameStatus.IN_PROGRESS) {
          setGameState({ id: result.gameId, status: GameStatus.IN_PROGRESS } as any);
        } else if (result.gameId === route.gameId && result.status === GameStatus.LOBBY) {
          const room = await getGame(result.gameId);
          setCurrentRoom(room);
        } else {
          // Game not found or player not in it — go back to lobby
          navigateTo('lobby');
        }
      })
      .catch(() => {
        navigateTo('lobby');
      })
      .finally(() => setIsRejoining(false));
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync hash when game state changes
  const syncHash = useCallback(() => {
    if (gameState && gameState.status === GameStatus.IN_PROGRESS) {
      const current = parseHash();
      if (current.page !== 'game' || current.gameId !== gameState.id) {
        navigateTo('game', gameState.id);
      }
    } else if (currentRoom && currentRoom.status === GameStatus.LOBBY) {
      const current = parseHash();
      if (current.page !== 'room' || current.gameId !== currentRoom.id) {
        navigateTo('room', currentRoom.id);
      }
    }
  }, [gameState, currentRoom]);

  useEffect(() => {
    syncHash();
  }, [syncHash]);

  if (!isAuthenticated) {
    return <WelcomeScreen />;
  }

  if (isRejoining) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-gray-400">Reconnecting to game...</p>
      </div>
    );
  }

  // Game in progress
  if (gameState && gameState.status === GameStatus.IN_PROGRESS) {
    return <GamePage />;
  }

  // In a room waiting
  if (currentRoom && currentRoom.status === GameStatus.LOBBY) {
    return <GameRoomPage />;
  }

  // Default: lobby
  return <LobbyPage />;
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
