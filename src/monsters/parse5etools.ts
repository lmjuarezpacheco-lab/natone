// Reads monster files in the 5etools JSON layout ({ "monster": [...] }), which is also the layout of
// 5etools homebrew files. Only the user's own file is read. Nothing is fetched or bundled.
import { type Key, t } from "../i18n";
import { ABILITIES, type Ability, type DamageRoll, type Feature, type Profile, type Section, abilityModifier } from "./types";

type Raw = Record<string, unknown>;

export interface ImportResult {
  profiles: Profile[];
  /** Entries that could not be read, for example copies of a monster from another file. */
  skipped: number;
}

const SIZE_NAME: Record<string, string> = {
  T: "Tiny",
  S: "Small",
  M: "Medium",
  L: "Large",
  H: "Huge",
  G: "Gargantuan",
};

const ABILITY_NAME: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const ATTACK_KIND: Record<string, string> = {
  mw: "Melee Weapon Attack:",
  rw: "Ranged Weapon Attack:",
  ms: "Melee Spell Attack:",
  rs: "Ranged Spell Attack:",
  "mw,rw": "Melee or Ranged Weapon Attack:",
  "ms,rs": "Melee or Ranged Spell Attack:",
  m: "Melee Attack:",
  r: "Ranged Attack:",
  "m,r": "Melee or Ranged Attack:",
};

const DAMAGE_TYPES = new Set([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);

// Section names follow the language of the panel at import time. Sheets already saved keep theirs.
const SECTIONS: [key: string, title: Key][] = [
  ["trait", "sec.traits"],
  ["action", "sec.actions"],
  ["bonus", "sec.bonus"],
  ["reaction", "sec.reactions"],
  ["legendary", "sec.legendary"],
  ["mythic", "sec.mythic"],
];

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const match = /^\s*([+\-−]?)\s*(\d+)/.exec(value);
    if (match) return (match[1] === "-" || match[1] === "−" ? -1 : 1) * Number(match[2]);
  }
  return null;
}

/** Turns inline tags such as {@hit 4} or {@condition prone} into plain text. */
export function stripTags(text: string): string {
  let current = text;
  for (let pass = 0; pass < 6; pass++) {
    const next = current.replace(/\{@(\w+)(?:\s+([^{}]*))?\}/g, (_match, tag: string, body: string = "") => {
      const parts = body.split("|");
      switch (tag) {
        case "hit":
          return signed(toInt(parts[0]) ?? 0);
        case "h":
          return "Hit: ";
        case "m":
          return "Miss: ";
        case "hom":
          return "Hit or Miss: ";
        case "atk":
          return ATTACK_KIND[parts[0]] ?? "Attack:";
        case "atkr":
          return (ATTACK_KIND[parts[0]] ?? "Attack:").replace(":", " Roll:");
        case "dc":
          return `DC ${parts[0]}`;
        case "recharge":
          return parts[0] && parts[0] !== "6" ? `(Recharge ${parts[0]}–6)` : "(Recharge 6)";
        case "actSave":
          return `${ABILITY_NAME[parts[0]] ?? parts[0]} Saving Throw:`;
        case "actSaveFail":
          return "Failure:";
        case "actSaveFailBy":
          return `Failure by ${parts[0]} or more:`;
        case "actSaveSuccess":
          return "Success:";
        case "actSaveSuccessOrFail":
          return "Failure or Success:";
        case "actTrigger":
          return "Trigger:";
        case "actResponse":
          return "Response:";
        case "chance":
          return `${parts[0]} percent`;
        case "dice":
        case "damage":
        case "d20":
        case "scaledice":
        case "scaledamage":
          return parts[0];
        default:
          // {@tag name|source|shown text}
          return parts[2] || parts[0];
      }
    });
    if (next === current) break;
    current = next;
  }
  return current.replace(/\s+/g, " ").trim();
}

/** Joins nested entry structures (lists, named items) into one text, keeping the inline tags. */
function flattenEntries(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (typeof entry === "number") return String(entry);
  if (Array.isArray(entry)) return entry.map(flattenEntries).filter(Boolean).join(" ");
  if (!isObject(entry)) return "";
  const name = typeof entry.name === "string" ? `${entry.name}. ` : "";
  const body = [entry.entry, entry.entries, entry.items].map(flattenEntries).filter(Boolean).join(" ");
  return name + body;
}

function parseFeature(raw: unknown): Feature | null {
  if (!isObject(raw)) return null;
  const tagged = flattenEntries(raw.entries ?? raw.entry);
  const hitMatch = /\{@hit\s+([+\-−]?\d+)/.exec(tagged);
  const damage: DamageRoll[] = [];
  for (const match of tagged.matchAll(/\{@damage\s+([^}|]+)[^}]*\}\)?\s*([A-Za-z]+)?/g)) {
    const type = (match[2] ?? "").toLowerCase();
    damage.push({
      notation: match[1].replace(/[−–]/g, "-").trim(),
      type: DAMAGE_TYPES.has(type) ? type : "",
    });
  }
  return {
    name: stripTags(typeof raw.name === "string" ? raw.name : ""),
    text: stripTags(tagged),
    hit: hitMatch ? toInt(hitMatch[1]) : null,
    damage,
  };
}

function spellNames(list: unknown): string {
  if (!Array.isArray(list)) return "";
  return list
    .map((spell) => stripTags(typeof spell === "string" ? spell : isObject(spell) ? flattenEntries(spell.entry) : ""))
    .filter(Boolean)
    .join(", ");
}

function parseSpellcasting(raw: unknown): Feature | null {
  if (!isObject(raw)) return null;
  const lines: string[] = [stripTags(flattenEntries(raw.headerEntries))];
  if (Array.isArray(raw.will)) lines.push(`At will: ${spellNames(raw.will)}.`);
  for (const [group, label] of [
    ["daily", "day"],
    ["rest", "rest"],
    ["weekly", "week"],
  ] as const) {
    const uses = raw[group];
    if (!isObject(uses)) continue;
    for (const [key, list] of Object.entries(uses)) {
      const each = key.endsWith("e") ? " each" : "";
      lines.push(`${parseInt(key, 10)}/${label}${each}: ${spellNames(list)}.`);
    }
  }
  if (isObject(raw.spells)) {
    for (const [level, info] of Object.entries(raw.spells)) {
      if (!isObject(info)) continue;
      const slots = typeof info.slots === "number" ? ` (${info.slots} slots)` : "";
      const title = level === "0" ? "Cantrips" : `Level ${level}${slots}`;
      lines.push(`${title}: ${spellNames(info.spells)}.`);
    }
  }
  lines.push(stripTags(flattenEntries(raw.footerEntries)));
  return {
    name: typeof raw.name === "string" ? stripTags(raw.name) : "Spellcasting",
    text: lines.filter(Boolean).join(" "),
    hit: null,
    damage: [],
  };
}

function proficiencyBonus(cr: string): number {
  const value = cr.includes("/") ? 0 : Number(cr);
  return Number.isFinite(value) ? Math.max(2, Math.ceil(value / 4) + 1) : 2;
}

function parseKind(monster: Raw): string {
  const sizes = Array.isArray(monster.size) ? monster.size : [monster.size];
  const size = sizes.map((s) => SIZE_NAME[String(s)] ?? "").filter(Boolean).join(" or ");
  let type = "";
  let tags = "";
  const rawType = monster.type;
  if (typeof rawType === "string") type = rawType;
  else if (isObject(rawType)) {
    const inner = rawType.type;
    if (typeof inner === "string") type = inner;
    else if (isObject(inner) && Array.isArray(inner.choose)) type = inner.choose.join(" or ");
    if (Array.isArray(rawType.tags)) {
      const names = rawType.tags.map((t) => (typeof t === "string" ? t : isObject(t) ? String(t.tag ?? "") : ""));
      tags = names.filter(Boolean).join(", ");
    }
  }
  return [size, type].filter(Boolean).join(" ") + (tags ? ` (${tags})` : "");
}

function parseSpeed(raw: unknown): string {
  if (typeof raw === "number") return `${raw} ft.`;
  if (!isObject(raw)) return "";
  const parts: string[] = [];
  for (const mode of ["walk", "burrow", "climb", "fly", "swim"]) {
    const value = raw[mode];
    let text = "";
    if (typeof value === "number") text = `${value} ft.`;
    else if (isObject(value) && typeof value.number === "number") {
      text = `${value.number} ft.${typeof value.condition === "string" ? ` ${stripTags(value.condition)}` : ""}`;
    } else if (value === true) text = "equal to walking speed";
    if (!text) continue;
    const hover = mode === "fly" && raw.canHover === true && !text.includes("hover") ? " (hover)" : "";
    parts.push(mode === "walk" ? text : `${mode} ${text}${hover}`);
  }
  return parts.join(", ");
}

function parseBonuses(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!isObject(raw)) return result;
  for (const [key, value] of Object.entries(raw)) {
    const bonus = typeof value === "string" || typeof value === "number" ? toInt(value) : null;
    if (bonus !== null) result[key] = bonus;
  }
  return result;
}

function parseMonster(monster: Raw): Profile | null {
  const name = typeof monster.name === "string" ? monster.name.trim() : "";
  if (!name) return null;
  const scores = ABILITIES.map((ability) => toInt(monster[ability]));
  // A sheet without ability scores cannot be rolled. This happens with copies of an unknown base.
  if (scores.some((score) => score === null) && !monster.hp && !monster.ac) return null;
  const abilities = Object.fromEntries(ABILITIES.map((ability, i) => [ability, scores[i] ?? 10])) as Record<Ability, number>;

  const source = typeof monster.source === "string" ? monster.source : "";
  const rawCr = isObject(monster.cr) ? monster.cr.cr : monster.cr;
  const cr = typeof rawCr === "string" || typeof rawCr === "number" ? String(rawCr) : "";

  let ac: number | null = null;
  let acNote = "";
  const firstAc = Array.isArray(monster.ac) ? monster.ac[0] : monster.ac;
  if (isObject(firstAc)) {
    ac = toInt(firstAc.ac);
    const from = Array.isArray(firstAc.from) ? firstAc.from.map((f) => stripTags(String(f))).join(", ") : "";
    const condition = typeof firstAc.condition === "string" ? stripTags(firstAc.condition) : "";
    const special = typeof firstAc.special === "string" ? stripTags(firstAc.special) : "";
    acNote = [from, condition, special].filter(Boolean).join(" ");
  } else ac = toInt(firstAc);

  const hpRaw = isObject(monster.hp) ? monster.hp : {};
  const hp = toInt(hpRaw.average);
  const hpFormula = typeof hpRaw.formula === "string" ? hpRaw.formula : typeof hpRaw.special === "string" ? stripTags(hpRaw.special) : "";

  const dexMod = abilityModifier(abilities.dex);
  let initiative = dexMod;
  const rawInit = monster.initiative;
  if (typeof rawInit === "number") initiative = rawInit;
  else if (isObject(rawInit)) {
    if (typeof rawInit.initiative === "number") initiative = rawInit.initiative;
    else if (typeof rawInit.proficiency === "number") initiative = dexMod + proficiencyBonus(cr) * rawInit.proficiency;
  }

  const sections: Section[] = [];
  const spellcasting = (Array.isArray(monster.spellcasting) ? monster.spellcasting : [])
    .map(parseSpellcasting)
    .filter((f): f is Feature => f !== null);
  for (const [key, title] of SECTIONS) {
    const list = Array.isArray(monster[key]) ? (monster[key] as unknown[]) : [];
    const features = list.map(parseFeature).filter((f): f is Feature => f !== null);
    if (key === "trait") features.push(...spellcasting);
    if (features.length > 0) sections.push({ title: t(title), features });
  }

  return {
    id: `${source}|${name}`.toLowerCase(),
    name,
    source,
    kind: parseKind(monster),
    cr,
    ac,
    acNote,
    hp,
    hpFormula,
    speed: parseSpeed(monster.speed),
    abilities,
    saves: parseBonuses(monster.save) as Partial<Record<Ability, number>>,
    skills: parseBonuses(monster.skill),
    initiative,
    sections,
  };
}

/** Throws when the file holds no monster list. */
export function parseMonsterFile(json: unknown): ImportResult {
  const list = isObject(json) && Array.isArray(json.monster) ? json.monster : null;
  if (!list) throw new Error(t("mon.fileNoList"));

  const key = (m: Raw) => `${String(m.source ?? "")}|${String(m.name ?? "")}`.toLowerCase();
  const originals = new Map<string, Raw>();
  for (const entry of list) if (isObject(entry) && !entry._copy) originals.set(key(entry), entry);

  const profiles: Profile[] = [];
  let skipped = 0;
  for (const entry of list) {
    if (!isObject(entry)) {
      skipped++;
      continue;
    }
    let monster = entry;
    if (isObject(entry._copy)) {
      // A copy states only its differences. The base must be in the same file. Text edits (_mod) are not applied.
      const base = originals.get(key(entry._copy));
      if (!base) {
        skipped++;
        continue;
      }
      monster = { ...base, ...entry };
    }
    const profile = parseMonster(monster);
    if (profile) profiles.push(profile);
    else skipped++;
  }
  return { profiles, skipped };
}
