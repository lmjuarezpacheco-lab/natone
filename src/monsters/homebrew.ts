// Sheets created or edited inside the extension, and the backup file that carries them between browsers.
import { parseNotation } from "../dice/notation";
import { ABILITIES, type Ability, type DamageRoll, type Feature, type Profile, type Section, abilityModifier } from "./types";

export const SECTION_TITLES = ["Rasgos", "Acciones", "Acciones adicionales", "Reacciones", "Acciones legendarias"];
export const HOMEBREW_SOURCE = "Homebrew";
const HOMEBREW_PREFIX = "hb|";

export const isHomebrew = (id: string) => id.startsWith(HOMEBREW_PREFIX);
export const newHomebrewId = () => `${HOMEBREW_PREFIX}${crypto.randomUUID()}`;
/** Key range that selects every homebrew sheet in the library. */
export const HOMEBREW_RANGE: [string, string] = [HOMEBREW_PREFIX, `${HOMEBREW_PREFIX}\uffff`];

/** The editor works on text fields. Empty text means "not set" or "use the default". */
export interface FeatureDraft {
  section: string;
  name: string;
  text: string;
  hit: string;
  /** Rolls separated by commas, for example "1d6 + 2 slashing, 1d4 fire". */
  damage: string;
}

export interface Draft {
  name: string;
  kind: string;
  cr: string;
  ac: string;
  acNote: string;
  hp: string;
  hpFormula: string;
  speed: string;
  abilities: Record<Ability, string>;
  /** Empty: the save uses the plain ability modifier. */
  saves: Record<Ability, string>;
  /** Empty: initiative uses the Dexterity modifier. */
  initiative: string;
  /** For example "stealth +6, perception +4". */
  skills: string;
  features: FeatureDraft[];
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const perAbility = <T>(value: (ability: Ability) => T) =>
  Object.fromEntries(ABILITIES.map((ability) => [ability, value(ability)])) as Record<Ability, T>;

export function emptyFeature(section = "Acciones"): FeatureDraft {
  return { section, name: "", text: "", hit: "", damage: "" };
}

export function emptyDraft(): Draft {
  return {
    name: "",
    kind: "",
    cr: "",
    ac: "",
    acNote: "",
    hp: "",
    hpFormula: "",
    speed: "30 ft.",
    abilities: perAbility(() => "10"),
    saves: perAbility(() => ""),
    initiative: "",
    skills: "",
    features: [emptyFeature()],
  };
}

export function profileToDraft(profile: Profile): Draft {
  const dexModifier = abilityModifier(profile.abilities.dex);
  return {
    name: profile.name,
    kind: profile.kind,
    cr: profile.cr,
    ac: profile.ac === null ? "" : String(profile.ac),
    acNote: profile.acNote,
    hp: profile.hp === null ? "" : String(profile.hp),
    hpFormula: profile.hpFormula,
    speed: profile.speed,
    abilities: perAbility((ability) => String(profile.abilities[ability])),
    saves: perAbility((ability) => (profile.saves[ability] === undefined ? "" : signed(profile.saves[ability]!))),
    initiative: profile.initiative === dexModifier ? "" : signed(profile.initiative),
    skills: Object.entries(profile.skills)
      .map(([skill, bonus]) => `${skill} ${signed(bonus)}`)
      .join(", "),
    features: profile.sections.flatMap((section) =>
      section.features.map((feature) => ({
        section: section.title,
        name: feature.name,
        text: feature.text,
        hit: feature.hit === null ? "" : signed(feature.hit),
        damage: feature.damage.map((d) => `${d.notation}${d.type ? ` ${d.type}` : ""}`).join(", "),
      })),
    ),
  };
}

function readInt(text: string, label: string, min: number, max: number, errors: string[]): number | null {
  const compact = text.trim().replace("−", "-");
  if (compact === "") return null;
  if (!/^[+-]?\d+$/.test(compact)) {
    errors.push(`${label}: escribe un número entero.`);
    return null;
  }
  const value = Number(compact);
  if (value < min || value > max) {
    errors.push(`${label}: debe estar entre ${min} y ${max}.`);
    return null;
  }
  return value;
}

function readSkills(text: string, errors: string[]): Record<string, number> {
  const skills: Record<string, number> = {};
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const match = /^(.+?)\s*([+\-−]\d+)$/.exec(part);
    if (!match) {
      errors.push(`Habilidades: "${part}" debe ser nombre y bonificador, por ejemplo "stealth +6".`);
      continue;
    }
    skills[match[1].trim().toLowerCase()] = Number(match[2].replace("−", "-"));
  }
  return skills;
}

function readDamage(text: string, featureName: string, errors: string[]): DamageRoll[] {
  const rolls: DamageRoll[] = [];
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    // The dice end at the last digit. Any words after it are the damage type.
    const end = part.search(/\d(?!.*\d)/) + 1;
    const notation = part.slice(0, end).trim();
    if (end === 0 || !parseNotation(notation)) {
      errors.push(`Daño de "${featureName || "sin nombre"}": "${part}" no es una tirada. Ejemplo: 1d6 + 2 slashing.`);
      continue;
    }
    rolls.push({ notation, type: part.slice(end).trim().toLowerCase() });
  }
  return rolls;
}

/** Builds a sheet from the editor fields. `profile` is null when any field is wrong. */
export function draftToProfile(draft: Draft, id: string, source: string): { profile: Profile | null; errors: string[] } {
  const errors: string[] = [];
  const name = draft.name.trim();
  if (name === "") errors.push("Nombre: es obligatorio.");

  const abilities = perAbility((ability) => readInt(draft.abilities[ability], ability.toUpperCase(), 1, 30, errors) ?? 10);
  const saves: Partial<Record<Ability, number>> = {};
  for (const ability of ABILITIES) {
    const bonus = readInt(draft.saves[ability], `Salvación ${ability.toUpperCase()}`, -20, 30, errors);
    if (bonus !== null) saves[ability] = bonus;
  }

  const sections: Section[] = [];
  const titles = [...SECTION_TITLES, ...draft.features.map((f) => f.section)].filter((t, i, all) => all.indexOf(t) === i);
  for (const title of titles) {
    const features: Feature[] = [];
    for (const item of draft.features.filter((f) => f.section === title)) {
      const featureName = item.name.trim();
      const text = item.text.trim();
      if (featureName === "" && text === "" && item.hit.trim() === "" && item.damage.trim() === "") continue;
      features.push({
        name: featureName,
        text,
        hit: readInt(item.hit, `Ataque de "${featureName || "sin nombre"}"`, -20, 50, errors),
        damage: readDamage(item.damage, featureName, errors),
      });
    }
    if (features.length > 0) sections.push({ title, features });
  }

  const profile: Profile = {
    id,
    name,
    source,
    kind: draft.kind.trim(),
    cr: draft.cr.trim(),
    ac: readInt(draft.ac, "CA", 0, 99, errors),
    acNote: draft.acNote.trim(),
    hp: readInt(draft.hp, "PG", 0, 99999, errors),
    hpFormula: draft.hpFormula.trim(),
    speed: draft.speed.trim(),
    abilities,
    saves,
    skills: readSkills(draft.skills, errors),
    initiative: readInt(draft.initiative, "Iniciativa", -20, 30, errors) ?? abilityModifier(abilities.dex),
    sections,
  };
  return { profile: errors.length === 0 ? profile : null, errors };
}

// --- Backup file ---------------------------------------------------------------------------

const FILE_VERSION = 1;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const int = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : null;

/** Checks a sheet that comes from a file. Returns null when it has no name. */
export function sanitizeProfile(raw: unknown): Profile | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name, 120).trim();
  if (name === "") return null;
  const rawAbilities = isObject(raw.abilities) ? raw.abilities : {};
  const rawSaves = isObject(raw.saves) ? raw.saves : {};
  const abilities = perAbility((ability) => int(rawAbilities[ability], 1, 30) ?? 10);
  const saves: Partial<Record<Ability, number>> = {};
  for (const ability of ABILITIES) {
    const bonus = int(rawSaves[ability], -20, 30);
    if (bonus !== null) saves[ability] = bonus;
  }
  const skills: Record<string, number> = {};
  for (const [skill, value] of Object.entries(isObject(raw.skills) ? raw.skills : {}).slice(0, 40)) {
    const bonus = int(value, -20, 50);
    if (bonus !== null) skills[skill.slice(0, 40)] = bonus;
  }
  const sections: Section[] = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).flatMap((section) => {
    if (!isObject(section)) return [];
    const features: Feature[] = (Array.isArray(section.features) ? section.features : []).slice(0, 60).flatMap((feature) => {
      if (!isObject(feature)) return [];
      const damage: DamageRoll[] = (Array.isArray(feature.damage) ? feature.damage : []).slice(0, 12).flatMap((roll) =>
        isObject(roll) && text(roll.notation, 40) ? [{ notation: text(roll.notation, 40), type: text(roll.type, 30) }] : [],
      );
      return [{ name: text(feature.name, 120), text: text(feature.text, 6000), hit: int(feature.hit, -20, 50), damage }];
    });
    return features.length > 0 ? [{ title: text(section.title, 60) || "Rasgos", features }] : [];
  });
  const id = text(raw.id, 80);
  return {
    id: isHomebrew(id) ? id : newHomebrewId(),
    name,
    source: text(raw.source, 40) || HOMEBREW_SOURCE,
    kind: text(raw.kind, 120),
    cr: text(raw.cr, 12),
    ac: int(raw.ac, 0, 99),
    acNote: text(raw.acNote, 200),
    hp: int(raw.hp, 0, 99999),
    hpFormula: text(raw.hpFormula, 60),
    speed: text(raw.speed, 200),
    abilities,
    saves,
    skills,
    initiative: int(raw.initiative, -20, 30) ?? abilityModifier(abilities.dex),
    sections,
  };
}

export function buildBackup(profiles: readonly Profile[]): string {
  return JSON.stringify({ natone: FILE_VERSION, profiles }, null, 2);
}

export function isBackup(json: unknown): boolean {
  // "tirada" is the marker of files written before the project was renamed.
  return isObject(json) && (typeof json.natone === "number" || typeof json.tirada === "number") && Array.isArray(json.profiles);
}

export function parseBackup(json: unknown): { profiles: Profile[]; skipped: number } {
  const list = isObject(json) && Array.isArray(json.profiles) ? json.profiles : [];
  const profiles = list.map(sanitizeProfile).filter((p): p is Profile => p !== null);
  return { profiles, skipped: list.length - profiles.length };
}
