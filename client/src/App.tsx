import { useEffect, useState } from 'react';
import { GameStatus } from '@conquest/shared';
import LobbyPage from './pages/LobbyPage';
import GameRoomPage from './pages/GameRoomPage';
import GamePage from './pages/GamePage';
import { useAuthStore } from './store/authStore';
import { useLobbyStore } from './store/lobbyStore';

function WelcomeScreen() {
  const login = useAuthStore((s) => s.login);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
          {isLoading ? 'Connecting...' : 'Play'}
        </button>
      </form>
    </div>
  );
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const restore = useAuthStore((s) => s.restore);
  const { currentRoom, gameState } = useLobbyStore();

  useEffect(() => {
    restore();
  }, [restore]);

  if (!isAuthenticated) {
    return <WelcomeScreen />;
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

export default App;
