# Conquest

An online hex-based territory strategy game.

## Packages

- **shared/** — Shared types and constants
- **server/** — Node.js backend (Express + WebSocket)
- **client/** — React frontend (Vite + Tailwind)

## Development

```bash
npm install
```

### Dev mode (hot-reload, two terminals)

```bash
# Terminal 1 — server (auto-reloads on changes)
npm run dev -w server

# Terminal 2 — client (Vite dev server with HMR)
npm run dev -w client
```

Access at **http://localhost:5173**

### Production build + start (single server)

```bash
npm run build -w shared && npm run build -w client && npm run build -w server && npm run start -w server
```

Access at **http://localhost:3001** (server serves the built client)

### Rebuild after code changes

If you change `shared/` types, rebuild shared first:
```bash
npm run build -w shared
```

If deploying, always rebuild all three in order: `shared → client → server`.

## Game URLs

Games use short 6-character alphanumeric IDs and hash-based routing:

- **Lobby:** `http://localhost:5173/`
- **Game room:** `http://localhost:5173/#room/ABC123`
- **In-progress game:** `http://localhost:5173/#game/ABC123`

Refreshing the page or navigating back to the same URL will reconnect the player to their game, as long as it's still active.

## Gameplay

### Units
| Unit | Str | Cost | Upkeep |
|------|-----|------|--------|
| 🧑‍🌾 Peasant | 1 | 10g | 2g |
| 💂 Spearman | 2 | 20g | 6g |
| 🤴 Baron | 3 | 30g | 18g |
| 🐴 Knight | 4 | 40g | 54g |

- **Upgrade units** by clicking a higher-tier button — costs the difference (e.g. Peasant → Spearman = 10g).
- **Merge units** by moving one onto another — combined cost determines the result.
- **Retire** a unit (⬇️) to remove it and reclaim half its cost.

### Structures
| Structure | Cost | Defense | Special |
|-----------|------|---------|---------|
| 🏠 Farmhouse | 10g | 0 | x2 income on hex |
| 🏰 Tower | 20g | +1 | Defense to hex & neighbors |
| 🏯 Castle | 30g | +2 | Defense to hex & neighbors |

- **Upgrade structures** by clicking a higher-tier button — costs the difference.
- Units **jump through** connected friendly structures to reach tiles on the other side.
- Structures built this turn (⏳) cannot be jumped through yet.
- You can **replace a structure with a unit** (with confirmation) if you need the hex.

### Economy
- Each hex = 1 gold/turn. Farmhouses give x2 income on their hex.
- Trees 🌲 block income. Move a unit onto them to chop.
- If a province goes bankrupt, all its units starve.

### Capitols ⭐
- Every province (2+ hexes) auto-gets a capitol (Farmhouse with ⭐).
- You need a capitol to buy units.
- Capturing an enemy capitol steals its gold.

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
