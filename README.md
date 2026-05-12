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

### Environment Variables

Copy the example files and fill in your values:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_LOGTO_ENDPOINT` | `client/.env` | Logto tenant URL (e.g. `https://xxx.logto.app`) |
| `VITE_LOGTO_APP_ID` | `client/.env` | Logto SPA application ID |
| `LOGTO_ENDPOINT` | `server/.env` | Logto tenant URL (for JWKS token verification) |
| `JWT_SECRET` | `server/.env` | Secret for signing server JWTs (defaults to dev secret) |
| `PORT` | `server/.env` | Server port (defaults to 3001) |
| `CORS_ORIGINS` | `server/.env` | Comma-separated allowed origins |

Logto variables are optional — if omitted, only guest login is available.

**Logto Console setup:** Add `http://localhost:5173/callback` as a redirect URI and `http://localhost:5173/` as a post sign-out redirect URI in your Logto SPA app settings.

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
| 🤴 Baron | 3 | 30g | 12g |
| 🐴 Knight | 4 | 40g | 20g |

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

## Mobile & Touch

The game is fully playable on phones and tablets in both portrait and landscape orientations.

- **Tap** a hex to select it (instant, no long-press needed)
- **Drag** to pan the map
- **Pinch** to zoom in/out
- **Fullscreen** button (⛶) hides the browser chrome for more screen space
- **Sidebar** is a slide-in drawer on mobile/tablet — toggle with ☰
- **Action bar** shows two rows in portrait (buy/build + actions) and one scrollable row in landscape
- **Orientation change** automatically re-centers and re-fits the map
- **Dynamic viewport** uses `dvh`/`dvw` so the game fills the screen properly on mobile browsers

To test on a real device over Wi-Fi:
```bash
npm run build -w shared && npm run build -w client && npm run build -w server && npm run start -w server
# Then open http://<your-local-ip>:3001 on your phone (same network)
```

## Session & Reconnection

- Players can authenticate as **guests** (enter a name) or **sign in via Logto** (if configured). Auth tokens are stored in `localStorage` and persist across page reloads.
- Logto sign-in verifies the ID token server-side via JWKS, then issues a server JWT — the same format used for guest sessions.
- The game URL (hash route) is the source of truth for reconnection — no separate session storage for game IDs.
- If a player disconnects (e.g. refresh, network drop), they have **60 seconds** to reconnect before being auto-surrendered.
- Each player can only be in **one game at a time**. Starting or joining a new game automatically surrenders from any previous game.
- Explicitly leaving a room or surrendering returns the player to the lobby with no rejoin.

## Game Lifecycle

- When a game finishes (one player conquers all, or all human players are eliminated), the game state is cleaned up from server memory after a short delay.
- If only AI players remain (all humans eliminated or surrendered), the game ends immediately.
- All game state is in-memory — restarting the server clears all active games.
