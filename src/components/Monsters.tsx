import { useEffect, useRef, useState } from "preact/hooks";
import { quickRoll } from "../dice/entry";
import { type Adv, type Pool, parseNotation } from "../dice/notation";
import { buildBackup, isBackup, isHomebrew, parseBackup } from "../monsters/homebrew";
import { clearLibrary, deleteProfile, getProfile, listHomebrew, listSummaries, saveProfiles } from "../monsters/library";
import { parseMonsterFile } from "../monsters/parse5etools";
import { ABILITIES, type Ability, type Feature, type Profile, type ProfileSummary, abilityModifier } from "../monsters/types";
import type { Backend, RollEntry, State } from "../types";
import { Editor } from "./Editor";
import { RollLine } from "./RollLine";

interface Props {
  backend: Backend;
  state: State;
  /** Sheet to show, or null for the list. */
  openId: string | null;
  onOpen: (id: string | null) => void;
}

const LIST_LIMIT = 80;
const ABILITY_LABEL: Record<Ability, string> = { str: "FUE", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" };
const ADV_LABEL: Record<Adv, string> = { normal: "Normal", adv: "Ventaja", dis: "Desventaja" };
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const d20 = (modifier: number): Pool => ({ counts: { 20: 1 }, modifier });

export function Monsters({ backend, state, openId, onOpen }: Props) {
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
        const reason = error instanceof SyntaxError ? "no es JSON válido" : error instanceof Error ? error.message : "error";
        problems.push(`${file.name}: ${reason}`);
      }
    }
    const parts = [`${imported} ${imported === 1 ? "monstruo importado" : "monstruos importados"}.`];
    if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? "omitido" : "omitidos"} por depender de otro archivo o no tener datos.`);
    parts.push(...problems);
    setStatus(parts.join(" "));
    await refresh();
  };

  if (storageError) {
    return <p class="empty">Este navegador bloquea el almacenamiento local. La biblioteca de monstruos no puede guardarse.</p>;
  }

  const exportHomebrew = async () => {
    const sheets = await listHomebrew();
    const url = URL.createObjectURL(new Blob([buildBackup(sheets)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "natone-homebrew.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`${sheets.length} ${sheets.length === 1 ? "hoja homebrew exportada" : "hojas homebrew exportadas"}.`);
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
          Importar JSON
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
          Nuevo monstruo
        </button>
        <span class="muted count">{summaries ? `${summaries.length} ${summaries.length === 1 ? "hoja" : "hojas"}` : "Cargando…"}</span>
      </div>
      {status && <p class="banner">{status}</p>}

      {summaries && summaries.length === 0 ? (
        <p class="empty">
          Biblioteca vacía. Crea un monstruo o importa un archivo en formato 5etools (por ejemplo{" "}
          <code>bestiary-*.json</code>). Las hojas se guardan solo en este navegador.
        </p>
      ) : (
        <>
          <input
            class="search"
            type="text"
            aria-label="Buscar monstruo"
            placeholder="Buscar por nombre o fuente"
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
            <p class="hint">Y {matches.length - LIST_LIMIT} más. Escribe más letras para acotar.</p>
          )}
          {summaries && matches.length === 0 && <p class="empty">Sin resultados.</p>}
          {summaries && summaries.length > 0 && (
            <div class="minor-buttons">
              {summaries.some((s) => isHomebrew(s.id)) && (
                <button type="button" class="ghost" onClick={exportHomebrew}>
                  Exportar homebrew
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
                      setStatus("Biblioteca vaciada.");
                      await refresh();
                    }}
                  >
                    Sí, borrar las {summaries.length} hojas
                  </button>
                  <button type="button" class="ghost" onClick={() => setConfirmClear(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" class="ghost danger" onClick={() => setConfirmClear(true)}>
                  Vaciar biblioteca
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
  onBack: () => void;
  onDeleted: () => void;
  onEdit: (profile: Profile) => void;
}

function Sheet({ id, backend, state, onBack, onDeleted, onEdit }: SheetProps) {
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

  if (profile === undefined) return <p class="empty">Cargando…</p>;
  if (profile === null) {
    return (
      <div class="monsters">
        <button type="button" class="ghost" onClick={onBack}>
          ← Biblioteca
        </button>
        <p class="empty">Esta hoja no está en la biblioteca de este navegador. Importa de nuevo su archivo.</p>
      </div>
    );
  }

  const roll = (label: string, pool: Pool, withAdv: boolean) => {
    const entry = quickRoll(state.me, pool, withAdv ? adv : "normal", { label: `${profile.name} · ${label}`, hidden });
    setLast(entry);
    backend.sendRoll(entry);
  };
  const rollDamage = (feature: Feature, notation: string) => {
    const pool = parseNotation(notation);
    if (!pool) return;
    const counts = crit ? Object.fromEntries(Object.entries(pool.counts).map(([sides, n]) => [sides, n * 2])) : pool.counts;
    roll(`${feature.name}${crit ? " (crítico)" : ""}`, { ...pool, counts }, false);
  };
  const assign = async () => {
    const ids = await backend.getSelection();
    if (ids.length === 0) {
      setStatus("Selecciona uno o más tokens en el mapa primero.");
      return;
    }
    const changed = await backend.assignProfile(ids, profile.id, profile.initiative);
    setStatus(
      changed > 0
        ? `Hoja asignada a ${changed} ${changed === 1 ? "token" : "tokens"}. Iniciativa ${signed(profile.initiative)}, ya en el tracker.`
        : "La selección no tiene tokens de personaje.",
    );
  };

  const hpPool = parseNotation(profile.hpFormula);

  return (
    <div class="monsters sheet">
      <div class="statusbar">
        <button type="button" class="ghost" onClick={onBack}>
          ← Biblioteca
        </button>
        <span>
          <button type="button" class="ghost" onClick={() => onEdit(profile)}>
            Editar
          </button>
          <button
            type="button"
            class="ghost danger"
            onClick={async () => {
              await deleteProfile(profile.id);
              onDeleted();
            }}
          >
            Borrar hoja
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
        {last ? <RollLine roll={last} big /> : <span class="muted">Pulsa un valor para tirar.</span>}
      </div>

      <dl class="stat-line">
        <div>
          <dt>CA</dt>
          <dd>
            {profile.ac ?? "–"}
            {profile.acNote && <small> ({profile.acNote})</small>}
          </dd>
        </div>
        <div>
          <dt>PG</dt>
          <dd>
            {profile.hp ?? "–"}{" "}
            {profile.hpFormula &&
              (hpPool ? (
                <button type="button" class="chip" title="Tirar puntos de golpe" onClick={() => roll("Puntos de golpe", hpPool, false)}>
                  {profile.hpFormula}
                </button>
              ) : (
                <small>({profile.hpFormula})</small>
              ))}
          </dd>
        </div>
        <div>
          <dt>Inic.</dt>
          <dd>{signed(profile.initiative)}</dd>
        </div>
        {profile.speed && (
          <div class="full">
            <dt>Vel.</dt>
            <dd>{profile.speed}</dd>
          </div>
        )}
      </dl>

      <button type="button" onClick={assign}>
        Asignar a tokens seleccionados
      </button>
      {status && <p class="banner">{status}</p>}

      <div class="roll-row">
        <div class="segmented small" role="group" aria-label="Ventaja">
          {(["normal", "adv", "dis"] as const).map((value) => (
            <button key={value} type="button" class={adv === value ? "on" : ""} aria-pressed={adv === value} onClick={() => setAdv(value)}>
              {ADV_LABEL[value]}
            </button>
          ))}
        </div>
      </div>
      <div class="roll-row">
        <label class="check">
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.currentTarget.checked)} />
          Daño crítico
        </label>
        <label class="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
          Tiradas ocultas
        </label>
      </div>

      <div class="abilities">
        {ABILITIES.map((ability) => {
          const modifier = abilityModifier(profile.abilities[ability]);
          const save = profile.saves[ability] ?? modifier;
          return (
            <div class="ability" key={ability}>
              <span class="ability-name">
                {ABILITY_LABEL[ability]} <small>{profile.abilities[ability]}</small>
              </span>
              <button
                type="button"
                class="chip"
                aria-label={`Prueba de ${ABILITY_LABEL[ability]} ${signed(modifier)}`}
                onClick={() => roll(`Prueba ${ABILITY_LABEL[ability]}`, d20(modifier), true)}
              >
                {signed(modifier)}
              </button>
              <button
                type="button"
                class={`chip ${ability in profile.saves ? "strong" : ""}`}
                aria-label={`Salvación de ${ABILITY_LABEL[ability]} ${signed(save)}`}
                onClick={() => roll(`Salvación ${ABILITY_LABEL[ability]}`, d20(save), true)}
              >
                S {signed(save)}
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
                    <button type="button" class="chip strong" onClick={() => roll(`${feature.name} (ataque)`, d20(feature.hit!), true)}>
                      Ataque {signed(feature.hit)}
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
