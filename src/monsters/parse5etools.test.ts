import { describe, expect, it } from "vitest";
import { parseNotation } from "../dice/notation";
import { parseMonsterFile, stripTags } from "./parse5etools";

// Invented monsters in the 5etools layout. Both the 2014 and the 2024 attack wording are covered.
const file = {
  monster: [
    {
      name: "Test Raider",
      source: "TEST",
      size: ["S"],
      type: { type: "humanoid", tags: ["goblinoid"] },
      ac: [{ ac: 15, from: ["{@item leather armor|phb}", "{@item shield|phb}"] }],
      hp: { average: 7, formula: "2d6" },
      speed: { walk: 30, fly: { number: 60, condition: "(hover)" }, canHover: true },
      str: 8,
      dex: 14,
      con: 10,
      int: 10,
      wis: 8,
      cha: 8,
      save: { dex: "+4" },
      skill: { stealth: "+6" },
      cr: "1/4",
      trait: [{ name: "Slippery", entries: ["Can {@action Hide} when {@condition prone||knocked down}."] }],
      action: [
        {
          name: "Blade",
          entries: ["{@atk mw} {@hit 4} to hit, reach 5 ft., one target. {@h}5 ({@damage 1d6 + 2}) slashing damage."],
        },
        {
          name: "Flame {@recharge 5}",
          entries: [
            "Each creature makes a {@dc 13} save.",
            { type: "list", items: [{ type: "item", name: "Fail", entry: "{@damage 2d6} fire damage." }] },
          ],
        },
      ],
      spellcasting: [
        {
          name: "Innate Magic",
          headerEntries: ["Casts without components:"],
          will: ["{@spell light}"],
          daily: { "1e": ["{@spell fog cloud}", "{@spell sleep}"] },
        },
      ],
    },
    {
      name: "Test Warden",
      source: "TEST",
      size: ["M", "L"],
      type: "construct",
      ac: [17],
      hp: { average: 60, formula: "8d10 + 16" },
      speed: { walk: 30 },
      str: 18,
      dex: 12,
      con: 14,
      int: 6,
      wis: 10,
      cha: 5,
      cr: { cr: "5", xpLair: 2300 },
      initiative: { proficiency: 1 },
      action: [
        {
          name: "Slam",
          entries: ["{@atkr m} {@hit 7}, reach 5 ft. {@h}13 ({@damage 2d8 + 4}) Bludgeoning damage plus 3 ({@damage 1d6}) Force damage."],
        },
      ],
      bonus: [{ name: "Step", entries: ["{@actSave dex} {@dc 15}. {@actSaveFail} Pushed 10 feet."] }],
    },
    { name: "Test Raider Boss", source: "TEST", _copy: { name: "Test Raider", source: "TEST" }, hp: { average: 21, formula: "6d6" } },
    { name: "Orphan Copy", source: "TEST", _copy: { name: "Missing Base", source: "OTHER" } },
  ],
};

describe("parseMonsterFile", () => {
  const { profiles, skipped } = parseMonsterFile(file);
  const raider = profiles.find((p) => p.name === "Test Raider")!;
  const warden = profiles.find((p) => p.name === "Test Warden")!;

  it("reads every monster it can and counts the rest", () => {
    expect(profiles.map((p) => p.name)).toEqual(["Test Raider", "Test Warden", "Test Raider Boss"]);
    expect(skipped).toBe(1);
  });

  it("reads the stat line", () => {
    expect(raider).toMatchObject({
      id: "test|test raider",
      source: "TEST",
      kind: "Small humanoid (goblinoid)",
      cr: "1/4",
      ac: 15,
      acNote: "leather armor, shield",
      hp: 7,
      hpFormula: "2d6",
      speed: "30 ft., fly 60 ft. (hover)",
      saves: { dex: 4 },
      skills: { stealth: 6 },
      initiative: 2,
    });
    expect(raider.abilities).toEqual({ str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 });
  });

  it("reads attacks in the 2014 wording", () => {
    const blade = raider.sections.find((s) => s.title === "Acciones")!.features[0];
    expect(blade.hit).toBe(4);
    expect(blade.damage).toEqual([{ notation: "1d6 + 2", type: "slashing" }]);
    expect(blade.text).toBe("Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.");
  });

  it("reads attacks in the 2024 wording, with several damage rolls", () => {
    const slam = warden.sections.find((s) => s.title === "Acciones")!.features[0];
    expect(slam.hit).toBe(7);
    expect(slam.damage).toEqual([
      { notation: "2d8 + 4", type: "bludgeoning" },
      { notation: "1d6", type: "force" },
    ]);
    expect(slam.text).toContain("Melee Attack Roll: +7, reach 5 ft.");
  });

  it("reads damage inside nested lists and cleans names", () => {
    const flame = raider.sections.find((s) => s.title === "Acciones")!.features[1];
    expect(flame.name).toBe("Flame (Recharge 5–6)");
    expect(flame.hit).toBeNull();
    expect(flame.damage).toEqual([{ notation: "2d6", type: "fire" }]);
    expect(flame.text).toBe("Each creature makes a DC 13 save. Fail. 2d6 fire damage.");
  });

  it("every damage roll is something the dice roller accepts", () => {
    for (const profile of profiles) {
      for (const feature of profile.sections.flatMap((s) => s.features)) {
        for (const roll of feature.damage) expect(parseNotation(roll.notation), roll.notation).not.toBeNull();
      }
    }
  });

  it("lists spellcasting with the traits", () => {
    const traits = raider.sections.find((s) => s.title === "Rasgos")!.features;
    expect(traits.map((f) => f.name)).toEqual(["Slippery", "Innate Magic"]);
    expect(traits[0].text).toBe("Can Hide when knocked down.");
    expect(traits[1].text).toBe("Casts without components: At will: light. 1/day each: fog cloud, sleep.");
  });

  it("derives initiative from the 2024 proficiency field and reads object CR", () => {
    expect(warden.cr).toBe("5");
    expect(warden.initiative).toBe(1 + 3);
    expect(warden.kind).toBe("Medium or Large construct");
    expect(warden.sections.map((s) => s.title)).toEqual(["Acciones", "Acciones adicionales"]);
    expect(warden.sections[1].features[0].text).toBe("Dexterity Saving Throw: DC 15. Failure: Pushed 10 feet.");
  });

  it("resolves a copy when the base is in the same file", () => {
    const boss = profiles.find((p) => p.name === "Test Raider Boss")!;
    expect(boss).toMatchObject({ hp: 21, hpFormula: "6d6", ac: 15, id: "test|test raider boss" });
  });

  it("rejects files without monsters", () => {
    expect(() => parseMonsterFile({ spell: [] })).toThrow();
    expect(() => parseMonsterFile(null)).toThrow();
  });
});

describe("stripTags", () => {
  it("handles nested and unknown tags", () => {
    expect(stripTags("{@b Bold {@creature goblin||goblins}} and {@unknown thing|SRC}")).toBe("Bold goblins and thing");
  });
});
