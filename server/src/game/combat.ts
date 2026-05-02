import type { Hex, Unit } from '@conquest/shared';
import { StructureType, STRUCTURE_STRENGTH } from '@conquest/shared';
import { coordKey, getHexNeighbors } from './mapGenerator.js';

/**
 * Calculate the effective defense of a hex considering nearby tower bonuses.
 * Defense = defender unit strength (or 0) + sum of tower bonuses from
 * towers on the hex itself or on adjacent hexes owned by the same player.
 */
export function getHexDefense(hex: Hex, allHexes: Hex[]): number {
  const baseDefense = hex.unit ? hex.unit.strength : 0;

  if (!hex.owner) return baseDefense;

  const lookup = new Map<string, Hex>();
  for (const h of allHexes) {
    lookup.set(coordKey(h.coord.q, h.coord.r), h);
  }

  let towerBonus = 0;

  // Check the hex itself for a tower
  if (hex.structure && hex.owner === hex.structure.owner) {
    towerBonus += STRUCTURE_STRENGTH[hex.structure.type as StructureType] ?? 0;
  }

  // Check all 6 adjacent hexes for towers owned by the same player
  const neighbors = getHexNeighbors(hex.coord.q, hex.coord.r);
  for (const nc of neighbors) {
    const neighbor = lookup.get(coordKey(nc.q, nc.r));
    if (
      neighbor?.structure &&
      neighbor.owner === hex.owner
    ) {
      towerBonus +=
        STRUCTURE_STRENGTH[neighbor.structure.type as StructureType] ?? 0;
    }
  }

  return baseDefense + towerBonus;
}

/**
 * Check if an attacker can capture a target hex.
 * Attacker must have strength strictly greater than the hex's effective defense.
 */
export function canCapture(
  attacker: Unit,
  targetHex: Hex,
  allHexes: Hex[],
): boolean {
  const defense = getHexDefense(targetHex, allHexes);
  return attacker.strength > defense;
}

/**
 * Resolve combat between an attacker and a target hex.
 * Returns whether the attack succeeds and whether the defender is destroyed.
 */
export function resolveCombat(
  attacker: Unit,
  targetHex: Hex,
  allHexes: Hex[],
): { success: boolean; defenderDestroyed: boolean } {
  const defense = getHexDefense(targetHex, allHexes);
  const success = attacker.strength > defense;

  return {
    success,
    defenderDestroyed: success && targetHex.unit !== null,
  };
}
