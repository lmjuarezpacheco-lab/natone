import { MAX_DICE, cryptoRng, throwWithRng } from "./notation";

export interface Thrown {
  sides: number;
  value: number;
}
export type DiceGroup = { sides: number; qty: number };

/**
 * Throws dice and resolves with the faces. Every roll in the panel goes through one of these:
 * in 3D while the dice tray is open, with the random source otherwise.
 */
export type ThrowDice = (dice: readonly DiceGroup[]) => Promise<Thrown[]>;

/** True when `result` has exactly the dice that were asked for, each with a face that exists. */
export function matchesThrow(dice: readonly DiceGroup[], result: readonly Thrown[]): boolean {
  const wanted = new Map<number, number>();
  for (const group of dice) wanted.set(group.sides, (wanted.get(group.sides) ?? 0) + group.qty);
  for (const die of result) {
    if (!Number.isInteger(die.value) || die.value < 1 || die.value > die.sides) return false;
    wanted.set(die.sides, (wanted.get(die.sides) ?? 0) - 1);
  }
  return [...wanted.values()].every((left) => left === 0);
}

/**
 * `count` d20 faces. The tray takes at most MAX_DICE dice at once, so a larger table gets the rest
 * from the random source.
 */
export async function throwD20s(throwDice: ThrowDice, count: number): Promise<number[]> {
  if (count <= 0) return [];
  const inTray = Math.min(count, MAX_DICE);
  const thrown = await throwDice([{ sides: 20, qty: inTray }]);
  const rest = throwWithRng([{ sides: 20, qty: count - inTray }], cryptoRng);
  return [...thrown, ...rest].map((die) => die.value);
}
