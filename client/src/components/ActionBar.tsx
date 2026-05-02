import type { HexCoord } from '@conquest/shared';
import {
  UnitType,
  StructureType,
  ClientMessageType,
} from '@conquest/shared';
import { UNIT_COST, STRUCTURE_COST } from '@conquest/shared';

interface ActionBarProps {
  isMyTurn: boolean;
  selectedHex: HexCoord | null;
  provinceGold: number | null;
  turnTimeRemaining: number | null;
  onBuyUnit: (unitType: UnitType, hex: HexCoord) => void;
  onBuildStructure: (structureType: StructureType, hex: HexCoord) => void;
  onEndTurn: () => void;
  onSurrender: () => void;
}

export default function ActionBar({
  isMyTurn,
  selectedHex,
  provinceGold,
  turnTimeRemaining,
  onBuyUnit,
  onBuildStructure,
  onEndTurn,
  onSurrender,
}: ActionBarProps) {
  const gold = provinceGold ?? 0;
  const hasHex = selectedHex !== null;

  const buyButtons: { label: string; cost: number; unitType: UnitType }[] = [
    { label: '🧑‍🌾 Peasant', cost: UNIT_COST[UnitType.PEASANT], unitType: UnitType.PEASANT },
    { label: '💂 Spear', cost: UNIT_COST[UnitType.SPEARMAN], unitType: UnitType.SPEARMAN },
    { label: '🤴 Baron', cost: UNIT_COST[UnitType.BARON], unitType: UnitType.BARON },
    { label: '🐴 Knight', cost: UNIT_COST[UnitType.KNIGHT], unitType: UnitType.KNIGHT },
  ];

  const buildButtons: { label: string; cost: number; structureType: StructureType }[] = [
    { label: '🏰 Tower', cost: STRUCTURE_COST[StructureType.TOWER], structureType: StructureType.TOWER },
    { label: '🏯 Fort', cost: STRUCTURE_COST[StructureType.STRONG_TOWER], structureType: StructureType.STRONG_TOWER },
  ];

  const handleSurrender = () => {
    if (window.confirm('Are you sure you want to surrender?')) {
      onSurrender();
    }
  };

  return (
    <div className="h-14 bg-gray-800 border-t border-gray-700 flex items-center px-3 gap-2 overflow-x-auto">
      {/* Turn timer */}
      {turnTimeRemaining !== null && (
        <span className="text-xs font-mono text-yellow-400 shrink-0 mr-1">
          {turnTimeRemaining}s
        </span>
      )}

      {/* Buy unit buttons */}
      {buyButtons.map((b) => (
        <button
          key={b.unitType}
          disabled={!isMyTurn || !hasHex || gold < b.cost}
          onClick={() => selectedHex && onBuyUnit(b.unitType, selectedHex)}
          className="px-2 py-1 rounded bg-gray-700 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {b.label} ({b.cost}g)
        </button>
      ))}

      <div className="w-px h-6 bg-gray-600 shrink-0" />

      {/* Build structure buttons */}
      {buildButtons.map((b) => (
        <button
          key={b.structureType}
          disabled={!isMyTurn || !hasHex || gold < b.cost}
          onClick={() => selectedHex && onBuildStructure(b.structureType, selectedHex)}
          className="px-2 py-1 rounded bg-gray-700 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {b.label} ({b.cost}g)
        </button>
      ))}

      <div className="flex-1" />

      {/* Surrender */}
      <button
        onClick={handleSurrender}
        className="px-2 py-1 rounded bg-red-900/60 text-xs text-red-300 hover:bg-red-800 transition-colors shrink-0"
      >
        Surrender
      </button>

      {/* End turn */}
      <button
        disabled={!isMyTurn}
        onClick={onEndTurn}
        className="px-4 py-1.5 rounded bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
      >
        End Turn
      </button>
    </div>
  );
}
