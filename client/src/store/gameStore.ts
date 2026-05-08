import { create } from 'zustand';
import type { GameState, HexCoord, Hex } from '@conquest/shared';
import { TerrainType, StructureType, STRUCTURE_STRENGTH } from '@conquest/shared';
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

function getHexDefense(target: Hex, hexMap: Map<string, Hex>): number {
  let defense = target.unit ? target.unit.strength : 0;
  if (!target.owner) return defense;
  // Structure on the hex itself
  if (target.structure && target.owner === target.structure.owner) {
    defense += STRUCTURE_STRENGTH[target.structure.type as StructureType] ?? 0;
  }
  // Adjacent tower bonuses
  const neighbors = getHexNeighbors(target.coord.q, target.coord.r);
  for (const nc of neighbors) {
    const nh = hexMap.get(`${nc.q},${nc.r}`);
    if (nh?.structure && nh.owner === target.owner) {
      defense += STRUCTURE_STRENGTH[nh.structure.type as StructureType] ?? 0;
    }
  }
  return defense;
}

function computeValidMoves(hex: HexCoord, hexes: Hex[], currentPlayerId: string): HexCoord[] {
  const hexMap = new Map<string, Hex>();
  for (const h of hexes) {
    hexMap.set(`${h.coord.q},${h.coord.r}`, h);
  }

  const sourceHex = hexMap.get(`${hex.q},${hex.r}`);
  const unitStrength = sourceHex?.unit?.strength ?? 0;

  const results: HexCoord[] = [];
  const neighbors = getHexNeighbors(hex.q, hex.r);

  for (const n of neighbors) {
    const target = hexMap.get(`${n.q},${n.r}`);
    if (!target || target.terrain === TerrainType.WATER) continue;

    // Own structure — can't land on it, but can jump through
    if (target.owner === currentPlayerId && target.structure) {
      // Jump through: find tiles adjacent to the structure (but not the source)
      const structNeighbors = getHexNeighbors(n.q, n.r);
      for (const sn of structNeighbors) {
        if (sn.q === hex.q && sn.r === hex.r) continue;
        const jumpTarget = hexMap.get(`${sn.q},${sn.r}`);
        if (!jumpTarget || jumpTarget.terrain === TerrainType.WATER) continue;
        if (jumpTarget.owner === currentPlayerId && jumpTarget.structure) continue;
        if (jumpTarget.owner !== null && jumpTarget.owner !== currentPlayerId) {
          const defense = getHexDefense(jumpTarget, hexMap);
          if (unitStrength <= defense) continue;
        }
        results.push(sn);
      }
      continue;
    }

    // Can't attack/capture if unit isn't strong enough
    if (target.owner !== null && target.owner !== currentPlayerId) {
      const defense = getHexDefense(target, hexMap);
      if (unitStrength <= defense) continue;
    }
    results.push(n);
  }

  return results;
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
