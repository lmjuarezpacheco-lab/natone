import { describe, expect, it } from "vitest";
import { parseNotation } from "../dice/notation";
import en from "./srd/en.json";
import es from "./srd/es.json";
import { ABILITIES, type Profile } from "./types";

const english = en as Profile[];
const spanish = es as Profile[];

describe("included SRD 5.2.1 creatures", () => {
  it("has the same creatures in both languages", () => {
    expect(english.length).toBeGreaterThan(300);
    expect(new Set(spanish.map((p) => p.id))).toEqual(new Set(english.map((p) => p.id)));
  });

  it("gives every sheet usable numbers", () => {
    for (const profile of [...english, ...spanish]) {
      expect(profile.id.startsWith("srd:"), profile.name).toBe(true);
      expect(profile.name, profile.id).not.toBe("");
      expect(profile.ac, profile.name).toBeGreaterThan(0);
      expect(profile.hp, profile.name).toBeGreaterThan(0);
      for (const ability of ABILITIES) expect(profile.abilities[ability], `${profile.name} ${ability}`).toBeGreaterThan(0);
      for (const feature of profile.sections.flatMap((s) => s.features)) {
        for (const damage of feature.damage) expect(parseNotation(damage.notation), `${profile.name}: ${damage.notation}`).not.toBeNull();
      }
    }
  });

  it("keeps the numbers of a sheet equal across languages", () => {
    const byId = new Map(spanish.map((p) => [p.id, p]));
    for (const sheet of english) {
      const other = byId.get(sheet.id)!;
      expect([other.ac, other.hp, other.initiative, other.cr], sheet.name).toEqual([sheet.ac, sheet.hp, sheet.initiative, sheet.cr]);
    }
  });
});
