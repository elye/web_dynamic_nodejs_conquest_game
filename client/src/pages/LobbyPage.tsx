import { useEffect, useState } from 'react';
import { GameStatus } from '@conquest/shared';
import { useAuthStore } from '../store/authStore';
import { useLobbyStore } from '../store/lobbyStore';
import CreateGameModal from '../components/CreateGameModal';
import SoloGameModal from '../components/SoloGameModal';
import HowToPlay from '../components/HowToPlay';

export default function LobbyPage() {
  const playerName = useAuthStore((s) => s.playerName);
  const { games, isLoading, error, fetchGames, createGame, joinGame, startSoloGame } = useLobbyStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSoloModal, setShowSoloModal] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 10_000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  const handleCreate = async (settings: Parameters<typeof createGame>[0]) => {
    await createGame(settings);
    setShowCreateModal(false);
  };

  const handleSoloStart = async (settings: { mapSize: string; aiCount: number; aiDifficulty: string }) => {
    await startSoloGame(settings.mapSize, settings.aiCount, settings.aiDifficulty);
    setShowSoloModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Conquest</h1>
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <button
              onClick={() => setShowHowToPlay(true)}
              className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600 transition-colors text-xs md:text-sm"
            >
              ❓ How to Play
            </button>
            <span className="text-xs md:text-sm text-gray-400">
              <span className="text-white font-medium">{playerName}</span>
            </span>
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600 transition-colors text-xs md:text-sm"
            >
              Change Name
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <div className="flex flex-wrap items-center justify-between mb-4 md:mb-6 gap-2">
          <h2 className="text-lg font-semibold">Game Rooms</h2>
          <div className="flex gap-2 md:gap-3 flex-wrap">
            <button
              onClick={() => fetchGames()}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowSoloModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors text-sm"
            >
              Solo Game
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors text-sm"
            >
              Create Game
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Game list */}
        <div className="space-y-3">
          {games.length === 0 && !isLoading && (
            <div className="text-center py-16 text-gray-500">
              No games available. Create one to get started!
            </div>
          )}

          {games.map((room) => (
            <div
              key={room.id}
              className="flex items-center justify-between bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-white truncate">{room.name}</h3>
                  {(room as unknown as { hasPassword: boolean }).hasPassword && (
                    <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded">
                      🔒
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    room.status === GameStatus.LOBBY
                      ? 'bg-green-900/50 text-green-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {room.status === GameStatus.LOBBY ? 'Waiting' : room.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-xs text-gray-400">
                  <span>Players: {room.players.length}/{room.settings.maxPlayers}</span>
                  <span>Map: {room.settings.mapWidth}x{room.settings.mapHeight}</span>
                  <span>
                    Timer: {room.settings.turnTimeLimit > 0 ? `${room.settings.turnTimeLimit / 1000}s` : 'Unlimited'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => joinGame(room.id)}
                disabled={room.status !== GameStatus.LOBBY || room.players.length >= room.settings.maxPlayers}
                className="ml-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Join
              </button>
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
        )}
      </main>

      {showCreateModal && (
        <CreateGameModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          isLoading={isLoading}
        />
      )}

      {showSoloModal && (
        <SoloGameModal
          onClose={() => setShowSoloModal(false)}
          onStart={handleSoloStart}
          isLoading={isLoading}
        />
      )}

      <HowToPlay isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
}
