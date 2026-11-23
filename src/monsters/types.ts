export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export interface DamageRoll {
  /** Dice text such as "1d6 + 2". */
  notation: string;
  /** Damage type as written in the source, or "". */
  type: string;
}

export interface Feature {
  name: string;
  text: string;
  /** Attack bonus, when the feature is an attack roll. */
  hit: number | null;
  damage: DamageRoll[];
}

export interface Section {
  title: string;
  features: Feature[];
}

/** A monster sheet. Lives only in the browser of whoever imported it. */
export interface Profile {
  id: string;
  name: string;
  source: string;
  /** Size and type line, for example "Small humanoid". */
  kind: string;
  cr: string;
  ac: number | null;
  acNote: string;
  hp: number | null;
  hpFormula: string;
  speed: string;
  abilities: Record<Ability, number>;
  /** Saving throw bonuses that differ from the plain ability modifier. */
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  initiative: number;
  sections: Section[];
}

/** Small record for listing and searching without loading full sheets. */
export interface ProfileSummary {
  id: string;
  name: string;
  source: string;
  kind: string;
  cr: string;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function summarize(profile: Profile): ProfileSummary {
  const { id, name, source, kind, cr } = profile;
  return { id, name, source, kind, cr };
}
