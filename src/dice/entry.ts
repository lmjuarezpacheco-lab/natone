import type { Combatant, Me, Patches, RollEntry } from "../types";
import { t } from "../i18n";
import { type Adv, type Pool, advApplies, buildResult, diceToThrow, formatNotation, throwWithRng } from "./notation";

const advSuffix = (adv: Adv) => (adv === "normal" ? "" : ` (${t(adv === "adv" ? "roll.advantage" : "roll.disadvantage")})`);

interface Options {
  /** What the roll is for, for example "Goblin · Scimitar". */
  label?: string;
  hidden?: boolean;
  kind?: RollEntry["kind"];
}

/** Builds a log entry from dice that were already thrown, in 3D or not. */
export function makeEntry(
  me: Me,
  pool: Pool,
  adv: Adv,
  thrown: readonly { sides: number; value: number }[],
  options: Options = {},
): RollEntry {
  const result = buildResult(pool, adv, thrown);
  return {
    id: crypto.randomUUID(),
    playerId: me.id,
    playerName: me.name,
    color: me.color,
    ...(options.label ? { label: options.label } : {}),
    ...(options.kind ? { kind: options.kind } : {}),
    notation: formatNotation(pool) + (advApplies(pool, adv) ? advSuffix(adv) : ""),
    dice: result.dice,
    modifier: pool.modifier,
    total: result.total,
    hidden: options.hidden === true,
    time: Date.now(),
  };
}

/** Instant roll without 3D dice. */
export function quickRoll(me: Me, pool: Pool, adv: Adv, options: Options = {}): RollEntry {
  return makeEntry(me, pool, adv, throwWithRng(diceToThrow(pool, adv)), options);
}

/**
 * Log entries for initiative that was just rolled: one per combatant whose patch sets a value.
 * The d20 face is the new initiative minus the bonus.
 *
 * Players do not see hidden tokens in the tracker, so a roll for a hidden token is a hidden entry:
 * it stays in the log of whoever rolled it and is never shared. A visible token shows its bonus and
 * its initiative to everyone already, so its entry tells players nothing new.
 */
export function initiativeEntries(me: Me, combatants: readonly Combatant[], patches: Patches): RollEntry[] {
  return combatants.flatMap((c) => {
    const initiative = patches[c.id]?.initiative;
    if (typeof initiative !== "number") return [];
    const pool: Pool = { counts: { 20: 1 }, modifier: c.bonus };
    const thrown = [{ sides: 20, value: initiative - c.bonus }];
    return [makeEntry(me, pool, "normal", thrown, { label: `${t("roll.initiative")} · ${c.name}`, hidden: !c.visible, kind: "initiative" })];
  });
}
