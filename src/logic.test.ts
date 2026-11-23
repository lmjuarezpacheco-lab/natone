import { describe, expect, it } from "vitest";
import { buildResult, diceToThrow, formatNotation, parseNotation, withCount, withKeep } from "./dice/notation";
import {
  canEdit,
  endCombat,
  nextTurn,
  previousTurn,
  rollPatches,
  sanitizePlayerPatch,
  sortCombatants,
  applyPatches,
} from "./logic";
import type { Combatant, Settings } from "./types";

const c = (id: string, initiative: number | null, bonus = 0, ownerId = "gm"): Combatant => ({
  id,
  name: id,
  initiative,
  bonus,
  ownerId,
  profileId: null,
  visible: true,
});

const standard: Settings = { mode: "standard", rerollAuto: true, playersEditOwn: false };
const rerollAuto: Settings = { mode: "reroll", rerollAuto: true, playersEditOwn: false };
const rerollManual: Settings = { mode: "reroll", rerollAuto: false, playersEditOwn: false };
const never = () => {
  throw new Error("rng must not be used");
};

describe("sortCombatants", () => {
  it("orders by initiative, then bonus, then name, with missing values last", () => {
    const sorted = sortCombatants([c("b", 12), c("x", null), c("a", 12), c("hi", 12, 3), c("top", 20)]);
    expect(sorted.map((x) => x.id)).toEqual(["top", "hi", "a", "b", "x"]);
  });
});

describe("nextTurn", () => {
  const list = [c("a", 15), c("b", 10), c("d", 5)];

  it("starts combat on the highest initiative", () => {
    expect(nextTurn(list, { round: 0, activeId: null }, standard, never)).toEqual({
      combat: { round: 1, activeId: "a" },
      patches: {},
    });
  });

  it("automatic reroll rolls missing values before the first round", () => {
    const fresh = [c("a", null, 2), c("b", 12, 0)];
    const step = nextTurn(fresh, { round: 0, activeId: null }, rerollAuto, () => 15);
    expect(step).toEqual({ combat: { round: 1, activeId: "a" }, patches: { a: { initiative: 17 } } });
  });

  it("advances inside the round", () => {
    expect(nextTurn(list, { round: 1, activeId: "a" }, standard, never).combat).toEqual({
      round: 1,
      activeId: "b",
    });
  });

  it("standard mode wraps to the same order", () => {
    expect(nextTurn(list, { round: 1, activeId: "d" }, standard, never)).toEqual({
      combat: { round: 2, activeId: "a" },
      patches: {},
    });
  });

  it("auto reroll rolls d20 + bonus for everyone and starts on the new highest", () => {
    const withBonus = [c("a", 15, 2), c("b", 10, 0), c("d", 5, 5)];
    const rolls = [1, 10, 19];
    const step = nextTurn(withBonus, { round: 1, activeId: "d" }, rerollAuto, () => rolls.shift()!);
    expect(step.patches).toEqual({ a: { initiative: 3 }, b: { initiative: 10 }, d: { initiative: 24 } });
    expect(step.combat).toEqual({ round: 2, activeId: "d" });
  });

  it("manual reroll clears values and waits", () => {
    const step = nextTurn(list, { round: 1, activeId: "d" }, rerollManual, never);
    expect(step.combat).toEqual({ round: 2, activeId: null });
    expect(step.patches).toEqual({ a: { initiative: null }, b: { initiative: null }, d: { initiative: null } });
  });

  it("a waiting round starts on the highest value once values are entered", () => {
    const entered = [c("a", 3), c("b", 18), c("d", 9)];
    expect(nextTurn(entered, { round: 2, activeId: null }, rerollManual, never).combat).toEqual({
      round: 2,
      activeId: "b",
    });
  });

  it("does nothing without combatants", () => {
    const combat = { round: 0, activeId: null };
    expect(nextTurn([], combat, standard, never).combat).toBe(combat);
  });
});

describe("previousTurn", () => {
  const list = [c("a", 15), c("b", 10)];
  it("steps back inside the round", () => {
    expect(previousTurn(list, { round: 2, activeId: "b" }, standard)).toEqual({ round: 2, activeId: "a" });
  });
  it("crosses rounds only in standard mode", () => {
    expect(previousTurn(list, { round: 2, activeId: "a" }, standard)).toEqual({ round: 1, activeId: "b" });
    expect(previousTurn(list, { round: 2, activeId: "a" }, rerollAuto)).toEqual({ round: 2, activeId: "a" });
  });
});

describe("rolls and combat end", () => {
  it("rollPatches can skip combatants that already have a value", () => {
    const list = [c("a", 15, 1), c("b", null, 4)];
    expect(rollPatches(list, () => 10, true)).toEqual({ b: { initiative: 14 } });
  });
  it("endCombat clears initiative and keeps the bonus", () => {
    const list = [c("a", 15, 3)];
    const step = endCombat(list);
    expect(step.combat).toEqual({ round: 0, activeId: null });
    expect(applyPatches(list, step.patches)[0]).toMatchObject({ initiative: null, bonus: 3 });
  });
});

describe("permissions", () => {
  const mine = c("mine", 1, 0, "p1");
  const other = c("other", 1, 0, "p2");
  const on: Settings = { ...standard, playersEditOwn: true };
  it("GM edits everything", () => {
    expect(canEdit({ id: "gm", role: "GM" }, standard, other)).toBe(true);
  });
  it("players edit only their own token, and only when the GM allows it", () => {
    const p1 = { id: "p1", role: "PLAYER" as const };
    expect(canEdit(p1, standard, mine)).toBe(false);
    expect(canEdit(p1, on, mine)).toBe(true);
    expect(canEdit(p1, on, other)).toBe(false);
  });
  it("player requests keep only initiative and bonus, within range", () => {
    expect(sanitizePlayerPatch({ initiative: 17.4, ownerId: "p2" })).toEqual({ initiative: 17 });
    expect(sanitizePlayerPatch({ initiative: null, bonus: 99 })).toEqual({ initiative: null, bonus: 30 });
    expect(sanitizePlayerPatch({ initiative: "20" })).toBeNull();
    expect(sanitizePlayerPatch({ ownerId: "p1" })).toBeNull();
    expect(sanitizePlayerPatch("x")).toBeNull();
  });
});

describe("dice notation", () => {
  it("parses dice terms and modifiers", () => {
    expect(parseNotation("2d6 + d20 - 1")).toEqual({ counts: { 6: 2, 20: 1 }, modifier: -1 });
    expect(parseNotation("1D8+1d8+3")).toEqual({ counts: { 8: 2 }, modifier: 3 });
  });
  it("rejects invalid text", () => {
    for (const text of ["", "abc", "2d7", "5", "2d6 3", "-1d6", "0d6", "31d6", "2d6++1"]) {
      expect(parseNotation(text), text).toBeNull();
    }
  });
  it("formats in die order", () => {
    expect(formatNotation({ counts: { 20: 1, 6: 2 }, modifier: -1 })).toBe("2d6 + 1d20 - 1");
  });
  it("advantage throws two d20 and keeps the highest", () => {
    const pool = parseNotation("1d20+5")!;
    expect(diceToThrow(pool, "adv")).toEqual([{ sides: 20, qty: 2 }]);
    const thrown = [
      { sides: 20, value: 4 },
      { sides: 20, value: 17 },
    ];
    expect(buildResult(pool, "adv", thrown)).toEqual({
      dice: [
        { sides: 20, value: 4, dropped: true },
        { sides: 20, value: 17 },
      ],
      total: 22,
    });
    expect(buildResult(pool, "dis", thrown).total).toBe(9);
  });
  it("keeps the highest or lowest dice", () => {
    expect(parseNotation("4d6kh3")).toEqual({ counts: { 6: 4 }, modifier: 0, keep: { 6: { mode: "h", n: 3 } } });
    expect(parseNotation("2d20kl1 + 5")).toEqual({ counts: { 20: 2 }, modifier: 5, keep: { 20: { mode: "l", n: 1 } } });
    // "k" alone keeps the highest, and the number defaults to 1.
    expect(parseNotation("2d20k")).toEqual({ counts: { 20: 2 }, modifier: 0, keep: { 20: { mode: "h", n: 1 } } });
    expect(formatNotation(parseNotation("4D6KH3 + 2")!)).toBe("4d6kh3 + 2");
    const thrown = [6, 1, 4, 4].map((value) => ({ sides: 6, value }));
    expect(buildResult(parseNotation("4d6kh3")!, "normal", thrown)).toEqual({
      dice: [
        { sides: 6, value: 6 },
        { sides: 6, value: 1, dropped: true },
        { sides: 6, value: 4 },
        { sides: 6, value: 4 },
      ],
      total: 14,
    });
    expect(buildResult(parseNotation("4d6kl1")!, "normal", thrown).total).toBe(1);
  });
  it("keep applies per die size and leaves other dice alone", () => {
    const pool = parseNotation("3d8kh1 + 2d6 + 1")!;
    const thrown = [
      { sides: 6, value: 2 },
      { sides: 6, value: 3 },
      { sides: 8, value: 5 },
      { sides: 8, value: 7 },
      { sides: 8, value: 5 },
    ];
    expect(buildResult(pool, "normal", thrown).total).toBe(2 + 3 + 7 + 1);
  });
  it("rejects keep rules that make no sense", () => {
    for (const text of ["4d6kh5", "4d6kh0", "4d6kh3 + 2d6", "2d6 + 4d6kh3", "4d6kx3", "kh3"]) {
      expect(parseNotation(text), text).toBeNull();
    }
  });
  it("a d20 with its own keep rule ignores the advantage switch", () => {
    const pool = parseNotation("1d20kh1")!;
    expect(diceToThrow(pool, "adv")).toEqual([{ sides: 20, qty: 1 }]);
  });
  it("removing dice shrinks or removes the keep rule", () => {
    const pool = parseNotation("4d6kh3")!;
    expect(formatNotation(withCount(pool, 6, 5))).toBe("5d6kh3");
    expect(formatNotation(withCount(pool, 6, 3))).toBe("3d6kh2");
    expect(formatNotation(withCount(pool, 6, 1))).toBe("1d6");
    expect(withCount(pool, 6, 0)).toEqual({ counts: { 6: 0 }, modifier: 0 });
  });
  it("withKeep sets and removes a rule without touching other sizes", () => {
    const pool = withKeep(parseNotation("2d20 + 4d6kh3")!, 20, { mode: "l", n: 1 });
    expect(formatNotation(pool)).toBe("4d6kh3 + 2d20kl1");
    expect(formatNotation(withKeep(pool, 6, null))).toBe("4d6 + 2d20kl1");
    expect(withKeep(parseNotation("2d20k")!, 20, null)).toEqual({ counts: { 20: 2 }, modifier: 0 });
  });
  it("advantage is ignored when the pool is not a single d20", () => {
    const pool = parseNotation("2d20")!;
    expect(diceToThrow(pool, "adv")).toEqual([{ sides: 20, qty: 2 }]);
    expect(buildResult(pool, "adv", [{ sides: 20, value: 4 }, { sides: 20, value: 17 }]).total).toBe(21);
  });
});
