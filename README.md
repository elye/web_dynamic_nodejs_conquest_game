# Conquest

An online hex-based territory strategy game.

## Packages

- **shared/** — Shared types and constants
- **server/** — Node.js backend (Express + WebSocket)
- **client/** — React frontend (Vite + Tailwind)

## Development

```bash
npm install
npm run dev        # Run both client and server
npm run dev:server # Run server only
npm run dev:client # Run client only
npm run build      # Build all packages
```

## Game URLs

Games use short 6-character alphanumeric IDs and hash-based routing:

- **Lobby:** `http://localhost:5173/`
- **Game room:** `http://localhost:5173/#room/ABC123`
- **In-progress game:** `http://localhost:5173/#game/ABC123`

Refreshing the page or navigating back to the same URL will reconnect the player to their game, as long as it's still active.

## Session & Reconnection

- Players authenticate as guests with a name. Auth tokens are stored in `localStorage` and persist across page reloads.
- The game URL (hash route) is the source of truth for reconnection — no separate session storage for game IDs.
- If a player disconnects (e.g. refresh, network drop), they have **60 seconds** to reconnect before being auto-surrendered.
- Each player can only be in **one game at a time**. Starting or joining a new game automatically surrenders from any previous game.
- Explicitly leaving a room or surrendering returns the player to the lobby with no rejoin.

## Game Lifecycle

- When a game finishes (one player conquers all, or all human players are eliminated), the game state is cleaned up from server memory after a short delay.
- If only AI players remain (all humans eliminated or surrendered), the game ends immediately.
- All game state is in-memory — restarting the server clears all active games.
