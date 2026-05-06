import { create } from 'zustand';
import type { GameState, HexCoord, Hex } from '@conquest/shared';
import { TerrainType } from '@conquest/shared';
import { getHexNeighbors } from '../utils/hexUtils';

interface ChatMsg {
  sender: string;
  message: string;
  timestamp: number;
}

interface GameStore {
  gameState: GameState | null;
  selectedUnit: { unitId: string; hex: HexCoord } | null;
  selectedHex: HexCoord | null;
  validMoves: HexCoord[];
  turnTimeRemaining: number | null;
  chatMessages: ChatMsg[];

  setGameState: (state: GameState) => void;
  applyDelta: (delta: Partial<GameState>) => void;
  selectHex: (q: number, r: number, currentPlayerId: string | null) => void;
  clearSelection: () => void;
  addChatMessage: (msg: ChatMsg) => void;
  setTurnTimer: (seconds: number) => void;
  decrementTurnTimer: () => void;
  reset: () => void;
}

function computeValidMoves(hex: HexCoord, hexes: Hex[], currentPlayerId: string): HexCoord[] {
  const hexMap = new Map<string, Hex>();
  for (const h of hexes) {
    hexMap.set(`${h.coord.q},${h.coord.r}`, h);
  }

  const neighbors = getHexNeighbors(hex.q, hex.r);
  return neighbors.filter((n) => {
    const target = hexMap.get(`${n.q},${n.r}`);
    if (!target || target.terrain === TerrainType.WATER) return false;
    // Can't move onto own structure (capital, tower)
    if (target.owner === currentPlayerId && target.structure) return false;
    return true;
  });
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedUnit: null,
  selectedHex: null,
  validMoves: [],
  turnTimeRemaining: null,
  chatMessages: [],

  setGameState: (state) => set({ gameState: state }),

  applyDelta: (delta) => {
    const current = get().gameState;
    if (!current) return;
    set({ gameState: { ...current, ...delta } });
  },

  selectHex: (q, r, currentPlayerId) => {
    const state = get().gameState;
    if (!state) return;

    const hex = state.hexes.find((h) => h.coord.q === q && h.coord.r === r);
    if (!hex) {
      set({ selectedHex: { q, r }, selectedUnit: null, validMoves: [] });
      return;
    }

    if (hex.unit && hex.unit.owner === currentPlayerId && !hex.unit.hasMoved) {
      const moves = computeValidMoves({ q, r }, state.hexes, currentPlayerId);
      set({
        selectedHex: { q, r },
        selectedUnit: { unitId: hex.unit.id, hex: { q, r } },
        validMoves: moves,
      });
    } else {
      set({ selectedHex: { q, r }, selectedUnit: null, validMoves: [] });
    }
  },

  clearSelection: () =>
    set({ selectedHex: null, selectedUnit: null, validMoves: [] }),

  addChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  setTurnTimer: (seconds) => set({ turnTimeRemaining: seconds }),

  decrementTurnTimer: () => {
    const current = get().turnTimeRemaining;
    if (current !== null && current > 0) {
      set({ turnTimeRemaining: current - 1 });
    }
  },

  reset: () =>
    set({
      gameState: null,
      selectedUnit: null,
      selectedHex: null,
      validMoves: [],
      turnTimeRemaining: null,
      chatMessages: [],
    }),
}));
