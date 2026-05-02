import { useState } from 'react';
import type { GameRoom } from '@conquest/shared';
import { useAuthStore } from '../store/authStore';
import { useLobbyStore } from '../store/lobbyStore';

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
}

export default function GameRoomPage() {
  const playerId = useAuthStore((s) => s.playerId);
  const playerName = useAuthStore((s) => s.playerName);
  const { currentRoom, leaveGame, startGame, isLoading } = useLobbyStore();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [msgId, setMsgId] = useState(0);

  if (!currentRoom) return null;

  const isHost = currentRoom.hostId === playerId;
  const humanPlayers = currentRoom.players.filter((p) => !p.isAI);
  const canStart = humanPlayers.length >= 2 || currentRoom.players.length >= 2;

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const id = msgId + 1;
    setMsgId(id);
    setChatMessages((prev) => [...prev, { id, sender: playerName ?? 'You', text: chatInput.trim() }]);
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{currentRoom.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {currentRoom.settings.mapWidth}x{currentRoom.settings.mapHeight} map
              &middot; {currentRoom.settings.maxPlayers} max players
              &middot; {currentRoom.settings.turnTimeLimit > 0 ? `${currentRoom.settings.turnTimeLimit / 1000}s turns` : 'Unlimited turns'}
            </p>
          </div>
          <button
            onClick={() => leaveGame()}
            className="px-4 py-2 rounded-lg bg-red-600/80 text-white text-sm hover:bg-red-500 transition-colors"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-4xl mx-auto px-6 py-6 w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Player list */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <h2 className="font-semibold">
              Players ({currentRoom.players.length}/{currentRoom.settings.maxPlayers})
            </h2>
          </div>
          <div className="flex-1 p-4 space-y-2 overflow-y-auto">
            {currentRoom.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.name}</span>
                  {p.isAI && (
                    <span className="text-xs bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded">
                      AI{p.aiDifficulty ? ` (${p.aiDifficulty})` : ''}
                    </span>
                  )}
                  {p.id === currentRoom.hostId && (
                    <span className="text-xs bg-yellow-900/60 text-yellow-400 px-2 py-0.5 rounded">
                      Host
                    </span>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  p.isReady
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {p.isReady ? 'Ready' : 'Not Ready'}
                </span>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-700 flex gap-3">
            {isHost && (
              <button
                onClick={() => startGame()}
                disabled={!canStart || isLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isLoading ? 'Starting...' : 'Start Game'}
              </button>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700">
            <h2 className="font-semibold">Chat</h2>
          </div>
          <div className="flex-1 p-4 space-y-2 overflow-y-auto min-h-[200px] max-h-[400px]">
            {chatMessages.length === 0 && (
              <p className="text-sm text-gray-500">No messages yet.</p>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className="text-sm">
                <span className="font-medium text-indigo-400">{msg.sender}: </span>
                <span className="text-gray-300">{msg.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendChat} className="p-4 border-t border-slate-700 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
