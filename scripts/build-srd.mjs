// Builds the creatures of the SRD 5.2.1 that NatOne ships preloaded, in English and Spanish.
//
//   node scripts/build-srd.mjs <open5e-dir> <spanish-markdown-dir>
//
// <open5e-dir> holds Creature.json, CreatureAction.json, CreatureActionAttack.json and CreatureTrait.json from
// open5e-api, data/v2/wizards-of-the-coast/srd-2024 (SRD 5.2.1 in English, CC BY 4.0).
// <spanish-markdown-dir> is the ES folder of github.com/alex3rq/dnd-srd-markdown-espanol, a conversion of the
// official Spanish SRD 5.2.1 PDF (CC BY 4.0). Numbers come from Open5e for both languages; the Spanish names
// and texts come from the markdown. Writes src/monsters/srd/en.json and src/monsters/srd/es.json.
//
// This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast
// LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons
// Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const [open5eDir, esDir] = process.argv.slice(2);
if (!open5eDir || !esDir) {
  console.error("Usage: node scripts/build-srd.mjs <open5e-dir> <spanish-markdown-dir>");
  process.exit(1);
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "src", "monsters", "srd");
const SOURCE = "SRD 5.2.1";
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const LONG = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const SECTION = {
  en: { traits: "Traits", ACTION: "Actions", BONUS_ACTION: "Bonus actions", REACTION: "Reactions", LEGENDARY_ACTION: "Legendary actions" },
  es: { traits: "Rasgos", ACTION: "Acciones", BONUS_ACTION: "Acciones adicionales", REACTION: "Reacciones", LEGENDARY_ACTION: "Acciones legendarias" },
};
const ES_HEADINGS = { Atributos: "traits", Acciones: "ACTION", "Acciones adicionales": "BONUS_ACTION", Reacciones: "REACTION", "Acciones legendarias": "LEGENDARY_ACTION" };

const load = (name) => JSON.parse(readFileSync(path.join(open5eDir, `${name}.json`), "utf8"));
const creatures = load("Creature");
const actions = load("CreatureAction");
const attacks = load("CreatureActionAttack");
const traits = load("CreatureTrait");

const byParent = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.fields.parent) ?? [];
    list.push(row);
    map.set(row.fields.parent, list);
  }
  return map;
};
const actionsOf = byParent(actions);
const attacksOf = byParent(attacks);
const traitsOf = byParent(traits);

const mod = (score) => Math.floor((score - 10) / 2);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fraction = (cr) => ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[Number(cr)] ?? String(Number(cr));
const clean = (notation) => notation.replace(/−/g, "-").replace(/\s+/g, " ").trim();

/** Every "N (XdY + Z) <type> damage" in an English text. Healing ("Hit Points") is left out. */
function damageEn(text) {
  const found = [];
  for (const m of text.matchAll(/\d+ \((\d+d\d+(?:\s*[+−-]\s*\d+)?)\) ([A-Z][a-z]+) damage/g)) found.push({ notation: clean(m[1]), type: m[2] });
  return found;
}
/** Every "N (XdY + Z) de daño <tipo>" in a Spanish text. */
function damageEs(text) {
  const found = [];
  for (const m of text.matchAll(/\d+ \((\d+d\d+(?:\s*[+−-]\s*\d+)?)\) de daño (?:de )?([a-záéíóúñ]+)/g)) found.push({ notation: clean(m[1]), type: m[2] });
  return found;
}
const hitIn = (text, pattern) => {
  const m = text.match(pattern);
  return m ? Number(m[1].replace("−", "-")) : null;
};

function usesEn(fields) {
  if (fields.uses_type === "PER_DAY") return ` (${fields.uses_param}/Day)`;
  if (fields.uses_type === "RECHARGE_ON_ROLL") return ` (Recharge ${fields.uses_param === 6 ? "6" : `${fields.uses_param}–6`})`;
  if (fields.uses_type === "RECHARGE") return " (Recharge after a Short or Long Rest)";
  return "";
}

function speedEn(f) {
  const parts = [`${f.walk ?? 0} ft.`];
  for (const [key, label] of [["burrow", "Burrow"], ["climb", "Climb"], ["fly", "Fly"], ["swim", "Swim"]]) {
    if (f[key]) parts.push(`${label} ${f[key]} ft.${key === "fly" && f.hover ? " (hover)" : ""}`);
  }
  return parts.join(", ");
}

// Open5e values that disagree with the official PDF (checked by hand against SP_SRD_CC_v5.2.1.pdf).
// The report still lists the Young White Dragon: the Spanish PDF prints its Intelligence save as "2", a typo
// for −2, so Open5e is right there.
const CORRECTIONS = {
  octopus: { abilities: { con: 11, cha: 4 }, saves: {} },
  mastiff: { abilities: {}, saves: { wis: 3 } },
  "swarm-of-rats": { abilities: {}, saves: { dex: 2 } },
};

/** Numbers shared by both languages. */
function base(row) {
  const f = { ...row.fields };
  const fix = CORRECTIONS[row.pk.replace(/^srd-2024_/, "")];
  if (fix) {
    for (const [a, v] of Object.entries(fix.abilities)) f[`ability_score_${LONG[a]}`] = v;
    for (const a of ABILITIES) if (f[`ability_score_${LONG[a]}`] !== row.fields[`ability_score_${LONG[a]}`] && !(a in fix.saves)) f[`saving_throw_${LONG[a]}`] = mod(f[`ability_score_${LONG[a]}`]);
    for (const [a, v] of Object.entries(fix.saves)) f[`saving_throw_${LONG[a]}`] = v;
  }
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, f[`ability_score_${LONG[a]}`]]));
  const saves = {};
  for (const a of ABILITIES) {
    const save = f[`saving_throw_${LONG[a]}`];
    if (typeof save === "number" && save !== mod(abilities[a])) saves[a] = save;
  }
  return {
    id: `srd:${row.pk.replace(/^srd-2024_/, "")}`,
    source: SOURCE,
    cr: fraction(f.challenge_rating),
    ac: f.armor_class,
    hp: f.hit_points,
    hpFormula: clean(f.hit_dice ?? ""),
    abilities,
    saves,
    initiative: f.initiative_bonus ?? mod(abilities.dex),
  };
}

function english(row) {
  const f = row.fields;
  const skills = {};
  for (const [key, value] of Object.entries(f)) {
    if (key.startsWith("skill_bonus_") && typeof value === "number") {
      skills[key.slice(12).split("_").map(cap).join(" ")] = value;
    }
  }
  const sections = [];
  const traitRows = traitsOf.get(row.pk) ?? [];
  if (traitRows.length > 0) {
    sections.push({ title: SECTION.en.traits, features: traitRows.map((t) => ({ name: t.fields.name, text: t.fields.desc, hit: null, damage: damageEn(t.fields.desc) })) });
  }
  for (const type of ["ACTION", "BONUS_ACTION", "REACTION", "LEGENDARY_ACTION"]) {
    const list = (actionsOf.get(row.pk) ?? []).filter((a) => a.fields.action_type === type).sort((a, b) => a.fields.order_in_statblock - b.fields.order_in_statblock);
    if (list.length === 0) continue;
    sections.push({
      title: SECTION.en[type],
      features: list.map((a) => {
        // Open5e drops the "Hit:" label of attack rolls; it is put back so the text reads like the book.
        let text = a.fields.desc;
        if (/Attack Roll:/.test(text) && !/Hit:/.test(text)) text = text.replace(/((?:ft\.|feet)(?: \([^)]*\))?) (\d+ \(|\d+ [A-Z])/, "$1 Hit: $2");
        const attack = (attacksOf.get(a.pk) ?? [])[0];
        return {
          name: `${a.fields.name}${usesEn(a.fields)}${type === "LEGENDARY_ACTION" && a.fields.legendary_action_cost > 1 ? ` (Costs ${a.fields.legendary_action_cost} Actions)` : ""}`,
          text,
          hit: attack ? attack.fields.to_hit_mod : hitIn(text, /Attack Roll: ([+−-]\d+)/),
          damage: damageEn(text),
        };
      }),
    });
  }
  return {
    ...base(row),
    name: f.name,
    kind: `${cap(f.size)} ${cap(f.type)}`,
    // SRD 5.2.1 stat blocks carry no armor note; the one in Open5e is a leftover default.
    acNote: "",
    speed: speedEn(f),
    skills,
    sections,
  };
}

const plain = (s) => s.replace(/\*([^*]+)\*/g, "$1").replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1").replace(/\s*\n\s*/g, " ").trim();

/** Reads one Spanish markdown stat block. */
function readSpanish(file) {
  const raw = readFileSync(file, "utf8");
  const aliases = raw.match(/^aliases:\s*\[(.*)\]/m);
  const names = aliases ? [...aliases[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  const body = raw.replace(/^---[\s\S]*?---\s*/, "");
  const name = body.match(/^# (.+)$/m)?.[1].trim();
  const kindLine = body.match(/^\*([^*\n]+)\*\s*$/m)?.[1] ?? "";
  const kind = kindLine.replace(/,[^,]*$/, "").trim();
  const field = (label) => body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^*\\n]+)`))?.[1].trim() ?? "";
  const acNote = field("CA").match(/\(([^)]+)\)/)?.[1] ?? "";
  const skills = {};
  for (const part of field("Habilidades").split(/,\s*/)) {
    const m = part.match(/^(.+?)\s+([+−-]\d+)$/);
    if (m) skills[m[1]] = Number(m[2].replace("−", "-"));
  }
  const sections = [];
  let current = null;
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    const heading = text.match(/^## (.+)$/);
    if (heading) {
      const key = ES_HEADINGS[heading[1].trim()];
      current = key ? { title: SECTION.es[key], features: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (!current || text === "") continue;
    const feature = text.match(/^\*\*(.+?)\.\*\*\s*([\s\S]*)$/);
    if (feature) {
      const words = plain(feature[2]);
      current.features.push({ name: plain(feature[1]), text: words, hit: hitIn(words, /Tirada de ataque[^:]*:\s*([+−-]\d+)/), damage: damageEs(words) });
    } else if (current.features.length > 0) {
      const last = current.features.at(-1);
      last.text += ` ${plain(text)}`;
      last.damage = damageEs(last.text);
    } else {
      // Text before the first entry, such as the uses of legendary actions.
      current.features.push({ name: "", text: plain(text), hit: null, damage: [] });
    }
  }
  // Numbers, to check them against Open5e.
  const ES_ABILITY = { FUE: "str", DES: "dex", CON: "con", INT: "int", SAB: "wis", CAR: "cha" };
  const numbers = { abilities: {}, saves: {} };
  for (const m of body.matchAll(/^\|\s*(FUE|DES|CON|INT|SAB|CAR)\s*\|\s*(\d+)\s*\|\s*([+−-]?\d+)\s*\|\s*([+−-]?\d+)\s*\|/gm)) {
    numbers.abilities[ES_ABILITY[m[1]]] = Number(m[2]);
    numbers.saves[ES_ABILITY[m[1]]] = Number(m[4].replace("−", "-"));
  }
  numbers.ac = Number(field("CA").match(/\d+/)?.[0] ?? NaN);
  numbers.hp = Number(field("PG").match(/\d+/)?.[0] ?? NaN);
  numbers.initiative = Number(field("Iniciativa").match(/[+−-]\d+/)?.[0].replace("−", "-") ?? NaN);
  return { names, name, kind, acNote, speed: field("Velocidad"), skills, sections, numbers };
}

// The fixes folder goes last so its sheets replace the incomplete ones of the source.
const fixes = path.join(path.dirname(new URL(import.meta.url).pathname), "srd-es-fixes");
const spanishFiles = [path.join(esDir, "MonstruosDeLaAALaZ"), path.join(esDir, "Animales"), fixes].flatMap((dir) =>
  readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => path.join(dir, f)),
);
// Names that the source spells differently from Open5e or translates under another English name.
const ALIASES = { "giant wolf spider": "tarántula gigante" };
const key = (name) => name.toLowerCase().replace(/[’'-]/g, "");
const spanishByEnglish = new Map();
for (const file of spanishFiles) {
  const sheet = readSpanish(file);
  // Spanish names are keys too, for the aliases above.
  // The first sheet keeps a name the source repeats (Giant Spider); a fix always replaces it.
  for (const alias of sheet.names) if (!spanishByEnglish.has(key(alias)) || file.startsWith(fixes)) spanishByEnglish.set(key(alias), sheet);
}
for (const [english, spanish] of Object.entries(ALIASES)) spanishByEnglish.set(key(english), spanishByEnglish.get(key(spanish)));

const en = [];
const es = [];
const problems = [];
for (const row of creatures) {
  const sheet = english(row);
  en.push(sheet);
  const spanish = spanishByEnglish.get(key(row.fields.name));
  if (!spanish) {
    problems.push(`${row.fields.name}: no Spanish sheet, English text used`);
    es.push({ ...sheet });
    continue;
  }
  // Numbers must agree between the two sources; a mismatch is a mistake in one of them.
  const mine = base(row);
  const n = spanish.numbers;
  for (const k of ["ac", "hp", "initiative"]) if (!Number.isNaN(n[k]) && n[k] !== mine[k]) problems.push(`${row.fields.name}: ${k} Open5e ${mine[k]} ES ${n[k]}`);
  for (const a of ABILITIES) {
    if (a in n.abilities && n.abilities[a] !== mine.abilities[a]) problems.push(`${row.fields.name}: ${a} Open5e ${mine.abilities[a]} ES ${n.abilities[a]}`);
    const save = mine.saves[a] ?? mod(mine.abilities[a]);
    if (a in n.saves && n.saves[a] !== save) problems.push(`${row.fields.name}: ${a} save Open5e ${save} ES ${n.saves[a]}`);
  }
  // Attack bonuses must agree between the two sources; a mismatch points at a parsing mistake.
  const hits = (s) => s.sections.flatMap((x) => x.features.map((f) => f.hit)).filter((h) => h !== null).sort((a, b) => a - b).join();
  if (hits(sheet) !== hits(spanish)) problems.push(`${row.fields.name}: attack bonuses differ EN [${hits(sheet)}] ES [${hits(spanish)}]`);
  es.push({ ...base(row), name: spanish.name, kind: spanish.kind, acNote: spanish.acNote, speed: spanish.speed, skills: spanish.skills, sections: spanish.sections });
}

const sort = (list) => list.sort((a, b) => a.name.localeCompare(b.name));
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "en.json"), JSON.stringify(sort(en)));
writeFileSync(path.join(out, "es.json"), JSON.stringify(sort(es)));
console.log(`${en.length} creatures in English, ${es.length} in Spanish.`);
for (const p of problems) console.log(`- ${p}`);
