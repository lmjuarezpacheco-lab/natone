import type { Me, RollEntry } from "../types";
import { type Adv, type Pool, advApplies, buildResult, diceToThrow, formatNotation, throwWithRng } from "./notation";

const ADV_SUFFIX: Record<Adv, string> = { normal: "", adv: " (ventaja)", dis: " (desventaja)" };

interface Options {
  /** What the roll is for, for example "Goblin · Scimitar". */
  label?: string;
  hidden?: boolean;
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
    notation: formatNotation(pool) + (advApplies(pool, adv) ? ADV_SUFFIX[adv] : ""),
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
