import type { GameState, Province, HexCoord, UnitType, StructureType } from '@conquest/shared';
import { getPlayerColor } from '../utils/colors';
import HexGrid from './HexGrid';
import ActionBar from './ActionBar';

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
            return (
              <div
                key={player.id}
                className="rounded-lg p-3"
                style={{ backgroundColor: color.fill }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color.base }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: color.light }}
                  >
                    {player.name}
                  </span>
                  {player.id === currentPlayerId && (
                    <span className="text-xs text-yellow-400">(you)</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-300 space-y-0.5">
                  <div>Territory: {territoryCount}</div>
                  <div>Gold: {player.gold}</div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-2 h-2 rounded-full ${player.isConnected ? 'bg-green-400' : 'bg-red-400'}`}
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
            <div className="text-xs text-gray-300 space-y-1">
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
            playerIds={playerIds}
            validTargets={validMoves}
          />
        </div>

        {/* Action bar */}
        {onBuyUnit && onBuildStructure && onEndTurn && onSurrender ? (
          <ActionBar
            isMyTurn={isMyTurn}
            selectedHex={selectedHex}
            provinceGold={selectedProvince?.gold ?? null}
            turnTimeRemaining={turnTimeRemaining ?? null}
            onBuyUnit={onBuyUnit}
            onBuildStructure={onBuildStructure}
            onEndTurn={onEndTurn}
            onSurrender={onSurrender}
          />
        ) : (
          <div className="h-14 bg-gray-800 border-t border-gray-700 flex items-center justify-center">
            <span className="text-sm text-gray-500">
              Actions will appear here
            </span>
          </div>
        )}
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
