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
  const resultSet = new Set<string>();
  const neighbors = getHexNeighbors(hex.q, hex.r);

  // Collect all connected structures reachable from adjacent structures (flood-fill)
  const structureSet = new Set<string>();
  const structureQueue: HexCoord[] = [];
  for (const n of neighbors) {
    const target = hexMap.get(`${n.q},${n.r}`);
    if (target && target.owner === currentPlayerId && target.structure) {
      const key = `${n.q},${n.r}`;
      if (!structureSet.has(key)) {
        structureSet.add(key);
        structureQueue.push(n);
      }
    }
  }
  // BFS through connected structures
  while (structureQueue.length > 0) {
    const current = structureQueue.shift()!;
    const sNeighbors = getHexNeighbors(current.q, current.r);
    for (const sn of sNeighbors) {
      const key = `${sn.q},${sn.r}`;
      if (structureSet.has(key)) continue;
      const snHex = hexMap.get(key);
      if (snHex && snHex.owner === currentPlayerId && snHex.structure) {
        structureSet.add(key);
        structureQueue.push(sn);
      }
    }
  }

  // Add all non-structure neighbors of the structure chain as jump-through targets
  for (const structKey of structureSet) {
    const [sq, sr] = structKey.split(',').map(Number);
    const sNeighbors = getHexNeighbors(sq, sr);
    for (const sn of sNeighbors) {
      const key = `${sn.q},${sn.r}`;
      if (key === `${hex.q},${hex.r}`) continue; // skip source
      if (structureSet.has(key)) continue; // skip structures in chain
      if (resultSet.has(key)) continue; // skip duplicates
      const jumpTarget = hexMap.get(key);
      if (!jumpTarget || jumpTarget.terrain === TerrainType.WATER) continue;
      if (jumpTarget.owner === currentPlayerId && jumpTarget.structure) continue;
      if (jumpTarget.owner !== null && jumpTarget.owner !== currentPlayerId) {
        const defense = getHexDefense(jumpTarget, hexMap);
        if (unitStrength <= defense) continue;
      }
      resultSet.add(key);
      results.push(sn);
    }
  }

  // Add normal adjacent moves (non-structure hexes)
  for (const n of neighbors) {
    const key = `${n.q},${n.r}`;
    if (structureSet.has(key)) continue; // handled above via jump-through
    if (resultSet.has(key)) continue;
    const target = hexMap.get(key);
    if (!target || target.terrain === TerrainType.WATER) continue;
    if (target.owner !== null && target.owner !== currentPlayerId) {
      const defense = getHexDefense(target, hexMap);
      if (unitStrength <= defense) continue;
    }
    resultSet.add(key);
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
