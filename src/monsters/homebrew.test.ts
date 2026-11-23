import { describe, expect, it } from "vitest";
import {
  type Draft,
  buildBackup,
  draftToProfile,
  emptyDraft,
  isBackup,
  isHomebrew,
  newHomebrewId,
  parseBackup,
  profileToDraft,
  sanitizeProfile,
} from "./homebrew";

const draft = (): Draft => ({
  ...emptyDraft(),
  name: "  Lobo de ceniza ",
  kind: "Medium beast",
  cr: "2",
  ac: "14",
  acNote: "natural armor",
  hp: "37",
  hpFormula: "5d8 + 15",
  speed: "40 ft.",
  abilities: { str: "16", dex: "15", con: "16", int: "3", wis: "12", cha: "6" },
  saves: { str: "", dex: "+4", con: "", int: "", wis: "", cha: "" },
  skills: "perception +3, Stealth +4",
  features: [
    { section: "Acciones", name: "Mordisco", text: "Ataque cuerpo a cuerpo.", hit: "+5", damage: "2d6 + 3 piercing, 1d6 fuego" },
    { section: "Rasgos", name: "Olfato", text: "Ventaja en Percepción por olfato.", hit: "", damage: "" },
    { section: "Acciones", name: "", text: "", hit: "", damage: "" },
  ],
});

describe("draftToProfile", () => {
  it("builds a sheet, with defaults for empty fields", () => {
    const { profile, errors } = draftToProfile(draft(), "hb|1", "Homebrew");
    expect(errors).toEqual([]);
    expect(profile).toMatchObject({
      id: "hb|1",
      name: "Lobo de ceniza",
      source: "Homebrew",
      ac: 14,
      hp: 37,
      hpFormula: "5d8 + 15",
      saves: { dex: 4 },
      skills: { perception: 3, stealth: 4 },
      initiative: 2,
    });
    expect(profile!.abilities.str).toBe(16);
  });

  it("orders sections, drops empty features and reads attack and damage", () => {
    const { profile } = draftToProfile(draft(), "hb|1", "Homebrew");
    expect(profile!.sections.map((s) => [s.title, s.features.length])).toEqual([
      ["Rasgos", 1],
      ["Acciones", 1],
    ]);
    expect(profile!.sections[1].features[0]).toEqual({
      name: "Mordisco",
      text: "Ataque cuerpo a cuerpo.",
      hit: 5,
      damage: [
        { notation: "2d6 + 3", type: "piercing" },
        { notation: "1d6", type: "fuego" },
      ],
    });
  });

  it("an explicit initiative overrides the Dexterity modifier", () => {
    expect(draftToProfile({ ...draft(), initiative: "+7" }, "hb|1", "Homebrew").profile!.initiative).toBe(7);
  });

  it("reports every wrong field and returns no sheet", () => {
    const bad: Draft = {
      ...draft(),
      name: " ",
      ac: "quince",
      abilities: { ...draft().abilities, str: "99" },
      skills: "stealth",
      features: [{ section: "Acciones", name: "Garra", text: "", hit: "x", damage: "mucho, 2d7" }],
    };
    const { profile, errors } = draftToProfile(bad, "hb|1", "Homebrew");
    expect(profile).toBeNull();
    expect(errors).toHaveLength(7);
    expect(errors[0]).toContain("Nombre");
  });

  it("round-trips through the editor fields", () => {
    const first = draftToProfile(draft(), "hb|1", "Homebrew").profile!;
    const second = draftToProfile(profileToDraft(first), "hb|1", "Homebrew");
    expect(second.errors).toEqual([]);
    expect(second.profile).toEqual(first);
  });
});

describe("backup file", () => {
  const sheet = draftToProfile(draft(), newHomebrewId(), "Homebrew").profile!;

  it("round-trips homebrew sheets", () => {
    const json = JSON.parse(buildBackup([sheet]));
    expect(isBackup(json)).toBe(true);
    expect(parseBackup(json)).toEqual({ profiles: [sheet], skipped: 0 });
  });

  it("is told apart from a 5etools file", () => {
    expect(isBackup({ monster: [] })).toBe(false);
  });

  it("repairs or drops damaged sheets", () => {
    const { profiles, skipped } = parseBackup({
      tirada: 1,
      profiles: [{ name: "Solo nombre", ac: "14", abilities: { str: 500 }, sections: "x", id: "mm|goblin" }, { ac: 3 }, null],
    });
    expect(skipped).toBe(2);
    expect(profiles[0]).toMatchObject({ name: "Solo nombre", ac: null, initiative: 0, sections: [], source: "Homebrew" });
    expect(profiles[0].abilities).toMatchObject({ str: 30, dex: 10 });
    // A foreign id is never kept, so a backup cannot overwrite an imported sheet.
    expect(isHomebrew(profiles[0].id)).toBe(true);
  });

  it("sanitizeProfile rejects non-objects", () => {
    expect(sanitizeProfile("x")).toBeNull();
  });
});
