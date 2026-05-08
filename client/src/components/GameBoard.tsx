import type { GameState, Province, HexCoord, UnitType, StructureType } from '@conquest/shared';
import {
  UnitType as UnitTypeEnum,
  StructureType as StructureTypeEnum,
  UNIT_COST,
  STRUCTURE_COST,
} from '@conquest/shared';
import { getPlayerColor } from '../utils/colors';
import HexGrid from './HexGrid';

interface GameBoardProps {
  gameState: GameState;
  selectedHex: HexCoord | null;
  onHexClick: (q: number, r: number) => void;
  currentPlayerId: string | null;
  validMoves?: HexCoord[];
  isMyTurn?: boolean;
  turnTimeRemaining?: number | null;
  onBuyUnit?: (unitType: UnitType, hex: HexCoord) => void;
  onBuildStructure?: (structureType: StructureType, hex: HexCoord) => void;
  onEndTurn?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSurrender?: () => void;
  onRetireUnit?: (unitId: string) => void;
  isConnected?: boolean;
}

export default function GameBoard({
  gameState,
  selectedHex,
  onHexClick,
  currentPlayerId,
  validMoves = [],
  isMyTurn = false,
  turnTimeRemaining = null,
  onBuyUnit,
  onBuildStructure,
  onEndTurn,
  onUndo,
  onRedo,
  onSurrender,
  onRetireUnit,
  isConnected,
}: GameBoardProps) {
  const playerIds = gameState.players.map((p) => p.id);

  // Find province for selected hex if owned by current player
  const selectedProvince = findProvinceForHex(
    selectedHex,
    gameState.provinces,
    currentPlayerId,
  );

  const gold = selectedProvince?.gold ?? 0;
  const hasHex = selectedHex !== null;
  const actionsAvailable = !!(onBuyUnit && onBuildStructure && onEndTurn && onSurrender);

  // Check if selected hex has a unit owned by the current player (for retire)
  const selectedHexData = selectedHex
    ? gameState.hexes.find(
        (h) => h.coord.q === selectedHex.q && h.coord.r === selectedHex.r,
      )
    : null;
  const canRetire =
    isMyTurn &&
    selectedHexData?.unit != null &&
    selectedHexData.unit.owner === currentPlayerId;

  const handleSurrender = () => {
    if (window.confirm('Are you sure you want to surrender?')) {
      onSurrender?.();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900">
      {/* Side panel */}
      <div className="w-64 shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Players</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {gameState.players.map((player, index) => {
            const color = getPlayerColor(index);
            const territoryCount = gameState.hexes.filter(
              (h) => h.owner === player.id,
            ).length;
            const totalGold = gameState.provinces
              .filter((p) => p.owner === player.id)
              .reduce((sum, p) => sum + p.gold, 0);
            const isCurrentTurn = player.id === gameState.currentTurnPlayerId;
            return (
              <div
                key={player.id}
                className={`rounded-lg p-3 ${isCurrentTurn ? 'ring-3 ring-red-500 shadow-lg shadow-red-500/30' : ''}`}
                style={{ backgroundColor: color.fill }}
              >
                <div className="flex items-center gap-2">
                  {isCurrentTurn && <span className="text-sm">▶</span>}
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color.fill, border: `2px solid ${color.border}` }}
                  />
                  <span className="text-sm font-medium text-slate-900">
                    {player.name}
                  </span>
                  {player.id === currentPlayerId && (
                    <span className="text-xs text-indigo-700 font-semibold">(you)</span>
                  )}
                </div>
                {isCurrentTurn && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-700">
                      {player.id === currentPlayerId ? '🎯 Your turn' : '⏳ Their turn'}
                    </span>
                    {turnTimeRemaining !== null && turnTimeRemaining > 0 && (
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${turnTimeRemaining <= 10 ? 'bg-red-600 text-white animate-pulse' : 'bg-red-100 text-red-800'}`}>
                        {turnTimeRemaining}s
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-700 space-y-0.5">
                  <div>Territory: {territoryCount}</div>
                  {player.id === currentPlayerId && (
                    <div>Gold: {totalGold}</div>
                  )}
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${player.isConnected ? 'bg-green-600' : 'bg-red-600'}`}
                    />
                    {player.isConnected ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Province info */}
        {selectedProvince && (
          <div className="border-t border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-white mb-2">
              Province Info
            </h3>
            <div className="text-xs text-slate-300 space-y-1">
              <div>Size: {selectedProvince.hexes.length} hexes</div>
              <div>Treasury: {selectedProvince.gold} gold</div>
              <div>Income: +{selectedProvince.income}/turn</div>
              <div>Upkeep: -{selectedProvince.upkeep}/turn</div>
              <div
                className={
                  selectedProvince.income - selectedProvince.upkeep >= 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }
              >
                Net: {selectedProvince.income - selectedProvince.upkeep}/turn
              </div>
              <div>
                Capital: {hasCapitalInProvince(selectedProvince, gameState) ? '🏛️ Yes' : '❌ No'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Turn & connection header */}
        <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between">
          <span className="text-sm text-gray-300">
            {gameState.currentTurnPlayerId === currentPlayerId
              ? 'Your turn'
              : `Waiting for ${gameState.players.find((p) => p.id === gameState.currentTurnPlayerId)?.name ?? '...'}`}
          </span>
          {isConnected !== undefined && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
              />
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>

        <div className="flex-1 relative min-h-0 overflow-hidden">
          <HexGrid
            hexes={gameState.hexes}
            provinces={gameState.provinces}
            selectedHex={selectedHex}
            onHexClick={onHexClick}
            currentPlayerId={currentPlayerId}
            currentTurnPlayerId={gameState.currentTurnPlayerId}
            playerIds={playerIds}
            validTargets={validMoves}
          />
        </div>

          {/* Floating Action Panel — fixed to viewport bottom center */}
          {actionsAvailable && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-slate-800/90 backdrop-blur border border-slate-600 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 select-none" onDragStart={(e) => e.preventDefault()}>
                {/* Turn status */}
                <span className={`text-xs font-semibold mr-2 ${isMyTurn ? 'text-green-400' : 'text-red-400'}`}>
                  {isMyTurn ? '✓ Your turn' : '✗ Wait'}
                </span>


                {/* Province gold indicator */}
                {selectedProvince && (
                  <span className="text-xs text-amber-300 font-medium mr-2">
                    💰 {selectedProvince.gold}g
                  </span>
                )}

                {/* Buy/Upgrade unit buttons */}
                {(() => {
                  const existingUnit = selectedHexData?.unit;
                  const existingUnitType = existingUnit?.type as UnitTypeEnum | undefined;
                  const upgradeOrder = [UnitTypeEnum.PEASANT, UnitTypeEnum.SPEARMAN, UnitTypeEnum.BARON, UnitTypeEnum.KNIGHT];
                  const currentIdx = existingUnitType ? upgradeOrder.indexOf(existingUnitType) : -1;
                  const hasStructure = !!selectedHexData?.structure;
                  const isCapitol = !!selectedHexData?.structure?.isCapitol;
                  const isBuiltThisTurn = !!selectedHexData?.structure?.builtThisTurn;
                  // Can't replace capitol or just-built structures
                  const canReplaceStructure = hasStructure && !isCapitol && !isBuiltThisTurn;

                  const buttons = [
                    { emoji: '🧑‍🌾', type: UnitTypeEnum.PEASANT, label: 'Peasant' },
                    { emoji: '💂', type: UnitTypeEnum.SPEARMAN, label: 'Spearman' },
                    { emoji: '🤴', type: UnitTypeEnum.BARON, label: 'Baron' },
                    { emoji: '🐴', type: UnitTypeEnum.KNIGHT, label: 'Knight' },
                  ];

                  return buttons.map((b) => {
                    const targetIdx = upgradeOrder.indexOf(b.type);
                    // If hex has a unit, only show higher-tier upgrade options
                    if (existingUnit && targetIdx <= currentIdx) return null;
                    // If hex has a non-replaceable structure (capitol or built this turn), hide unit buttons
                    if (!existingUnit && hasStructure && !canReplaceStructure) return null;

                    const cost = existingUnit
                      ? UNIT_COST[b.type] - UNIT_COST[existingUnitType!]
                      : UNIT_COST[b.type];
                    const title = existingUnit
                      ? `Upgrade to ${b.label}`
                      : canReplaceStructure
                        ? `Replace structure with ${b.label}`
                        : `Buy ${b.label}`;

                    const handleClick = () => {
                      if (!selectedHex) return;
                      // Confirm when replacing a structure
                      if (!existingUnit && canReplaceStructure) {
                        if (!window.confirm(`This will destroy the structure on this hex. Continue?`)) return;
                      }
                      onBuyUnit!(b.type, selectedHex);
                    };

                    return (
                      <ActionButton
                        key={b.type}
                        emoji={b.emoji}
                        cost={cost}
                        disabled={!isMyTurn || !hasHex || gold < cost}
                        onClick={handleClick}
                        title={title}
                      />
                    );
                  });
                })()}

                <div className="w-px h-8 bg-slate-600 mx-1" />

                {/* Build/Upgrade structure buttons */}
                {(() => {
                  const existingStructure = selectedHexData?.structure;
                  const existingType = existingStructure?.type as StructureTypeEnum | undefined;
                  const upgradeOrder = [StructureTypeEnum.FARMHOUSE, StructureTypeEnum.TOWER, StructureTypeEnum.CASTLE];
                  const currentIdx = existingType ? upgradeOrder.indexOf(existingType) : -1;
                  const hasUnit = !!selectedHexData?.unit;

                  const buttons = [
                    { emoji: '🏠', type: StructureTypeEnum.FARMHOUSE, label: 'Farmhouse' },
                    { emoji: '🏰', type: StructureTypeEnum.TOWER, label: 'Tower' },
                    { emoji: '🏯', type: StructureTypeEnum.CASTLE, label: 'Castle' },
                  ];

                  return buttons.map((b) => {
                    const targetIdx = upgradeOrder.indexOf(b.type);
                    // Can't build same or lower tier when hex has a structure
                    if (existingStructure && targetIdx <= currentIdx) return null;
                    // Can't build on hex with unit (unless upgrading existing structure)
                    if (!existingStructure && hasUnit) return null;

                    const cost = existingStructure
                      ? STRUCTURE_COST[b.type] - STRUCTURE_COST[existingType!]
                      : STRUCTURE_COST[b.type];
                    const title = existingStructure ? `Upgrade to ${b.label}` : `Build ${b.label}`;

                    return (
                      <ActionButton
                        key={b.type}
                        emoji={b.emoji}
                        cost={cost}
                        disabled={!isMyTurn || !hasHex || gold < cost}
                        onClick={() => selectedHex && onBuildStructure!(b.type, selectedHex)}
                        title={title}
                      />
                    );
                  });
                })()}

                <div className="w-px h-8 bg-slate-600 mx-1" />

                {/* Retire unit button */}
                <button
                  disabled={!canRetire}
                  onClick={() => {
                    if (selectedHexData?.unit && onRetireUnit) {
                      onRetireUnit(selectedHexData.unit.id);
                    }
                  }}
                  title="Retire Unit (refund half cost)"
                  className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span className="text-base leading-none">⬇️</span>
                  <span className="text-[10px] text-slate-300 mt-0.5">Retire</span>
                </button>

                <div className="w-px h-8 bg-slate-600 mx-1" />

                {/* Surrender */}
                <button
                  onClick={handleSurrender}
                  className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-red-900/60 text-red-300 hover:bg-red-800 transition-colors"
                  title="Surrender"
                >
                  <span className="text-sm">🏳️</span>
                </button>

                {/* Undo Last Action */}
                <button
                  disabled={!isMyTurn}
                  onClick={onUndo}
                  className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-amber-900/60 text-amber-300 hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Undo Last Action"
                >
                  <span className="text-sm">↩️</span>
                </button>

                {/* Redo Action */}
                <button
                  disabled={!isMyTurn}
                  onClick={onRedo}
                  className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-amber-900/60 text-amber-300 hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Redo Action"
                >
                  <span className="text-sm">↪️</span>
                </button>

                {/* End turn */}
                <button
                  disabled={!isMyTurn}
                  onClick={onEndTurn}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-1"
                  title="End Turn"
                >
                  <span>⏭️</span> End Turn
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function ActionButton({
  emoji,
  cost,
  disabled,
  onClick,
  title,
}: {
  emoji: string;
  cost: number;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-[10px] text-slate-300 mt-0.5">{cost}g</span>
    </button>
  );
}

function findProvinceForHex(
  hex: HexCoord | null,
  provinces: Province[],
  currentPlayerId: string | null,
): Province | null {
  if (!hex || !currentPlayerId) return null;
  return (
    provinces.find(
      (p) =>
        p.owner === currentPlayerId &&
        p.hexes.some((h) => h.q === hex.q && h.r === hex.r),
    ) ?? null
  );
}

function hasCapitalInProvince(province: Province, gameState: GameState): boolean {
  return province.hexes.some((coord) => {
    const hex = gameState.hexes.find(
      (h) => h.coord.q === coord.q && h.coord.r === coord.r,
    );
    return hex?.structure?.isCapitol;
  });
}
