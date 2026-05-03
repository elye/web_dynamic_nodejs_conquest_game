import { useState } from 'react';
import { MAP_SIZES } from '@conquest/shared';

interface SoloGameModalProps {
  onClose: () => void;
  onStart: (settings: { mapSize: string; aiCount: number; aiDifficulty: string }) => void;
  isLoading: boolean;
}

const MAP_SIZE_OPTIONS = [
  { key: 'SMALL', label: 'Small', ...MAP_SIZES.SMALL },
  { key: 'MEDIUM', label: 'Medium', ...MAP_SIZES.MEDIUM },
  { key: 'LARGE', label: 'Large', ...MAP_SIZES.LARGE },
] as const;

const AI_DIFFICULTY_OPTIONS = [
  { label: 'Easy', value: 'EASY' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Hard', value: 'HARD' },
];

export default function SoloGameModal({ onClose, onStart, isLoading }: SoloGameModalProps) {
  const [mapSizeIdx, setMapSizeIdx] = useState(1);
  const [aiCount, setAiCount] = useState(2);
  const [aiDifficulty, setAiDifficulty] = useState('MEDIUM');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const size = MAP_SIZE_OPTIONS[mapSizeIdx];
    onStart({ mapSize: size.key, aiCount, aiDifficulty });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-700 space-y-4"
      >
        <h2 className="text-xl font-bold text-white">Solo Game</h2>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Map Size</label>
          <select
            value={mapSizeIdx}
            onChange={(e) => setMapSizeIdx(Number(e.target.value))}
            className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {MAP_SIZE_OPTIONS.map((opt, i) => (
              <option key={opt.key} value={i}>{opt.label} ({opt.width}x{opt.height})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">AI Opponents ({aiCount})</label>
          <input
            type="range"
            min={1}
            max={5}
            value={aiCount}
            onChange={(e) => setAiCount(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">AI Difficulty</label>
          <select
            value={aiDifficulty}
            onChange={(e) => setAiDifficulty(e.target.value)}
            className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {AI_DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
            {isLoading ? 'Starting...' : 'Start Solo Game'}
          </button>
        </div>
      </form>
    </div>
  );
}
