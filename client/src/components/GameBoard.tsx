import type { GameState, Province, HexCoord, UnitType, StructureType } from '@conquest/shared';
import {
  UnitType as UnitTypeEnum,
  StructureType as StructureTypeEnum,
  UNIT_COST,
  STRUCTURE_COST,
} from '@conquest/shared';
import { useState } from 'react';
import { getPlayerColor } from '../utils/colors';
import HexGrid from './HexGrid';
import { useGameStore } from '../store/gameStore';

interface GameBoardProps {
  gameState: GameState;
  onHexClick: (q: number, r: number) => void;
  currentPlayerId: string | null;
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
  onHexClick,
  currentPlayerId,
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

  const actionsAvailable = !!(onBuyUnit && onBuildStructure && onEndTurn && onSurrender);

  const [showSidebar, setShowSidebar] = useState(false);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <div className="flex h-dvh w-dvw bg-gray-900 overflow-hidden">
      {/* Side panel — slide-in drawer on mobile, static on desktop */}
      {/* Mobile backdrop */}
      {showSidebar && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setShowSidebar(false)} />
      )}
      <div className={`
        fixed top-0 left-0 h-full z-50 transition-transform duration-200 ease-in-out
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:transition-none
      `}>
        <div className="w-56 lg:w-64 h-full bg-gray-800 border-r border-gray-700 flex flex-col overflow-y-auto">
          {/* Close button on mobile/tablet */}
          <button
            onClick={() => setShowSidebar(false)}
            className="lg:hidden absolute top-2 right-2 text-gray-400 hover:text-white text-xl z-10"
          >
            ✕
          </button>
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

        {/* Province info — subscribes to selection directly */}
        <SidebarProvinceInfo
          provinces={gameState.provinces}
          hexes={gameState.hexes}
          currentPlayerId={currentPlayerId}
        />
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 flex flex-col min-h-0 relative lg:ml-0">
        {/* Turn & connection header */}
        <div className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-3 md:px-4 justify-between gap-2">
          {/* Sidebar toggle for mobile */}
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="lg:hidden text-gray-300 hover:text-white text-lg shrink-0"
            title="Show players & info"
          >
            ☰
          </button>
          <span className="text-xs md:text-sm text-gray-300 truncate">
            {gameState.currentTurnPlayerId === currentPlayerId
              ? 'Your turn'
              : `Waiting for ${gameState.players.find((p) => p.id === gameState.currentTurnPlayerId)?.name ?? '...'}`}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {isConnected !== undefined && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <span
                  className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
                />
                <span className="hidden lg:inline">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </span>
            )}
            <button
              onClick={toggleFullscreen}
              className="text-gray-400 hover:text-white text-sm"
              title="Toggle Fullscreen"
            >
              ⛶
            </button>
          </div>
        </div>

        <div className="flex-1 relative min-h-0 overflow-hidden">
          <HexGrid
            onHexClick={onHexClick}
            currentPlayerId={currentPlayerId}
            playerIds={playerIds}
          />
        </div>

          {/* Floating Action Panel — subscribes to selection state directly */}
          {actionsAvailable && (
            <ActionPanel
              gameState={gameState}
              currentPlayerId={currentPlayerId}
              isMyTurn={isMyTurn}
              onBuyUnit={onBuyUnit!}
              onBuildStructure={onBuildStructure!}
              onEndTurn={onEndTurn!}
              onUndo={onUndo}
              onRedo={onRedo}
              onSurrender={onSurrender!}
              onRetireUnit={onRetireUnit}
            />
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
      className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span className="text-[9px] text-slate-300 mt-0.5">{cost}g</span>
    </button>
  );
}

// ── Sidebar province info: subscribes to selection directly ──
function SidebarProvinceInfo({
  provinces,
  hexes,
  currentPlayerId,
}: {
  provinces: Province[];
  hexes: GameState['hexes'];
  currentPlayerId: string | null;
}) {
  const selectedHex = useGameStore((s) => s.selectedHex);
  const selectedProvince = findProvinceForHex(selectedHex, provinces, currentPlayerId);
  if (!selectedProvince) return null;

  const hasCapital = selectedProvince.hexes.some((coord) => {
    const hex = hexes.find((h) => h.coord.q === coord.q && h.coord.r === coord.r);
    return hex?.structure?.isCapitol;
  });

  return (
    <div className="border-t border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-white mb-2">Province Info</h3>
      <div className="text-xs text-slate-300 space-y-1">
        <div>Size: {selectedProvince.hexes.length} hexes</div>
        <div>Treasury: {selectedProvince.gold} gold</div>
        <div>Income: +{selectedProvince.income}/turn</div>
        <div>Upkeep: -{selectedProvince.upkeep}/turn</div>
        <div className={selectedProvince.income - selectedProvince.upkeep >= 0 ? 'text-green-400' : 'text-red-400'}>
          Net: {selectedProvince.income - selectedProvince.upkeep}/turn
        </div>
        <div>Capital: {hasCapital ? '🏛️ Yes' : '❌ No'}</div>
      </div>
    </div>
  );
}

// ── Action panel: subscribes to selection directly, isolated from GameBoard re-renders ──
function ActionPanel({
  gameState,
  currentPlayerId,
  isMyTurn,
  onBuyUnit,
  onBuildStructure,
  onEndTurn,
  onUndo,
  onRedo,
  onSurrender,
  onRetireUnit,
}: {
  gameState: GameState;
  currentPlayerId: string | null;
  isMyTurn: boolean;
  onBuyUnit: (unitType: UnitType, hex: HexCoord) => void;
  onBuildStructure: (structureType: StructureType, hex: HexCoord) => void;
  onEndTurn: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSurrender: () => void;
  onRetireUnit?: (unitId: string) => void;
}) {
  const selectedHex = useGameStore((s) => s.selectedHex);

  const selectedProvince = findProvinceForHex(selectedHex, gameState.provinces, currentPlayerId);
  const gold = selectedProvince?.gold ?? 0;
  const hasHex = selectedHex !== null;

  const selectedHexData = selectedHex
    ? gameState.hexes.find((h) => h.coord.q === selectedHex.q && h.coord.r === selectedHex.r)
    : null;

  const canRetire =
    isMyTurn &&
    selectedHexData?.unit != null &&
    selectedHexData.unit.owner === currentPlayerId &&
    !selectedHexData.unit.hasMoved;

  const existingUnit = selectedHexData?.unit;
  const existingUnitType = existingUnit?.type as UnitTypeEnum | undefined;
  const unitUpgradeOrder = [UnitTypeEnum.PEASANT, UnitTypeEnum.SPEARMAN, UnitTypeEnum.BARON, UnitTypeEnum.KNIGHT];
  const currentUnitIdx = existingUnitType ? unitUpgradeOrder.indexOf(existingUnitType) : -1;
  const hasStructure = !!selectedHexData?.structure;
  const isCapitol = !!selectedHexData?.structure?.isCapitol;
  const isBuiltThisTurn = !!selectedHexData?.structure?.builtThisTurn;
  const canReplaceStructure = hasStructure && !isCapitol && !isBuiltThisTurn;

  const existingStructure = selectedHexData?.structure;
  const existingStructType = existingStructure?.type as StructureTypeEnum | undefined;
  const structUpgradeOrder = [StructureTypeEnum.FARMHOUSE, StructureTypeEnum.TOWER, StructureTypeEnum.CASTLE];
  const currentStructIdx = existingStructType ? structUpgradeOrder.indexOf(existingStructType) : -1;
  const hasUnit = !!selectedHexData?.unit;

  const unitButtons = [
    { emoji: '🧑‍🌾', type: UnitTypeEnum.PEASANT, label: 'Peasant' },
    { emoji: '💂', type: UnitTypeEnum.SPEARMAN, label: 'Spearman' },
    { emoji: '🤴', type: UnitTypeEnum.BARON, label: 'Baron' },
    { emoji: '🐴', type: UnitTypeEnum.KNIGHT, label: 'Knight' },
  ];

  const structButtons = [
    { emoji: '🏠', type: StructureTypeEnum.FARMHOUSE, label: 'Farmhouse' },
    { emoji: '🏰', type: StructureTypeEnum.TOWER, label: 'Tower' },
    { emoji: '🏯', type: StructureTypeEnum.CASTLE, label: 'Castle' },
  ];

  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-30 w-[calc(100vw-1rem)] landscape:w-auto landscape:max-w-[calc(100vw-2rem)]">
      <div className="bg-slate-800/90 backdrop-blur border border-slate-600 rounded-2xl px-2 py-2 shadow-2xl select-none" onDragStart={(e) => e.preventDefault()}>
        <div className="flex flex-col landscape:flex-row landscape:items-center landscape:gap-1 landscape:overflow-x-auto">
          <div className="flex items-center gap-1 justify-center">
            <span className={`text-[10px] font-semibold ${isMyTurn ? 'text-green-400' : 'text-red-400'}`}>
              {isMyTurn ? '✓' : '✗'}
            </span>
            {selectedProvince && (
              <span className="text-[10px] text-amber-300 font-medium">💰{selectedProvince.gold}g</span>
            )}

            <div className="w-px h-7 bg-slate-600 mx-0.5" />

            {unitButtons.map((b) => {
              const targetIdx = unitUpgradeOrder.indexOf(b.type);
              const isLowerTier = existingUnit && targetIdx <= currentUnitIdx;
              const isBlockedByStructure = !existingUnit && hasStructure && !canReplaceStructure;
              const cost = existingUnit && !isLowerTier
                ? UNIT_COST[b.type] - UNIT_COST[existingUnitType!]
                : UNIT_COST[b.type];
              const title = existingUnit && !isLowerTier
                ? `Upgrade to ${b.label}`
                : canReplaceStructure ? `Replace structure with ${b.label}` : `Buy ${b.label}`;
              return (
                <ActionButton
                  key={b.type}
                  emoji={b.emoji}
                  cost={cost}
                  disabled={!isMyTurn || !hasHex || gold < cost || !!isLowerTier || !!isBlockedByStructure}
                  onClick={() => {
                    if (!selectedHex) return;
                    if (!existingUnit && canReplaceStructure) {
                      if (!window.confirm('This will destroy the structure on this hex. Continue?')) return;
                    }
                    onBuyUnit(b.type, selectedHex);
                  }}
                  title={title}
                />
              );
            })}

            <div className="w-px h-7 bg-slate-600 mx-0.5" />

            {structButtons.map((b) => {
              const targetIdx = structUpgradeOrder.indexOf(b.type);
              const isLowerTier = existingStructure && targetIdx <= currentStructIdx;
              const isBlockedByUnit = !existingStructure && hasUnit;
              const cost = existingStructure && !isLowerTier
                ? STRUCTURE_COST[b.type] - STRUCTURE_COST[existingStructType!]
                : STRUCTURE_COST[b.type];
              const title = existingStructure && !isLowerTier ? `Upgrade to ${b.label}` : `Build ${b.label}`;
              return (
                <ActionButton
                  key={b.type}
                  emoji={b.emoji}
                  cost={cost}
                  disabled={!isMyTurn || !hasHex || gold < cost || !!isLowerTier || !!isBlockedByUnit}
                  onClick={() => selectedHex && onBuildStructure(b.type, selectedHex)}
                  title={title}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1 justify-center mt-1 landscape:mt-0">
            <button
              disabled={!canRetire}
              onClick={() => {
                if (selectedHexData?.unit && onRetireUnit) onRetireUnit(selectedHexData.unit.id);
              }}
              title="Retire Unit"
              className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <span className="text-sm leading-none">⬇️</span>
              <span className="text-[8px] text-slate-300">Retire</span>
            </button>
            <div className="w-px h-7 bg-slate-600 mx-0.5" />
            <button
              onClick={() => { if (window.confirm('Are you sure you want to surrender?')) onSurrender(); }}
              className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-red-900/60 text-red-300 hover:bg-red-800 transition-colors shrink-0"
              title="Surrender"
            >
              <span className="text-sm">🏳️</span>
            </button>
            <button disabled={!isMyTurn} onClick={onUndo}
              className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-amber-900/60 text-amber-300 hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Undo"><span className="text-sm">↩️</span></button>
            <button disabled={!isMyTurn} onClick={onRedo}
              className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-amber-900/60 text-amber-300 hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              title="Redo"><span className="text-sm">↪️</span></button>
            <div className="w-px h-7 bg-slate-600 mx-0.5" />
            <button disabled={!isMyTurn} onClick={onEndTurn}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 whitespace-nowrap"
              title="End Turn"><span>⏭️</span> End Turn</button>
          </div>
        </div>
      </div>
    </div>
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
