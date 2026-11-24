import { useState } from "preact/hooks";
import { initiativeEntries } from "../dice/entry";
import { cryptoRng } from "../dice/notation";
import { type ThrowDice, throwD20s } from "../dice/throw";
import { plural, t } from "../i18n";
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
    ? t("init.start")
    : waiting
      ? t("init.startRound")
      : isLastTurn
        ? t("init.nextRound")
        : t("init.nextTurn");

  if (!state.sceneReady) {
    return <p class="empty">{t("init.noScene")}</p>;
  }

  return (
    <div class="initiative">
      <div class="statusbar">
        <div>
          <strong class="round">{running ? t("init.round", { n: combat.round }) : t("init.noCombat")}</strong>
          <span class="mode">{modeLabel(settings)}</span>
        </div>
        {isGM && (
          <button
            type="button"
            class={`ghost ${showSettings ? "on" : ""}`}
            aria-expanded={showSettings}
            onClick={() => setShowSettings(!showSettings)}
          >
            {t("init.settings")}
          </button>
        )}
      </div>

      {isGM && showSettings && <SettingsPanel settings={settings} onChange={(s) => backend.setSettings(s)} />}

      {waiting && combatants.length > 0 && (
        <p class="banner">
          {missing > 0
            ? plural(missing, "init.missingOne", "init.missingMany", { n: combat.round, count: missing })
            : t("init.ready", { n: combat.round })}
        </p>
      )}

      {list.length === 0 ? (
        <p class="empty">
          {t("init.emptyBefore")} <em>{t("menu.add")}</em>.
        </p>
      ) : (
        <>
          <div class="row header" aria-hidden="true">
            <span />
            <span>{t("init.colName")}</span>
            <span class="col-num">{t("init.colBonus")}</span>
            <span class="col-num">{t("init.colInit")}</span>
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
                        {active && <b>{t("init.acting")} · </b>}
                        {c.ownerId === me.id ? t("init.yours") : (owner?.name ?? t("init.noPlayer"))}
                        {!c.visible && ` · ${t("init.hidden")}`}
                        {isGM && c.profileId && ` · ${t("init.hasSheet")}`}
                      </span>
                    </span>
                    {editable ? (
                      <NumField
                        label={t("init.bonusOf", { name: c.name })}
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
                        label={t("init.initiativeOf", { name: c.name })}
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
                          title={t("init.rollD20", { bonus: formatBonus(c.bonus) })}
                          aria-label={t("init.rollFor", { name: c.name })}
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
                          aria-label={t("init.optionsOf", { name: c.name })}
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
                        {t("init.player")}
                        <select
                          value={c.ownerId}
                          onChange={(e) => backend.patchCombatants({ [c.id]: { ownerId: e.currentTarget.value } })}
                        >
                          {!owner && <option value={c.ownerId}>{t("init.noPlayer")}</option>}
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
                          {t("init.viewSheet")}
                        </button>
                      )}
                      {running && !active && (
                        <button type="button" onClick={() => backend.setCombat({ ...combat, activeId: c.id })}>
                          {t("init.giveTurn")}
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
                        {t("common.remove")}
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
              {t("init.previous")}
            </button>
            <button type="button" class="primary" disabled={rolling} onClick={next}>
              {rolling ? t("common.rolling") : primaryLabel}
            </button>
          </div>
          <div class="minor-buttons">
            <button
              type="button"
              class="ghost"
              disabled={rolling}
              onClick={() => rollMany(false)}
            >
              {t("init.rollAll")}
            </button>
            <button
              type="button"
              class="ghost"
              disabled={missing === 0 || rolling}
              onClick={() => rollMany(true)}
            >
              {t("init.rollMissing")}
            </button>
            {running && (
              <button type="button" class="ghost danger" onClick={() => apply(endCombat(combatants))}>
                {t("init.end")}
              </button>
            )}
          </div>
        </div>
      )}

      {!isGM && (
        <p class="hint">
          {settings.playersEditOwn
            ? t("init.hintOwn")
            : t("init.hintGM")}
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
          {t("set.order")}
          <Help text={t("set.orderHelp")} />
        </span>
        <div class="segmented" role="group" aria-label={t("set.order")}>
          <button
            type="button"
            class={settings.mode === "standard" ? "on" : ""}
            aria-pressed={settings.mode === "standard"}
            onClick={() => onChange({ ...settings, mode: "standard" })}
          >
            {t("set.standard")}
          </button>
          <button
            type="button"
            class={settings.mode === "reroll" ? "on" : ""}
            aria-pressed={settings.mode === "reroll"}
            onClick={() => onChange({ ...settings, mode: "reroll" })}
          >
            {t("set.reroll")}
          </button>
        </div>
      </div>
      {settings.mode === "reroll" && (
        <div class="field">
          <span class="field-label">{t("set.rerollLabel")}</span>
          <div class="segmented" role="group" aria-label={t("set.rerollKind")}>
            <button
              type="button"
              class={settings.rerollAuto ? "on" : ""}
              aria-pressed={settings.rerollAuto}
              onClick={() => onChange({ ...settings, rerollAuto: true })}
            >
              {t("set.auto")}
            </button>
            <button
              type="button"
              class={!settings.rerollAuto ? "on" : ""}
              aria-pressed={!settings.rerollAuto}
              onClick={() => onChange({ ...settings, rerollAuto: false })}
            >
              {t("set.manual")}
            </button>
          </div>
          <p class="field-help">
            {settings.rerollAuto
              ? t("set.autoHelp")
              : t("set.manualHelp")}
          </p>
        </div>
      )}
      <label class="check">
        <input
          type="checkbox"
          checked={settings.playersEditOwn}
          onChange={(e) => onChange({ ...settings, playersEditOwn: e.currentTarget.checked })}
        />
        {t("set.playersEdit")}
        <Help text={t("set.playersEditHelp")} />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.showMarker}
          onChange={(e) => onChange({ ...settings, showMarker: e.currentTarget.checked })}
        />
        {t("set.marker")}
        <Help text={t("set.markerHelp")} />
      </label>
    </div>
  );
}

function modeLabel(settings: Settings): string {
  if (settings.mode === "standard") return t("mode.standard");
  return t(settings.rerollAuto ? "mode.auto" : "mode.manual");
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
