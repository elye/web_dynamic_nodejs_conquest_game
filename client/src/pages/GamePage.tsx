import { useEffect, useState, useCallback } from 'react';
import {
  ServerMessageType,
  ClientMessageType,
  GameStatus,
} from '@conquest/shared';
import type {
  ServerMessage,
  UnitType,
  StructureType,
  HexCoord,
} from '@conquest/shared';
import { useAuthStore } from '../store/authStore';
import { useLobbyStore } from '../store/lobbyStore';
import { useGameStore } from '../store/gameStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { usePing } from '../hooks/usePing';
import GameBoard from '../components/GameBoard';
import HowToPlay from '../components/HowToPlay';
import { navigateTo } from '../utils/navigation';

export default function GamePage() {
  const playerId = useAuthStore((s) => s.playerId);
  const token = useAuthStore((s) => s.token);
  const gameState = useGameStore((s) => s.gameState);
  const setGameState = useGameStore((s) => s.setGameState);
  const applyDelta = useGameStore((s) => s.applyDelta);
  const addChatMessage = useGameStore((s) => s.addChatMessage);
  const setTurnTimer = useGameStore((s) => s.setTurnTimer);
  const decrementTurnTimer = useGameStore((s) => s.decrementTurnTimer);
  const selectHex = useGameStore((s) => s.selectHex);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const optimisticMoveUnit = useGameStore((s) => s.optimisticMoveUnit);
  const turnTimeRemaining = useGameStore((s) => s.turnTimeRemaining);
  const resetGame = useGameStore((s) => s.reset);

  const lobbyGameState = useLobbyStore((s) => s.gameState);
  const gameId = lobbyGameState?.id ?? gameState?.id ?? '';

  const [notification, setNotification] = useState<string | null>(null);
  const [gameOverMsg, setGameOverMsg] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const { sendMessage, isConnected, lastMessage } = useWebSocket(
    gameId,
    token ?? '',
  );
  const { pingWarning } = usePing(gameId, playerId);

  // Seed gameStore from lobby's initial state (only if it's a full state)
  useEffect(() => {
    if (lobbyGameState && !gameState && lobbyGameState.hexes) {
      setGameState(lobbyGameState);
    }
  }, [lobbyGameState, gameState, setGameState]);

  // Process incoming server messages
  useEffect(() => {
    if (!lastMessage) return;
    const msg: ServerMessage = lastMessage;

    switch (msg.type) {
      case ServerMessageType.GAME_STATE_FULL:
        setGameState(msg.state);
        break;
      case ServerMessageType.GAME_STATE_DELTA:
        applyDelta(msg.delta);
        break;
      case ServerMessageType.TURN_CHANGED:
        applyDelta({
          currentTurnPlayerId: msg.playerId,
          turnNumber: msg.turnNumber,
        });
        setTurnTimer(
          gameState?.settings.turnTimeLimit
            ? Math.round(gameState.settings.turnTimeLimit / 1000)
            : 0,
        );
        clearSelection();
        break;
      case ServerMessageType.TURN_TIMER_UPDATE:
        setTurnTimer(Math.round(msg.remainingMs / 1000));
        break;
      case ServerMessageType.PLAYER_DISCONNECTED:
        showNotification(`Player disconnected: ${msg.playerId}`);
        break;
      case ServerMessageType.PLAYER_RECONNECTED:
        showNotification(`Player reconnected: ${msg.playerId}`);
        break;
      case ServerMessageType.GAME_OVER: {
        if (msg.winnerId) {
          const winnerName =
            gameState?.players.find((p) => p.id === msg.winnerId)?.name ??
            msg.winnerId;
          setGameOverMsg(`${winnerName} wins! ${msg.reason}`);
        } else {
          setGameOverMsg(msg.reason);
        }
        break;
      }
      case ServerMessageType.CHAT_BROADCAST:
        addChatMessage({
          sender: msg.playerName,
          message: msg.content,
          timestamp: msg.timestamp,
        });
        break;
      case ServerMessageType.ERROR:
        showNotification(`Error: ${msg.message}`);
        break;
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local countdown timer for turn time
  useEffect(() => {
    if (turnTimeRemaining === null || turnTimeRemaining <= 0) return;
    const interval = setInterval(() => {
      decrementTurnTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [turnTimeRemaining !== null && turnTimeRemaining > 0, decrementTurnTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  function showNotification(text: string) {
    setNotification(text);
    setTimeout(() => setNotification(null), 4000);
  }

  // Handlers — read selection state directly from Zustand (no React subscription needed)
  const getSelection = useCallback(() => {
    const s = useGameStore.getState();
    return { selectedHex: s.selectedHex, selectedUnit: s.selectedUnit, validMoves: s.validMoves };
  }, []);

  const handleHexClick = useCallback(
    (q: number, r: number) => {
      const { selectedHex: sh, selectedUnit: su, validMoves: vm } = getSelection();

      // If clicking the already-selected hex, deselect
      if (sh && sh.q === q && sh.r === r) {
        clearSelection();
        return;
      }
      // If a unit is selected and this is a valid move target, move
      if (su && vm.some((m) => m.q === q && m.r === r)) {
        // Optimistic local update — move the unit immediately in the store
        optimisticMoveUnit(su.unitId, su.hex, { q, r });
        sendMessage({
          type: ClientMessageType.MOVE_UNIT,
          unitId: su.unitId,
          from: su.hex,
          to: { q, r },
        });
        clearSelection();
        return;
      }
      selectHex(q, r, playerId);
    },
    [sendMessage, clearSelection, selectHex, playerId, getSelection],
  );

  const handleMoveUnit = useCallback(
    (unitId: string, from: HexCoord, to: HexCoord) => {
      sendMessage({
        type: ClientMessageType.MOVE_UNIT,
        unitId,
        from,
        to,
      });
      clearSelection();
    },
    [sendMessage, clearSelection],
  );

  const handleBuyUnit = useCallback(
    (unitType: UnitType, hex: HexCoord) => {
      sendMessage({ type: ClientMessageType.BUY_UNIT, unitType, hex });
    },
    [sendMessage],
  );

  const handleBuildStructure = useCallback(
    (structureType: StructureType, hex: HexCoord) => {
      // Check if hex already has a structure — if so, upgrade instead of build
      const targetHex = gameState?.hexes.find(
        (h) => h.coord.q === hex.q && h.coord.r === hex.r,
      );
      if (targetHex?.structure) {
        sendMessage({
          type: ClientMessageType.UPGRADE_STRUCTURE,
          structureType,
          hex,
        });
      } else {
        sendMessage({
          type: ClientMessageType.BUILD_STRUCTURE,
          structureType,
          hex,
        });
      }
    },
    [sendMessage, gameState],
  );

  const handleEndTurn = useCallback(() => {
    sendMessage({ type: ClientMessageType.END_TURN });
  }, [sendMessage]);

  const handleUndo = useCallback(() => {
    sendMessage({ type: ClientMessageType.UNDO_TURN });
  }, [sendMessage]);

  const handleRedo = useCallback(() => {
    sendMessage({ type: ClientMessageType.REDO_ACTION });
  }, [sendMessage]);

  const handleSurrender = useCallback(() => {
    sendMessage({ type: ClientMessageType.SURRENDER });
  }, [sendMessage]);

  const handleRetireUnit = useCallback(
    (unitId: string) => {
      sendMessage({ type: ClientMessageType.RETIRE_UNIT, unitId });
    },
    [sendMessage],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => resetGame();
  }, [resetGame]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen">
      <GameBoard
        gameState={gameState}
        onHexClick={handleHexClick}
        currentPlayerId={playerId}
        isMyTurn={gameState.currentTurnPlayerId === playerId}
        turnTimeRemaining={turnTimeRemaining}
        onBuyUnit={handleBuyUnit}
        onBuildStructure={handleBuildStructure}
        onEndTurn={handleEndTurn}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSurrender={handleSurrender}
        onRetireUnit={handleRetireUnit}
        isConnected={isConnected}
      />

      {/* Notifications */}
      {notification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {notification}
        </div>
      )}

      {/* Help button */}
      <button
        onClick={() => setIsHelpOpen(true)}
        className="absolute top-4 right-20 bg-gray-800 border border-gray-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors z-40"
      >
        ❓ Help
      </button>

      <HowToPlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Ping warning */}
      {pingWarning && (
        <div className="absolute top-4 right-4 bg-red-900/80 border border-red-700 text-red-200 text-xs px-3 py-1.5 rounded z-50">
          Connection unstable
        </div>
      )}

      {/* Game over overlay */}
      {gameOverMsg && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-xl p-8 text-center max-w-md">
            <h2 className="text-2xl font-bold text-white mb-2">Game Over</h2>
            <p className="text-gray-300 mb-6">{gameOverMsg}</p>
            <button
              onClick={() => {
                resetGame();
                useLobbyStore.getState().setGameState(null);
                navigateTo('lobby');
              }}
              className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
