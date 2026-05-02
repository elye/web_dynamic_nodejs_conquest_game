export interface PlayerColor {
  base: string;
  light: string;
  dark: string;
  fill: string; // for hex fill (semi-transparent)
}

const PLAYER_COLORS: PlayerColor[] = [
  { base: '#ef4444', light: '#fca5a5', dark: '#991b1b', fill: 'rgba(239, 68, 68, 0.35)' },
  { base: '#3b82f6', light: '#93c5fd', dark: '#1e3a8a', fill: 'rgba(59, 130, 246, 0.35)' },
  { base: '#22c55e', light: '#86efac', dark: '#166534', fill: 'rgba(34, 197, 94, 0.35)' },
  { base: '#eab308', light: '#fde047', dark: '#854d0e', fill: 'rgba(234, 179, 8, 0.35)' },
  { base: '#a855f7', light: '#d8b4fe', dark: '#581c87', fill: 'rgba(168, 85, 247, 0.35)' },
  { base: '#f97316', light: '#fdba74', dark: '#9a3412', fill: 'rgba(249, 115, 22, 0.35)' },
];

/** Get player color by index (0-5). Wraps around if index > 5. */
export function getPlayerColor(index: number): PlayerColor {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** Get player color by player ID from a players array. */
export function getPlayerColorById(
  playerId: string,
  playerIds: string[],
): PlayerColor {
  const index = playerIds.indexOf(playerId);
  return getPlayerColor(index >= 0 ? index : 0);
}

export const NEUTRAL_HEX_FILL = '#d1d5db';
export const WATER_HEX_FILL = '#60a5fa';
export const FOREST_COLOR = '#16a34a';
export const MOUNTAIN_COLOR = '#78716c';
export const GRID_STROKE = '#6b7280';
export const SELECTED_STROKE = '#facc15';
export const VALID_TARGET_STROKE = '#86efac';
