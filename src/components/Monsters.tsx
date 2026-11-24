import { useEffect, useRef, useState } from "preact/hooks";
import { makeEntry } from "../dice/entry";
import { type Adv, type Pool, diceToThrow, parseNotation } from "../dice/notation";
import type { ThrowDice } from "../dice/throw";
import { type Key, plural, t } from "../i18n";
import { buildBackup, isBackup, isHomebrew, parseBackup } from "../monsters/homebrew";
import { clearLibrary, deleteProfile, getProfile, listHomebrew, listSummaries, saveProfiles } from "../monsters/library";
import { parseMonsterFile } from "../monsters/parse5etools";
import { ABILITIES, type Ability, type Feature, type Profile, type ProfileSummary, abilityModifier } from "../monsters/types";
import type { Backend, RollEntry, State } from "../types";
import { Editor } from "./Editor";
import { Help } from "./Help";
import { RollLine } from "./RollLine";

interface Props {
  backend: Backend;
  state: State;
  throwDice: ThrowDice;
  /** Dice are rolling in the tray, from this tab or another one. */
  rolling: boolean;
  /** Sheet to show, or null for the list. */
  openId: string | null;
  onOpen: (id: string | null) => void;
}

const LIST_LIMIT = 80;
const abilityLabel = (ability: Ability) => t(`ability.${ability}`);
const ADV_LABEL: Record<Adv, Key> = { normal: "adv.normal", adv: "dice.advantage", dis: "dice.disadvantage" };
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const d20 = (modifier: number): Pool => ({ counts: { 20: 1 }, modifier });

export function Monsters({ backend, state, throwDice, rolling, openId, onOpen }: Props) {
  const [summaries, setSummaries] = useState<ProfileSummary[] | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  /** Sheet being edited, "new" for a blank one, or null when the editor is closed. */
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  /** Changes after a save, so an open sheet reloads. */
  const [version, setVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listSummaries()
      .then(setSummaries)
      .catch(() => setStorageError(true));
  useEffect(() => void refresh(), []);

  const importFiles = async (files: FileList) => {
    let imported = 0;
    let skipped = 0;
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const json: unknown = JSON.parse(await file.text());
        const parsed = isBackup(json) ? parseBackup(json) : parseMonsterFile(json);
        await saveProfiles(parsed.profiles);
        imported += parsed.profiles.length;
        skipped += parsed.skipped;
      } catch (error) {
        const reason = error instanceof SyntaxError ? t("mon.notJson") : error instanceof Error ? error.message : t("mon.error");
        problems.push(`${file.name}: ${reason}`);
      }
    }
    const parts = [plural(imported, "mon.importedOne", "mon.importedMany", { n: imported })];
    if (skipped > 0) parts.push(plural(skipped, "mon.skippedOne", "mon.skippedMany", { n: skipped }));
    parts.push(...problems);
    setStatus(parts.join(" "));
    await refresh();
  };

  if (storageError) {
    return <p class="empty">{t("mon.storageBlocked")}</p>;
  }

  const exportHomebrew = async () => {
    const sheets = await listHomebrew();
    const url = URL.createObjectURL(new Blob([buildBackup(sheets)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "natone-homebrew.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(plural(sheets.length, "mon.exportedOne", "mon.exportedMany", { n: sheets.length }));
  };

  if (editing !== null) {
    return (
      <Editor
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={async (profile) => {
          await saveProfiles([profile]);
          setEditing(null);
          setVersion(version + 1);
          setStatus("");
          onOpen(profile.id);
          await refresh();
        }}
      />
    );
  }

  if (openId !== null) {
    return (
      <Sheet
        key={`${openId}:${version}`}
        id={openId}
        onEdit={setEditing}
        backend={backend}
        state={state}
        throwDice={throwDice}
        rolling={rolling}
        onBack={() => onOpen(null)}
        onDeleted={() => {
          onOpen(null);
          void refresh();
        }}
      />
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = (summaries ?? []).filter(
    (s) => needle === "" || s.name.toLowerCase().includes(needle) || s.source.toLowerCase() === needle,
  );

  return (
    <div class="monsters">
      <div class="monster-toolbar">
        <button type="button" class="primary" onClick={() => fileInput.current?.click()}>
          {t("mon.import")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files && files.length > 0) void importFiles(files);
            e.currentTarget.value = "";
          }}
        />
        <button type="button" onClick={() => setEditing("new")}>
          {t("mon.new")}
        </button>
        <span class="muted count">{summaries ? plural(summaries.length, "mon.sheetsOne", "mon.sheetsMany", { n: summaries.length }) : t("common.loading")}</span>
      </div>
      {status && <p class="banner">{status}</p>}

      {summaries && summaries.length === 0 ? (
        <p class="empty">
          {t("mon.emptyBefore")} <code>bestiary-*.json</code>
          {t("mon.emptyAfter")}
        </p>
      ) : (
        <>
          <input
            class="search"
            type="text"
            aria-label={t("mon.search")}
            placeholder={t("mon.searchPlaceholder")}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <ul class="monster-list">
            {matches.slice(0, LIST_LIMIT).map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s.id)}>
                  <span class="name">{s.name}</span>
                  <span class="owner">
                    {s.cr !== "" && `CR ${s.cr} · `}
                    {s.kind}
                    {s.source && ` · ${s.source}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {matches.length > LIST_LIMIT && (
            <p class="hint">{t("mon.more", { n: matches.length - LIST_LIMIT })}</p>
          )}
          {summaries && matches.length === 0 && <p class="empty">{t("mon.noResults")}</p>}
          {summaries && summaries.length > 0 && (
            <div class="minor-buttons">
              {summaries.some((s) => isHomebrew(s.id)) && (
                <button type="button" class="ghost" onClick={exportHomebrew}>
                  {t("mon.export")}
                </button>
              )}
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    class="danger"
                    onClick={async () => {
                      await clearLibrary();
                      setConfirmClear(false);
                      setStatus(t("mon.cleared"));
                      await refresh();
                    }}
                  >
                    {t("mon.confirmClear", { n: summaries.length })}
                  </button>
                  <button type="button" class="ghost" onClick={() => setConfirmClear(false)}>
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button type="button" class="ghost danger" onClick={() => setConfirmClear(true)}>
                  {t("mon.clear")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface SheetProps {
  id: string;
  backend: Backend;
  state: State;
  throwDice: ThrowDice;
  rolling: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onEdit: (profile: Profile) => void;
}

function Sheet({ id, backend, state, throwDice, rolling, onBack, onDeleted, onEdit }: SheetProps) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [adv, setAdv] = useState<Adv>("normal");
  const [crit, setCrit] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [last, setLast] = useState<RollEntry | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getProfile(id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [id]);

  if (profile === undefined) return <p class="empty">{t("common.loading")}</p>;
  if (profile === null) {
    return (
      <div class="monsters">
        <button type="button" class="ghost" onClick={onBack}>
          {t("mon.back")}
        </button>
        <p class="empty">{t("mon.missing")}</p>
      </div>
    );
  }

  const roll = async (label: string, pool: Pool, withAdv: boolean) => {
    // One roll at a time while dice are in the tray.
    if (rolling) return;
    const mode = withAdv ? adv : "normal";
    const thrown = await throwDice(diceToThrow(pool, mode));
    const entry = makeEntry(state.me, pool, mode, thrown, { label: `${profile.name} · ${label}`, hidden });
    setLast(entry);
    backend.sendRoll(entry);
  };
  const rollDamage = (feature: Feature, notation: string) => {
    const pool = parseNotation(notation);
    if (!pool) return;
    const counts = crit ? Object.fromEntries(Object.entries(pool.counts).map(([sides, n]) => [sides, n * 2])) : pool.counts;
    void roll(`${feature.name}${crit ? ` (${t("roll.critical")})` : ""}`, { ...pool, counts }, false);
  };
  const assign = async () => {
    const ids = await backend.getSelection();
    if (ids.length === 0) {
      setStatus(t("mon.selectFirst"));
      return;
    }
    const changed = await backend.assignProfile(ids, profile.id, profile.initiative);
    setStatus(
      changed > 0
        ? plural(changed, "mon.assignedOne", "mon.assignedMany", { n: changed, bonus: signed(profile.initiative) })
        : t("mon.noTokens"),
    );
  };

  const hpPool = parseNotation(profile.hpFormula);

  return (
    <div class={`monsters sheet ${rolling ? "busy" : ""}`}>
      <div class="statusbar">
        <button type="button" class="ghost" onClick={onBack}>
          {t("mon.back")}
        </button>
        <span>
          <button type="button" class="ghost" onClick={() => onEdit(profile)}>
            {t("mon.edit")}
          </button>
          <button
            type="button"
            class="ghost danger"
            onClick={async () => {
              await deleteProfile(profile.id);
              onDeleted();
            }}
          >
            {t("mon.delete")}
          </button>
        </span>
      </div>

      <div>
        <h2 class="sheet-name">{profile.name}</h2>
        <p class="field-help">
          {[profile.kind, profile.cr && `CR ${profile.cr}`, profile.source].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div class="result" aria-live="polite">
        {rolling ? (
          <span class="muted">{t("common.rolling")}</span>
        ) : last ? (
          <RollLine roll={last} big />
        ) : (
          <span class="muted">{t("mon.prompt")}</span>
        )}
      </div>

      <dl class="stat-line">
        <div>
          <dt>{t("stat.ac")}</dt>
          <dd>
            {profile.ac ?? "–"}
            {profile.acNote && <small> ({profile.acNote})</small>}
          </dd>
        </div>
        <div>
          <dt>{t("stat.hp")}</dt>
          <dd>
            {profile.hp ?? "–"}{" "}
            {profile.hpFormula &&
              (hpPool ? (
                <button type="button" class="chip" title={t("mon.rollHitPoints")} onClick={() => roll(t("roll.hitPoints"), hpPool, false)}>
                  {profile.hpFormula}
                </button>
              ) : (
                <small>({profile.hpFormula})</small>
              ))}
          </dd>
        </div>
        <div>
          <dt>{t("stat.init")}</dt>
          <dd>{signed(profile.initiative)}</dd>
        </div>
        {profile.speed && (
          <div class="full">
            <dt>{t("stat.speed")}</dt>
            <dd>{profile.speed}</dd>
          </div>
        )}
      </dl>

      <button type="button" onClick={assign}>
        {t("mon.assign")}
      </button>
      {status && <p class="banner">{status}</p>}

      <div class="roll-row">
        <div class="segmented small" role="group" aria-label={t("dice.advantage")}>
          {(["normal", "adv", "dis"] as const).map((value) => (
            <button key={value} type="button" class={adv === value ? "on" : ""} aria-pressed={adv === value} onClick={() => setAdv(value)}>
              {t(ADV_LABEL[value])}
            </button>
          ))}
        </div>
      </div>
      <div class="roll-row">
        <label class="check">
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.currentTarget.checked)} />
          {t("mon.critical")}
          <Help text={t("mon.criticalHelp")} />
        </label>
        <label class="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
          {t("mon.hiddenRolls")}
          <Help text={t("mon.hiddenRollsHelp")} />
        </label>
      </div>

      <div class="abilities">
        {ABILITIES.map((ability) => {
          const modifier = abilityModifier(profile.abilities[ability]);
          const save = profile.saves[ability] ?? modifier;
          return (
            <div class="ability" key={ability}>
              <span class="ability-name">
                {abilityLabel(ability)} <small>{profile.abilities[ability]}</small>
              </span>
              <button
                type="button"
                class="chip"
                aria-label={t("mon.checkOf", { ability: abilityLabel(ability), bonus: signed(modifier) })}
                onClick={() => roll(t("roll.check", { ability: abilityLabel(ability) }), d20(modifier), true)}
              >
                {signed(modifier)}
              </button>
              <button
                type="button"
                class={`chip ${ability in profile.saves ? "strong" : ""}`}
                aria-label={t("mon.saveOf", { ability: abilityLabel(ability), bonus: signed(save) })}
                onClick={() => roll(t("roll.save", { ability: abilityLabel(ability) }), d20(save), true)}
              >
                {t("mon.saveShort")} {signed(save)}
              </button>
            </div>
          );
        })}
      </div>

      {Object.keys(profile.skills).length > 0 && (
        <div class="chips">
          {Object.entries(profile.skills).map(([skill, bonus]) => (
            <button key={skill} type="button" class="chip" onClick={() => roll(skill, d20(bonus), true)}>
              {skill} {signed(bonus)}
            </button>
          ))}
        </div>
      )}

      {profile.sections.map((section) => (
        <section key={section.title}>
          <h3 class="log-title">{section.title}</h3>
          {section.features.map((feature, index) => (
            <div class="feature" key={index}>
              <p>
                {feature.name && <strong>{feature.name}. </strong>}
                {feature.text}
              </p>
              {(feature.hit !== null || feature.damage.length > 0) && (
                <div class="chips">
                  {feature.hit !== null && (
                    <button type="button" class="chip strong" onClick={() => roll(`${feature.name} (${t("roll.attack")})`, d20(feature.hit!), true)}>
                      {t("mon.attack", { bonus: signed(feature.hit) })}
                    </button>
                  )}
                  {feature.damage.map((damage, i) =>
                    parseNotation(damage.notation) ? (
                      <button key={i} type="button" class="chip" onClick={() => rollDamage(feature, damage.notation)}>
                        {damage.notation} {damage.type}
                      </button>
                    ) : (
                      <span key={i} class="muted">
                        {damage.notation} {damage.type}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
