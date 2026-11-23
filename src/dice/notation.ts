import type { DieResult } from "../types";

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export const MAX_DICE = 30;
export const MAX_MODIFIER = 999;

export type Adv = "normal" | "adv" | "dis";

export interface Keep {
  /** "h": keep the highest dice. "l": keep the lowest. */
  mode: "h" | "l";
  n: number;
}

export interface Pool {
  /** Dice count per number of sides. */
  counts: Record<number, number>;
  modifier: number;
  /** Per number of sides: how many of those dice count toward the total (4d6kh3). */
  keep?: Record<number, Keep>;
}

export const EMPTY_POOL: Pool = { counts: {}, modifier: 0 };

export function diceCount(pool: Pool): number {
  return Object.values(pool.counts).reduce((sum, n) => sum + n, 0);
}

/** Parses text such as "2d6 + d20 - 1" or "4d6kh3". Returns null when the text is not valid. */
export function parseNotation(text: string): Pool | null {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (compact === "") return null;
  const term = /([+-]?)(?:(\d*)d(\d+)(?:k([hl]?)(\d*))?|(\d+))/y;
  const counts: Record<number, number> = {};
  const keep: Record<number, Keep> = {};
  let modifier = 0;
  let position = 0;
  while (position < compact.length) {
    term.lastIndex = position;
    const match = term.exec(compact);
    if (!match) return null;
    const [, sign, qtyText, sidesText, keepMode, keepText, constant] = match;
    if (position > 0 && sign === "") return null;
    if (sidesText !== undefined) {
      const sides = Number(sidesText);
      const qty = qtyText === "" ? 1 : Number(qtyText);
      if (sign === "-" || qty < 1) return null;
      if (!(DIE_SIDES as readonly number[]).includes(sides)) return null;
      // A keep rule covers every die of that size, so the size may appear only once.
      if (sides in counts && (keepMode !== undefined || sides in keep)) return null;
      counts[sides] = (counts[sides] ?? 0) + qty;
      if (keepMode !== undefined) {
        const n = keepText === "" ? 1 : Number(keepText);
        if (n < 1 || n > qty) return null;
        keep[sides] = { mode: keepMode === "l" ? "l" : "h", n };
      }
    } else {
      modifier += (sign === "-" ? -1 : 1) * Number(constant);
    }
    position = term.lastIndex;
  }
  const pool: Pool = Object.keys(keep).length > 0 ? { counts, modifier, keep } : { counts, modifier };
  if (diceCount(pool) === 0 || diceCount(pool) > MAX_DICE) return null;
  if (Math.abs(modifier) > MAX_MODIFIER) return null;
  return pool;
}

export function formatNotation(pool: Pool): string {
  const parts = DIE_SIDES.filter((s) => pool.counts[s] > 0).map((s) => {
    const rule = pool.keep?.[s];
    return `${pool.counts[s]}d${s}${rule ? `k${rule.mode}${rule.n}` : ""}`;
  });
  let text = parts.join(" + ");
  if (pool.modifier !== 0) {
    const sign = pool.modifier > 0 ? "+" : "-";
    text += text === "" ? `${pool.modifier}` : ` ${sign} ${Math.abs(pool.modifier)}`;
  }
  return text;
}

/** Advantage and disadvantage apply only to a single d20 without its own keep rule. */
export function advApplies(pool: Pool, adv: Adv): boolean {
  return adv !== "normal" && pool.counts[20] === 1 && !pool.keep?.[20];
}

/** Dice to throw, including the extra d20 for advantage or disadvantage. */
export function diceToThrow(pool: Pool, adv: Adv): { sides: number; qty: number }[] {
  return DIE_SIDES.filter((s) => pool.counts[s] > 0).map((sides) => ({
    sides,
    qty: pool.counts[sides] + (sides === 20 && advApplies(pool, adv) ? 1 : 0),
  }));
}

export function buildResult(
  pool: Pool,
  adv: Adv,
  thrown: readonly { sides: number; value: number }[],
): { dice: DieResult[]; total: number } {
  const dice: DieResult[] = thrown.map((d) => ({ sides: d.sides, value: d.value }));
  if (advApplies(pool, adv)) {
    const d20s = dice.filter((d) => d.sides === 20);
    if (d20s.length === 2) {
      const [first, second] = d20s;
      const keepFirst = adv === "adv" ? first.value >= second.value : first.value <= second.value;
      (keepFirst ? second : first).dropped = true;
    }
  }
  for (const [sides, rule] of Object.entries(pool.keep ?? {})) {
    const group = dice.filter((d) => d.sides === Number(sides));
    // Sorting is stable, so on a tie the die thrown first is kept.
    const ranked = [...group].sort((a, b) => (rule.mode === "h" ? b.value - a.value : a.value - b.value));
    for (const die of ranked.slice(rule.n)) die.dropped = true;
  }
  const sum = dice.reduce((acc, d) => acc + (d.dropped ? 0 : d.value), 0);
  return { dice, total: sum + pool.modifier };
}

/** Uniform integer from 1 to `sides` from the browser's secure random source. */
export function cryptoRng(sides: number): number {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return (buffer[0] % sides) + 1;
}

export function throwWithRng(
  dice: readonly { sides: number; qty: number }[],
  rng: (sides: number) => number = cryptoRng,
): { sides: number; value: number }[] {
  return dice.flatMap((d) => Array.from({ length: d.qty }, () => ({ sides: d.sides, value: rng(d.sides) })));
}

/** Sets the dice count for one size. Its keep rule always drops at least one die, or it is removed. */
export function withCount(pool: Pool, sides: number, count: number): Pool {
  const counts = { ...pool.counts, [sides]: Math.max(0, count) };
  const keep = { ...pool.keep };
  if (keep[sides] && keep[sides].n >= counts[sides]) {
    if (counts[sides] < 2) delete keep[sides];
    else keep[sides] = { ...keep[sides], n: counts[sides] - 1 };
  }
  return { counts, modifier: pool.modifier, ...(Object.keys(keep).length > 0 ? { keep } : {}) };
}

/** Sets or removes the keep rule for one die size. */
export function withKeep(pool: Pool, sides: number, rule: Keep | null): Pool {
  const keep = { ...pool.keep };
  if (rule) keep[sides] = rule;
  else delete keep[sides];
  return { counts: pool.counts, modifier: pool.modifier, ...(Object.keys(keep).length > 0 ? { keep } : {}) };
}
