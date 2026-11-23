import { useState } from "preact/hooks";
import {
  type Draft,
  type FeatureDraft,
  HOMEBREW_SOURCE,
  SECTION_TITLES,
  draftToProfile,
  emptyDraft,
  emptyFeature,
  newHomebrewId,
  profileToDraft,
} from "../monsters/homebrew";
import { ABILITIES, type Ability, type Profile, abilityModifier } from "../monsters/types";

interface Props {
  /** Sheet to edit, or null for a new one. */
  initial: Profile | null;
  onSave: (profile: Profile) => Promise<void>;
  onCancel: () => void;
}

const ABILITY_LABEL: Record<Ability, string> = { str: "FUE", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" };
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function Editor({ initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => (initial ? profileToDraft(initial) : emptyDraft()));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setFeature = (index: number, patch: Partial<FeatureDraft>) =>
    setDraft((current) => ({
      ...current,
      features: current.features.map((feature, i) => (i === index ? { ...feature, ...patch } : feature)),
    }));

  const field = (key: "name" | "kind" | "cr" | "ac" | "acNote" | "hp" | "hpFormula" | "speed" | "initiative" | "skills") => ({
    value: draft[key],
    onInput: (e: { currentTarget: HTMLInputElement }) => set({ [key]: e.currentTarget.value }),
  });

  const modifierOf = (ability: Ability) => {
    const score = Number(draft.abilities[ability]);
    return Number.isFinite(score) && draft.abilities[ability].trim() !== "" ? abilityModifier(score) : 0;
  };

  const save = async () => {
    const id = initial?.id ?? newHomebrewId();
    const result = draftToProfile(draft, id, initial?.source ?? HOMEBREW_SOURCE);
    setErrors(result.errors);
    if (!result.profile) return;
    setSaving(true);
    try {
      await onSave(result.profile);
    } catch {
      setErrors(["No se pudo guardar en este navegador."]);
      setSaving(false);
    }
  };

  // Sections of an imported sheet may have titles the editor does not offer by default.
  const sectionOptions = [...SECTION_TITLES, ...draft.features.map((f) => f.section)].filter((t, i, all) => all.indexOf(t) === i);

  return (
    <form
      class="monsters editor"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div class="statusbar">
        <strong class="round">{initial ? "Editar hoja" : "Nuevo monstruo"}</strong>
        <button type="button" class="ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>

      <label class="f">
        Nombre
        <input type="text" {...field("name")} />
      </label>
      <div class="form-row">
        <label class="f grow">
          Tamaño y tipo
          <input type="text" placeholder="Medium beast" {...field("kind")} />
        </label>
        <label class="f short">
          CR
          <input type="text" placeholder="1/2" {...field("cr")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f short">
          CA
          <input type="text" inputMode="numeric" {...field("ac")} />
        </label>
        <label class="f grow">
          Nota de CA
          <input type="text" placeholder="natural armor" {...field("acNote")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f short">
          PG
          <input type="text" inputMode="numeric" {...field("hp")} />
        </label>
        <label class="f grow">
          Dados de golpe
          <input type="text" placeholder="5d8 + 15" {...field("hpFormula")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f grow">
          Velocidad
          <input type="text" {...field("speed")} />
        </label>
        <label class="f short">
          Iniciativa
          <input type="text" inputMode="numeric" placeholder={signed(modifierOf("dex"))} {...field("initiative")} />
        </label>
      </div>

      <fieldset class="ability-editor">
        <legend>Características y salvaciones</legend>
        {ABILITIES.map((ability) => (
          <div class="ability-edit" key={ability}>
            <span class="ability-name">{ABILITY_LABEL[ability]}</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={`Puntuación de ${ABILITY_LABEL[ability]}`}
              value={draft.abilities[ability]}
              onInput={(e) => set({ abilities: { ...draft.abilities, [ability]: e.currentTarget.value } })}
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label={`Salvación de ${ABILITY_LABEL[ability]}`}
              placeholder={`S ${signed(modifierOf(ability))}`}
              value={draft.saves[ability]}
              onInput={(e) => set({ saves: { ...draft.saves, [ability]: e.currentTarget.value } })}
            />
          </div>
        ))}
        <p class="field-help">Fila de abajo: salvación. Vacía usa el modificador. Iniciativa vacía usa Destreza.</p>
      </fieldset>

      <label class="f">
        Habilidades
        <input type="text" placeholder="stealth +6, perception +4" {...field("skills")} />
      </label>

      <h3 class="log-title">Rasgos y acciones</h3>
      {draft.features.map((feature, index) => (
        <div class="feature-edit" key={index}>
          <div class="form-row">
            <label class="f grow">
              Sección
              <select value={feature.section} onChange={(e) => setFeature(index, { section: e.currentTarget.value })}>
                {sectionOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              class="ghost danger"
              aria-label={`Quitar ${feature.name || "rasgo o acción"}`}
              onClick={() => set({ features: draft.features.filter((_, i) => i !== index) })}
            >
              Quitar
            </button>
          </div>
          <label class="f">
            Nombre
            <input type="text" value={feature.name} onInput={(e) => setFeature(index, { name: e.currentTarget.value })} />
          </label>
          <div class="form-row">
            <label class="f short">
              Ataque
              <input
                type="text"
                inputMode="numeric"
                placeholder="+5"
                value={feature.hit}
                onInput={(e) => setFeature(index, { hit: e.currentTarget.value })}
              />
            </label>
            <label class="f grow">
              Daño
              <input
                type="text"
                placeholder="2d6 + 3 piercing, 1d6 fire"
                value={feature.damage}
                onInput={(e) => setFeature(index, { damage: e.currentTarget.value })}
              />
            </label>
          </div>
          <label class="f">
            Descripción
            <textarea rows={3} value={feature.text} onInput={(e) => setFeature(index, { text: e.currentTarget.value })} />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set({ features: [...draft.features, emptyFeature(draft.features.at(-1)?.section)] })}
      >
        Agregar rasgo o acción
      </button>

      {errors.length > 0 && (
        <ul class="banner error-list" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <button type="submit" class="primary wide" disabled={saving}>
        {saving ? "Guardando…" : "Guardar hoja"}
      </button>
    </form>
  );
}
