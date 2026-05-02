import { useState } from 'react';
import { MAP_SIZES } from '@conquest/shared';

interface CreateGameModalProps {
  onClose: () => void;
  onCreate: (settings: {
    name: string;
    mapSize: string;
    maxPlayers: number;
    turnTimer: number;
    winCondition: string;
    password?: string;
  }) => void;
  isLoading: boolean;
}

const MAP_SIZE_OPTIONS = [
  { key: 'SMALL', label: 'Small', ...MAP_SIZES.SMALL },
  { key: 'MEDIUM', label: 'Medium', ...MAP_SIZES.MEDIUM },
  { key: 'LARGE', label: 'Large', ...MAP_SIZES.LARGE },
] as const;

const TURN_TIMER_OPTIONS = [
  { label: '60s', value: 60_000 },
  { label: '90s', value: 90_000 },
  { label: '120s', value: 120_000 },
  { label: 'Unlimited', value: 0 },
];

const WIN_CONDITION_OPTIONS = [
  { label: 'Last Standing', value: 'LAST_STANDING' },
  { label: 'Territory 70%', value: 'TERRITORY_70' },
];

export default function CreateGameModal({ onClose, onCreate, isLoading }: CreateGameModalProps) {
  const [name, setName] = useState('');
  const [mapSizeIdx, setMapSizeIdx] = useState(1);
  const [turnTimer, setTurnTimer] = useState(60_000);
  const [winCondition, setWinCondition] = useState('LAST_STANDING');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const size = MAP_SIZE_OPTIONS[mapSizeIdx];
    onCreate({
      name: name || 'New Game',
      mapSize: size.key,
      maxPlayers: 6,
      turnTimer,
      winCondition,
      password: password || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-700 space-y-4"
      >
        <h2 className="text-xl font-bold text-white">Create Game</h2>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Game Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Game"
            className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Map Size</label>
            <select
              value={mapSizeIdx}
              onChange={(e) => setMapSizeIdx(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MAP_SIZE_OPTIONS.map((opt, i) => (
                <option key={opt.label} value={i}>{opt.label} ({opt.width}x{opt.height})</option>
              ))}
            </select>
          </div>



          <div>
            <label className="block text-sm text-gray-300 mb-1">Turn Timer</label>
            <select
              value={turnTimer}
              onChange={(e) => setTurnTimer(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TURN_TIMER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Win Condition</label>
            <select
              value={winCondition}
              onChange={(e) => setWinCondition(e.target.value)}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {WIN_CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Password (optional)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank for public"
            className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 text-gray-300 hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
