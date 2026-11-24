import { describe, expect, it } from "vitest";
import { initiativeEntries } from "./dice/entry";
import { matchesThrow, throwD20s } from "./dice/throw";
import { MAX_BATCH, parseRoll, parseRolls } from "./history";
import { countRolls, feedRng, nextTurn, rollPatches } from "./logic";
import { DEFAULT_PREFS, readPrefs } from "./prefs";
import type { Combatant, Me, Settings } from "./types";

const me: Me = { id: "gm", name: "Máster", role: "GM", color: "#123456" };
const combatant = (id: string, patch: Partial<Combatant> = {}): Combatant => ({
  id,
  name: id.toUpperCase(),
  initiative: null,
  bonus: 0,
  ownerId: "gm",
  profileId: null,
  visible: true,
  ...patch,
});

describe("readPrefs", () => {
  it("starts with the tray closed", () => {
    expect(readPrefs({})).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.tray).toBe(false);
  });
  it("opens the tray for someone who had 3D dice on", () => {
    expect(readPrefs({ dice3d: true, theme: "rock" })).toMatchObject({ tray: true, theme: "rock" });
    expect(readPrefs({ dice3d: false }).tray).toBe(false);
  });
  it("prefers the new setting over the old one", () => {
    expect(readPrefs({ dice3d: true, tray: false }).tray).toBe(false);
  });
  it("ignores values of the wrong type", () => {
    expect(readPrefs({ tray: "yes", notify: 0, theme: 3 })).toEqual(DEFAULT_PREFS);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});

describe("initiativeEntries", () => {
  const list = [combatant("a", { bonus: 3 }), combatant("b", { bonus: -1, visible: false }), combatant("c")];

  it("makes one line per rolled combatant, with the d20 face and the bonus", () => {
    const entries = initiativeEntries(me, list, { a: { initiative: 17 }, c: { initiative: 9 } });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      label: "Iniciativa · A",
      kind: "initiative",
      notation: "1d20 + 3",
      dice: [{ sides: 20, value: 14 }],
      modifier: 3,
      total: 17,
      playerId: "gm",
    });
    expect(entries[1]).toMatchObject({ label: "Iniciativa · C", total: 9, dice: [{ sides: 20, value: 9 }] });
  });

  it("hides the line of a token that players cannot see", () => {
    const entries = initiativeEntries(me, list, { a: { initiative: 10 }, b: { initiative: 5 } });
    expect(entries.map((e) => [e.label, e.hidden])).toEqual([
      ["Iniciativa · A", false],
      ["Iniciativa · B", true],
    ]);
  });

  it("makes no line when the value is cleared or untouched", () => {
    expect(initiativeEntries(me, list, { a: { initiative: null }, b: { bonus: 2 } })).toEqual([]);
  });

  it("covers every combatant of an automatic reroll, hidden ones as hidden lines", () => {
    const settings: Settings = { mode: "reroll", rerollAuto: true, playersEditOwn: false, showMarker: true };
    const table = [combatant("a", { initiative: 5 }), combatant("b", { initiative: 3, visible: false })];
    const step = nextTurn(table, { round: 1, activeId: "b" }, settings, feedRng([12, 7], () => 1));
    const entries = initiativeEntries(me, table, step.patches);
    expect(entries.map((e) => [e.total, e.hidden])).toEqual([
      [12, false],
      [7, true],
    ]);
  });
});

describe("dice thrown before the step", () => {
  const list = [combatant("a", { bonus: 2 }), combatant("b", { initiative: 8 }), combatant("c", { bonus: -1 })];

  it("counts the dice a step asks for", () => {
    expect(countRolls((rng) => rollPatches(list, rng, false))).toBe(3);
    expect(countRolls((rng) => rollPatches(list, rng, true))).toBe(2);
    const standard: Settings = { mode: "standard", rerollAuto: true, playersEditOwn: false, showMarker: true };
    expect(countRolls((rng) => nextTurn(list, { round: 1, activeId: "a" }, standard, rng))).toBe(0);
  });

  it("feeds thrown faces in order and falls back after them", () => {
    const patches = rollPatches(list, feedRng([20, 1], () => 10), false);
    expect(patches).toEqual({ a: { initiative: 22 }, b: { initiative: 1 }, c: { initiative: 9 } });
  });

  it("throws at most 30 d20s in the tray and takes the rest from the random source", async () => {
    const asked: number[] = [];
    const faces = await throwD20s(async (dice) => {
      asked.push(dice[0].qty);
      return Array.from({ length: dice[0].qty }, () => ({ sides: 20, value: 20 }));
    }, 34);
    expect(asked).toEqual([30]);
    expect(faces).toHaveLength(34);
    expect(faces.slice(0, 30).every((face) => face === 20)).toBe(true);
    expect(faces.slice(30).every((face) => face >= 1 && face <= 20)).toBe(true);
    expect(await throwD20s(async () => [], 0)).toEqual([]);
  });

  it("rejects a 3D result that is not the dice asked for", () => {
    const dice = [
      { sides: 20, qty: 2 },
      { sides: 6, qty: 1 },
    ];
    const good = [
      { sides: 20, value: 3 },
      { sides: 6, value: 6 },
      { sides: 20, value: 20 },
    ];
    expect(matchesThrow(dice, good)).toBe(true);
    expect(matchesThrow(dice, good.slice(1))).toBe(false);
    expect(matchesThrow(dice, [...good, { sides: 6, value: 1 }])).toBe(false);
    expect(matchesThrow(dice, [{ sides: 20, value: 21 }, good[1], good[2]])).toBe(false);
    expect(matchesThrow(dice, [{ sides: 8, value: 3 }, good[1], good[2]])).toBe(false);
  });
});

describe("shared rolls", () => {
  const entry = initiativeEntries(me, [combatant("a")], { a: { initiative: 11 } })[0];

  it("keeps the initiative mark through validation and drops unknown kinds", () => {
    expect(parseRoll(entry)?.kind).toBe("initiative");
    expect(parseRoll({ ...entry, kind: "other" })).not.toHaveProperty("kind");
  });

  it("reads one roll or a list, skips invalid items and limits the list", () => {
    expect(parseRolls(entry)).toHaveLength(1);
    expect(parseRolls([entry, { nope: true }, entry])).toHaveLength(2);
    expect(parseRolls("x")).toEqual([]);
    expect(parseRolls(Array.from({ length: MAX_BATCH + 5 }, () => entry))).toHaveLength(MAX_BATCH);
  });
});
