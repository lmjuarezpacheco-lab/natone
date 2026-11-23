import type { Combat, Combatant, Me, Patch, Patches, Settings } from "./types";
import { DEFAULT_COMBAT, DEFAULT_SETTINGS } from "./types";

/** Returns an integer from 1 to `sides`. */
export type Rng = (sides: number) => number;

export const INITIATIVE_RANGE = { min: -99, max: 999 } as const;
export const BONUS_RANGE = { min: -20, max: 30 } as const;

export interface Step {
  combat: Combat;
  patches: Patches;
}

/** Highest initiative first. Missing values go last. Ties: higher bonus, then name. */
export function sortCombatants<T extends Combatant>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if ((a.initiative === null) !== (b.initiative === null)) return a.initiative === null ? 1 : -1;
    if (a.initiative !== null && b.initiative !== null && a.initiative !== b.initiative) {
      return b.initiative - a.initiative;
    }
    if (a.bonus !== b.bonus) return b.bonus - a.bonus;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function applyPatches<T extends Combatant>(list: readonly T[], patches: Patches): T[] {
  return list.map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c));
}

/** d20 + bonus for every combatant, or only for those without a value. */
export function rollPatches(list: readonly Combatant[], rng: Rng, onlyMissing: boolean): Patches {
  const patches: Patches = {};
  for (const c of list) {
    if (onlyMissing && c.initiative !== null) continue;
    patches[c.id] = { initiative: rng(20) + c.bonus };
  }
  return patches;
}

/** Starts round 1. With automatic reroll, combatants without a value are rolled first. */
export function startCombat(list: readonly Combatant[], settings: Settings, rng: Rng): Step {
  const auto = settings.mode === "reroll" && settings.rerollAuto;
  const patches = auto ? rollPatches(list, rng, true) : {};
  const first = sortCombatants(applyPatches(list, patches))[0];
  return { combat: { round: 1, activeId: first?.id ?? null }, patches };
}

export function nextTurn(
  list: readonly Combatant[],
  combat: Combat,
  settings: Settings,
  rng: Rng,
): Step {
  if (list.length === 0) return { combat, patches: {} };
  if (combat.round === 0) return startCombat(list, settings, rng);

  const sorted = sortCombatants(list);
  const index = sorted.findIndex((c) => c.id === combat.activeId);
  // No active turn: the round waits for manual values, or the active token left the tracker.
  if (index === -1) return { combat: { ...combat, activeId: sorted[0].id }, patches: {} };
  if (index < sorted.length - 1) {
    return { combat: { ...combat, activeId: sorted[index + 1].id }, patches: {} };
  }

  const round = combat.round + 1;
  if (settings.mode === "standard") {
    return { combat: { round, activeId: sorted[0].id }, patches: {} };
  }
  if (settings.rerollAuto) {
    const patches = rollPatches(list, rng, false);
    const first = sortCombatants(applyPatches(list, patches))[0];
    return { combat: { round, activeId: first.id }, patches };
  }
  const patches: Patches = {};
  for (const c of list) patches[c.id] = { initiative: null };
  return { combat: { round, activeId: null }, patches };
}

/** Steps back inside the round. Crosses rounds only in standard mode, where order does not change. */
export function previousTurn(
  list: readonly Combatant[],
  combat: Combat,
  settings: Settings,
): Combat {
  if (combat.round === 0) return combat;
  const sorted = sortCombatants(list);
  const index = sorted.findIndex((c) => c.id === combat.activeId);
  if (index > 0) return { ...combat, activeId: sorted[index - 1].id };
  if (index === 0 && settings.mode === "standard" && combat.round > 1) {
    return { round: combat.round - 1, activeId: sorted[sorted.length - 1].id };
  }
  return combat;
}

export function endCombat(list: readonly Combatant[]): Step {
  const patches: Patches = {};
  for (const c of list) patches[c.id] = { initiative: null };
  return { combat: { ...DEFAULT_COMBAT }, patches };
}

export function canEdit(me: Pick<Me, "id" | "role">, settings: Settings, c: Combatant): boolean {
  return me.role === "GM" || (settings.playersEditOwn && c.ownerId === me.id);
}

export function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Reduces an untrusted player request to the fields a player may change. Returns null when nothing valid remains. */
export function sanitizePlayerPatch(raw: unknown): Patch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  const patch: Patch = {};
  if ("initiative" in input) {
    patch.initiative =
      input.initiative === null
        ? null
        : clampInt(input.initiative, INITIATIVE_RANGE.min, INITIATIVE_RANGE.max);
    if (input.initiative !== null && patch.initiative === null) return null;
  }
  if ("bonus" in input) {
    const bonus = clampInt(input.bonus, BONUS_RANGE.min, BONUS_RANGE.max);
    if (bonus === null) return null;
    patch.bonus = bonus;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export function readSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const input = raw as Record<string, unknown>;
  return {
    mode: input.mode === "reroll" ? "reroll" : "standard",
    rerollAuto: typeof input.rerollAuto === "boolean" ? input.rerollAuto : DEFAULT_SETTINGS.rerollAuto,
    playersEditOwn: input.playersEditOwn === true,
  };
}

export function readCombat(raw: unknown): Combat {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_COMBAT };
  const input = raw as Record<string, unknown>;
  const round = clampInt(input.round, 0, 9999) ?? 0;
  return { round, activeId: typeof input.activeId === "string" ? input.activeId : null };
}
