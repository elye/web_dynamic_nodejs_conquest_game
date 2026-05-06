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
                  <div>Gold: {totalGold}</div>
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
      <div className="flex-1 flex flex-col">
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

        <div className="flex-1 relative">
          <HexGrid
            hexes={gameState.hexes}
            selectedHex={selectedHex}
            onHexClick={onHexClick}
            currentPlayerId={currentPlayerId}
            currentTurnPlayerId={gameState.currentTurnPlayerId}
            playerIds={playerIds}
            validTargets={validMoves}
          />

          {/* Floating Action Panel */}
          {actionsAvailable && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-slate-800/90 backdrop-blur border border-slate-600 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2">
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

                {/* Buy unit buttons */}
                <ActionButton
                  emoji="🧑‍🌾"
                  cost={UNIT_COST[UnitTypeEnum.PEASANT]}
                  disabled={!isMyTurn || !hasHex || gold < UNIT_COST[UnitTypeEnum.PEASANT]}
                  onClick={() => selectedHex && onBuyUnit!(UnitTypeEnum.PEASANT, selectedHex)}
                  title="Buy Peasant"
                />
                <ActionButton
                  emoji="💂"
                  cost={UNIT_COST[UnitTypeEnum.SPEARMAN]}
                  disabled={!isMyTurn || !hasHex || gold < UNIT_COST[UnitTypeEnum.SPEARMAN]}
                  onClick={() => selectedHex && onBuyUnit!(UnitTypeEnum.SPEARMAN, selectedHex)}
                  title="Buy Spearman"
                />
                <ActionButton
                  emoji="🤴"
                  cost={UNIT_COST[UnitTypeEnum.BARON]}
                  disabled={!isMyTurn || !hasHex || gold < UNIT_COST[UnitTypeEnum.BARON]}
                  onClick={() => selectedHex && onBuyUnit!(UnitTypeEnum.BARON, selectedHex)}
                  title="Buy Baron"
                />
                <ActionButton
                  emoji="🐴"
                  cost={UNIT_COST[UnitTypeEnum.KNIGHT]}
                  disabled={!isMyTurn || !hasHex || gold < UNIT_COST[UnitTypeEnum.KNIGHT]}
                  onClick={() => selectedHex && onBuyUnit!(UnitTypeEnum.KNIGHT, selectedHex)}
                  title="Buy Knight"
                />

                <div className="w-px h-8 bg-slate-600 mx-1" />

                {/* Build structure buttons */}
                <ActionButton
                  emoji="🏰"
                  cost={STRUCTURE_COST[StructureTypeEnum.TOWER]}
                  disabled={!isMyTurn || !hasHex || gold < STRUCTURE_COST[StructureTypeEnum.TOWER]}
                  onClick={() => selectedHex && onBuildStructure!(StructureTypeEnum.TOWER, selectedHex)}
                  title="Build Tower"
                />
                <ActionButton
                  emoji="🏯"
                  cost={STRUCTURE_COST[StructureTypeEnum.STRONG_TOWER]}
                  disabled={!isMyTurn || !hasHex || gold < STRUCTURE_COST[StructureTypeEnum.STRONG_TOWER]}
                  onClick={() => selectedHex && onBuildStructure!(StructureTypeEnum.STRONG_TOWER, selectedHex)}
                  title="Build Strong Tower"
                />

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
    return hex?.structure?.type === StructureTypeEnum.CAPITAL;
  });
}
