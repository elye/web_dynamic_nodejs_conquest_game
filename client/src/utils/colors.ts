export interface PlayerColor {
  base: string;
  light: string;
  dark: string;
  fill: string;
  border: string;
}

const PLAYER_COLORS: PlayerColor[] = [
  { base: '#ef4444', light: '#fca5a5', dark: '#991b1b', fill: '#fca5a5', border: '#e89090' },
  { base: '#3b82f6', light: '#93c5fd', dark: '#1e3a8a', fill: '#93c5fd', border: '#7fb5eb' },
  { base: '#22c55e', light: '#86efac', dark: '#166534', fill: '#86efac', border: '#72db98' },
  { base: '#eab308', light: '#fde68a', dark: '#854d0e', fill: '#fde68a', border: '#e9d276' },
  { base: '#a855f7', light: '#d8b4fe', dark: '#581c87', fill: '#d8b4fe', border: '#c4a0ea' },
  { base: '#f97316', light: '#fdba74', dark: '#9a3412', fill: '#fdba74', border: '#e9a660' },
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

export const NEUTRAL_HEX_FILL = '#d4c4a8';
export const NEUTRAL_BORDER = '#c0b094';
export const WATER_HEX_FILL = '#1e3a5f';
export const WATER_BORDER = '#162e4d';
export const FOREST_COLOR = '#16a34a';
export const MOUNTAIN_COLOR = '#78716c';
export const GRID_STROKE = '#6b7280';
export const SELECTED_STROKE = '#fbbf24';
export const VALID_TARGET_STROKE = '#86efac';
