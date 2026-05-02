import { useEffect } from 'react';
import { GameStatus } from '@conquest/shared';
import LobbyPage from './pages/LobbyPage';
import GameRoomPage from './pages/GameRoomPage';
import GamePage from './pages/GamePage';
import { useAuthStore } from './store/authStore';
import { useLobbyStore } from './store/lobbyStore';

function App() {
  const { isAuthenticated, playerId, restore, login } = useAuthStore();
  const { currentRoom, gameState } = useLobbyStore();

  // Auto-login as guest on mount
  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    if (!isAuthenticated) {
      login().catch(() => {
        // guest login failed — will retry on next mount
      });
    }
  }, [isAuthenticated, login]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-gray-400">Connecting...</p>
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

export default App;
