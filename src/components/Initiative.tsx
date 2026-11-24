import { useState } from "preact/hooks";
import { initiativeEntries } from "../dice/entry";
import { cryptoRng } from "../dice/notation";
import { type ThrowDice, throwD20s } from "../dice/throw";
import {
  BONUS_RANGE,
  INITIATIVE_RANGE,
  canEdit,
  countRolls,
  endCombat,
  feedRng,
  nextTurn,
  previousTurn,
  rollPatches,
  sortCombatants,
  type Step,
} from "../logic";
import type { Backend, Combatant, Patches, Settings, State } from "../types";
import { Help } from "./Help";
import { NumField } from "./NumField";

interface Props {
  backend: Backend;
  state: State;
  throwDice: ThrowDice;
  /** Dice are rolling in the tray, from this tab or another one. */
  rolling: boolean;
  /** Opens a linked monster sheet. */
  onOpenProfile: (id: string) => void;
}

export function Initiative({ backend, state, throwDice, rolling, onOpenProfile }: Props) {
  const { me, settings, combat, combatants, players } = state;
  const isGM = me.role === "GM";
  const [showSettings, setShowSettings] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Players do not see hidden tokens. Turn order for the GM uses every combatant.
  const list = sortCombatants(isGM ? combatants : combatants.filter((c) => c.visible));
  const order = sortCombatants(combatants);
  const activeIndex = order.findIndex((c) => c.id === combat.activeId);
  const running = combat.round > 0;
  const waiting = running && activeIndex === -1;
  const missing = combatants.filter((c) => c.initiative === null).length;
  const isLastTurn = running && activeIndex === order.length - 1;

  const apply = async (step: Step) => {
    await backend.patchCombatants(step.patches);
    await backend.setCombat(step.combat);
  };
  /** Writes rolled initiative and adds one log line per combatant. A hidden token gets a hidden line. */
  const logRolls = (targets: readonly Combatant[], patches: Patches) =>
    backend.sendRolls(initiativeEntries(me, targets, patches));
  const next = async () => {
    if (rolling) return;
    // The d20s are thrown first, in the tray when it is open. The step then uses those faces.
    const needed = countRolls((rng) => nextTurn(combatants, combat, settings, rng));
    const faces = await throwD20s(throwDice, needed);
    const step = nextTurn(combatants, combat, settings, feedRng(faces, cryptoRng));
    await apply(step);
    logRolls(combatants, step.patches);
  };
  const previous = () => backend.setCombat(previousTurn(combatants, combat, settings));
  const rollMany = async (onlyMissing: boolean) => {
    if (rolling) return;
    const needed = countRolls((rng) => rollPatches(combatants, rng, onlyMissing));
    const faces = await throwD20s(throwDice, needed);
    const patches = rollPatches(combatants, feedRng(faces, cryptoRng), onlyMissing);
    await backend.patchCombatants(patches);
    logRolls(combatants, patches);
  };
  const rollFor = async (c: Combatant) => {
    if (rolling) return;
    const [face] = await throwD20s(throwDice, 1);
    const patches: Patches = { [c.id]: { initiative: face + c.bonus } };
    await backend.patchCombatants(patches);
    logRolls([c], patches);
  };

  const primaryLabel = !running
    ? "Iniciar combate"
    : waiting
      ? "Empezar ronda"
      : isLastTurn
        ? "Siguiente ronda"
        : "Siguiente turno";

  if (!state.sceneReady) {
    return <p class="empty">Abre una escena para usar la iniciativa.</p>;
  }

  return (
    <div class="initiative">
      <div class="statusbar">
        <div>
          <strong class="round">{running ? `Ronda ${combat.round}` : "Sin combate"}</strong>
          <span class="mode">{modeLabel(settings)}</span>
        </div>
        {isGM && (
          <button
            type="button"
            class={`ghost ${showSettings ? "on" : ""}`}
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
          >
            Ajustes
          </button>
        )}
      </div>

      {isGM && showSettings && <SettingsPanel settings={settings} onChange={(s) => backend.setSettings(s)} />}

      {waiting && combatants.length > 0 && (
        <p class="banner">
          {missing > 0
            ? `Ronda ${combat.round}: faltan ${missing} ${missing === 1 ? "iniciativa" : "iniciativas"}.`
            : `Ronda ${combat.round}: iniciativas listas.`}
        </p>
      )}

      {list.length === 0 ? (
        <p class="empty">
          Sin participantes. Clic derecho en un token del mapa y elige <em>Agregar a iniciativa</em>.
        </p>
      ) : (
        <>
          <div class="row header" aria-hidden="true">
            <span />
            <span>Nombre</span>
            <span class="col-num">Bonif.</span>
            <span class="col-num">Inic.</span>
            <span />
          </div>
          <ul class="rows">
            {list.map((c) => {
              const editable = canEdit(me, settings, c);
              const owner = players.find((p) => p.id === c.ownerId);
              const active = c.id === combat.activeId;
              return (
                <li key={c.id} class={`${active ? "active" : ""} ${c.visible ? "" : "dim"}`}>
                  <div class="row">
                    <span class="avatar" aria-hidden="true">
                      {c.image ? <img src={c.image} alt="" /> : c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span class="who">
                      <span class="name">{c.name}</span>
                      <span class="owner">
                        {active && <b>En turno · </b>}
                        {c.ownerId === me.id ? "Tuyo" : (owner?.name ?? "Sin jugador conectado")}
                        {!c.visible && " · oculto"}
                        {isGM && c.profileId && " · con hoja"}
                      </span>
                    </span>
                    {editable ? (
                      <NumField
                        label={`Bonificador de ${c.name}`}
                        value={c.bonus}
                        signed
                        min={BONUS_RANGE.min}
                        max={BONUS_RANGE.max}
                        onCommit={(bonus) => backend.patchCombatants({ [c.id]: { bonus: bonus ?? 0 } })}
                      />
                    ) : (
                      <span class="col-num muted">{formatBonus(c.bonus)}</span>
                    )}
                    {editable ? (
                      <NumField
                        label={`Iniciativa de ${c.name}`}
                        value={c.initiative}
                        allowEmpty
                        placeholder="–"
                        min={INITIATIVE_RANGE.min}
                        max={INITIATIVE_RANGE.max}
                        onCommit={(initiative) => backend.patchCombatants({ [c.id]: { initiative } })}
                      />
                    ) : (
                      <span class="col-num value">{c.initiative ?? "–"}</span>
                    )}
                    <span class="row-actions">
                      {editable && (
                        <button
                          type="button"
                          class="icon"
                          title={`Tirar d20 ${formatBonus(c.bonus)}`}
                          aria-label={`Tirar iniciativa de ${c.name}`}
                          disabled={rolling}
                          onClick={() => rollFor(c)}
                        >
                          <D20Icon />
                        </button>
                      )}
                      {isGM && (
                        <button
                          type="button"
                          class={`icon ${openRow === c.id ? "on" : ""}`}
                          aria-label={`Opciones de ${c.name}`}
                          aria-expanded={openRow === c.id}
                          onClick={() => setOpenRow(openRow === c.id ? null : c.id)}
                        >
                          ⋯
                        </button>
                      )}
                    </span>
                  </div>
                  {isGM && openRow === c.id && (
                    <div class="row-detail">
                      <label>
                        Jugador
                        <select
                          value={c.ownerId}
                          onChange={(e) => backend.patchCombatants({ [c.id]: { ownerId: e.currentTarget.value } })}
                        >
                          {!owner && <option value={c.ownerId}>Sin jugador conectado</option>}
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.role === "GM" ? " (GM)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      {c.profileId && (
                        <button type="button" onClick={() => onOpenProfile(c.profileId!)}>
                          Ver hoja
                        </button>
                      )}
                      {running && !active && (
                        <button type="button" onClick={() => backend.setCombat({ ...combat, activeId: c.id })}>
                          Dar turno
                        </button>
                      )}
                      <button
                        type="button"
                        class="danger"
                        onClick={() => {
                          setOpenRow(null);
                          void backend.removeCombatants([c.id]);
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {isGM && combatants.length > 0 && (
        <div class="controls">
          <div class="turn-buttons">
            <button type="button" disabled={!running || waiting} onClick={previous}>
              Anterior
            </button>
            <button type="button" class="primary" disabled={rolling} onClick={next}>
              {rolling ? "Tirando…" : primaryLabel}
            </button>
          </div>
          <div class="minor-buttons">
            <button
              type="button"
              class="ghost"
              disabled={rolling}
              onClick={() => rollMany(false)}
            >
              Tirar todos
            </button>
            <button
              type="button"
              class="ghost"
              disabled={missing === 0 || rolling}
              onClick={() => rollMany(true)}
            >
              Tirar faltantes
            </button>
            {running && (
              <button type="button" class="ghost danger" onClick={() => apply(endCombat(combatants))}>
                Terminar
              </button>
            )}
          </div>
        </div>
      )}

      {!isGM && (
        <p class="hint">
          {settings.playersEditOwn
            ? "Puedes cambiar la iniciativa y el bonificador de tus propios tokens."
            : "Solo el GM puede cambiar iniciativas."}
        </p>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <div class="settings">
      <div class="field">
        <span class="field-label">
          Orden de iniciativa
          <Help text="Normal: una tirada vale para todo el combate. Reroll cada ronda: al terminar la ronda, todos vuelven a tirar iniciativa." />
        </span>
        <div class="segmented" role="group" aria-label="Orden de iniciativa">
          <button
            type="button"
            class={settings.mode === "standard" ? "on" : ""}
            aria-pressed={settings.mode === "standard"}
            onClick={() => onChange({ ...settings, mode: "standard" })}
          >
            Normal
          </button>
          <button
            type="button"
            class={settings.mode === "reroll" ? "on" : ""}
            aria-pressed={settings.mode === "reroll"}
            onClick={() => onChange({ ...settings, mode: "reroll" })}
          >
            Reroll cada ronda
          </button>
        </div>
      </div>
      {settings.mode === "reroll" && (
        <div class="field">
          <span class="field-label">Reroll</span>
          <div class="segmented" role="group" aria-label="Tipo de reroll">
            <button
              type="button"
              class={settings.rerollAuto ? "on" : ""}
              aria-pressed={settings.rerollAuto}
              onClick={() => onChange({ ...settings, rerollAuto: true })}
            >
              Automático
            </button>
            <button
              type="button"
              class={!settings.rerollAuto ? "on" : ""}
              aria-pressed={!settings.rerollAuto}
              onClick={() => onChange({ ...settings, rerollAuto: false })}
            >
              Manual
            </button>
          </div>
          <p class="field-help">
            {settings.rerollAuto
              ? "Al terminar la ronda, el tracker tira d20 + bonificador para todos."
              : "Al terminar la ronda, las iniciativas se vacían. Se escriben o se tiran de nuevo."}
          </p>
        </div>
      )}
      <label class="check">
        <input
          type="checkbox"
          checked={settings.playersEditOwn}
          onChange={(e) => onChange({ ...settings, playersEditOwn: e.currentTarget.checked })}
        />
        Los jugadores pueden cambiar su propia iniciativa
        <Help text="Cada jugador puede escribir o tirar la iniciativa de sus propios tokens. El dueño de cada token se asigna en su menú de opciones. El GM debe estar conectado." />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.showMarker}
          onChange={(e) => onChange({ ...settings, showMarker: e.currentTarget.checked })}
        />
        Marcar en el mapa el token en turno
        <Help text="Dibuja un marco alrededor del token que tiene el turno. Si el token está oculto, solo el GM ve el marco." />
      </label>
    </div>
  );
}

function modeLabel(settings: Settings): string {
  if (settings.mode === "standard") return "Orden normal";
  return settings.rerollAuto ? "Reroll automático" : "Reroll manual";
}

function formatBonus(bonus: number): string {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

function D20Icon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" />
      <path d="M12 2 7.5 9.5h9zM7.5 9.5 12 17.5l4.5-8M3 7l4.5 2.5M21 7l-4.5 2.5M12 17.5V22M7.5 9.5 3 17M16.5 9.5 21 17" />
    </svg>
  );
}
