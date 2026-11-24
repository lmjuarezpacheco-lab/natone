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
import { t } from "../i18n";

interface Props {
  /** Sheet to edit, or null for a new one. */
  initial: Profile | null;
  onSave: (profile: Profile) => Promise<void>;
  onCancel: () => void;
}

const abilityLabel = (ability: Ability) => t(`ability.${ability}`);
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
      setErrors([t("ed.saveFailed")]);
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
        <strong class="round">{initial ? t("ed.titleEdit") : t("mon.new")}</strong>
        <button type="button" class="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>

      <label class="f">
        {t("ed.name")}
        <input type="text" {...field("name")} />
      </label>
      <div class="form-row">
        <label class="f grow">
          {t("ed.kind")}
          <input type="text" placeholder="Medium beast" {...field("kind")} />
        </label>
        <label class="f short">
          CR
          <input type="text" placeholder="1/2" {...field("cr")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f short">
          {t("stat.ac")}
          <input type="text" inputMode="numeric" {...field("ac")} />
        </label>
        <label class="f grow">
          {t("ed.acNote")}
          <input type="text" placeholder={t("ed.acNotePlaceholder")} {...field("acNote")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f short">
          {t("stat.hp")}
          <input type="text" inputMode="numeric" {...field("hp")} />
        </label>
        <label class="f grow">
          {t("ed.hitDice")}
          <input type="text" placeholder="5d8 + 15" {...field("hpFormula")} />
        </label>
      </div>
      <div class="form-row">
        <label class="f grow">
          {t("ed.speed")}
          <input type="text" {...field("speed")} />
        </label>
        <label class="f short">
          {t("ed.initiative")}
          <input type="text" inputMode="numeric" placeholder={signed(modifierOf("dex"))} {...field("initiative")} />
        </label>
      </div>

      <fieldset class="ability-editor">
        <legend>{t("ed.abilities")}</legend>
        {ABILITIES.map((ability) => (
          <div class="ability-edit" key={ability}>
            <span class="ability-name">{abilityLabel(ability)}</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label={t("ed.scoreOf", { ability: abilityLabel(ability) })}
              value={draft.abilities[ability]}
              onInput={(e) => set({ abilities: { ...draft.abilities, [ability]: e.currentTarget.value } })}
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label={t("ed.saveOf", { ability: abilityLabel(ability) })}
              placeholder={`${t("mon.saveShort")} ${signed(modifierOf(ability))}`}
              value={draft.saves[ability]}
              onInput={(e) => set({ saves: { ...draft.saves, [ability]: e.currentTarget.value } })}
            />
          </div>
        ))}
        <p class="field-help">{t("ed.abilityHelp")}</p>
      </fieldset>

      <label class="f">
        {t("ed.skills")}
        <input type="text" placeholder="stealth +6, perception +4" {...field("skills")} />
      </label>

      <h3 class="log-title">{t("ed.features")}</h3>
      {draft.features.map((feature, index) => (
        <div class="feature-edit" key={index}>
          <div class="form-row">
            <label class="f grow">
              {t("ed.section")}
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
              aria-label={t("ed.removeFeature", { name: feature.name || t("ed.featureFallback") })}
              onClick={() => set({ features: draft.features.filter((_, i) => i !== index) })}
            >
              {t("common.remove")}
            </button>
          </div>
          <label class="f">
            {t("ed.name")}
            <input type="text" value={feature.name} onInput={(e) => setFeature(index, { name: e.currentTarget.value })} />
          </label>
          <div class="form-row">
            <label class="f short">
              {t("ed.attack")}
              <input
                type="text"
                inputMode="numeric"
                placeholder="+5"
                value={feature.hit}
                onInput={(e) => setFeature(index, { hit: e.currentTarget.value })}
              />
            </label>
            <label class="f grow">
              {t("ed.damage")}
              <input
                type="text"
                placeholder="2d6 + 3 piercing, 1d6 fire"
                value={feature.damage}
                onInput={(e) => setFeature(index, { damage: e.currentTarget.value })}
              />
            </label>
          </div>
          <label class="f">
            {t("ed.description")}
            <textarea rows={3} value={feature.text} onInput={(e) => setFeature(index, { text: e.currentTarget.value })} />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() => set({ features: [...draft.features, emptyFeature(draft.features.at(-1)?.section)] })}
      >
        {t("ed.addFeature")}
      </button>

      {errors.length > 0 && (
        <ul class="banner error-list" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <button type="submit" class="primary wide" disabled={saving}>
        {saving ? t("ed.saving") : t("ed.save")}
      </button>
    </form>
  );
}
