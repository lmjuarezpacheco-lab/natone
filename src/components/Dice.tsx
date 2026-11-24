import { useState } from "preact/hooks";
import { clearBox } from "../dice/box";
import { makeEntry } from "../dice/entry";
import {
  DIE_SIDES,
  EMPTY_POOL,
  MAX_DICE,
  MAX_MODIFIER,
  type Keep,
  type Pool,
  diceCount,
  diceToThrow,
  formatNotation,
  parseNotation,
  withCount,
  withKeep,
} from "../dice/notation";
import type { ThrowDice } from "../dice/throw";
import { type Key, t } from "../i18n";
import type { Backend, RollEntry, State } from "../types";
import { Help } from "./Help";
import { RollLine } from "./RollLine";

interface Props {
  backend: Backend;
  state: State;
  throwDice: ThrowDice;
  /** Dice are rolling in the tray, from this tab or another one. */
  rolling: boolean;
}

/** One-click pools for the most common keep rules. */
const PRESETS: { label: Key; sides: number; count: number; keep: Keep }[] = [
  { label: "dice.advantage", sides: 20, count: 2, keep: { mode: "h", n: 1 } },
  { label: "dice.disadvantage", sides: 20, count: 2, keep: { mode: "l", n: 1 } },
  { label: "dice.fourD6", sides: 6, count: 4, keep: { mode: "h", n: 3 } },
];

export function Dice({ backend, state, throwDice, rolling }: Props) {
  const [pool, setPool] = useState<Pool>(EMPTY_POOL);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const [last, setLast] = useState<RollEntry | null>(null);

  const updatePool = (next: Pool) => {
    setPool(next);
    setText(formatNotation(next));
  };
  const addDie = (sides: number, delta: number) => {
    if (delta > 0 && diceCount(pool) >= MAX_DICE) return;
    updatePool(withCount(pool, sides, (pool.counts[sides] ?? 0) + delta));
  };
  const addModifier = (delta: number) => {
    const modifier = Math.min(MAX_MODIFIER, Math.max(-MAX_MODIFIER, pool.modifier + delta));
    updatePool({ ...pool, modifier });
  };
  const onText = (value: string) => {
    setText(value);
    const parsed = parseNotation(value);
    if (parsed) setPool(parsed);
    else if (value.trim() === "") setPool(EMPTY_POOL);
  };
  const isPreset = (preset: (typeof PRESETS)[number]) => {
    const rule = pool.keep?.[preset.sides];
    return pool.counts[preset.sides] === preset.count && rule?.mode === preset.keep.mode && rule.n === preset.keep.n;
  };
  const togglePreset = (preset: (typeof PRESETS)[number]) => {
    // A second click takes the preset's dice out again.
    if (isPreset(preset)) updatePool(withCount(pool, preset.sides, 0));
    else updatePool(withKeep(withCount(pool, preset.sides, preset.count), preset.sides, preset.keep));
  };

  const textInvalid = text.trim() !== "" && parseNotation(text) === null;
  const canRoll = !rolling && !textInvalid && diceCount(pool) > 0;
  const keepSizes = DIE_SIDES.filter((sides) => (pool.counts[sides] ?? 0) >= 2);

  const roll = async () => {
    if (!canRoll) return;
    const thrown = await throwDice(diceToThrow(pool, "normal"));
    const entry = makeEntry(state.me, pool, "normal", thrown, { hidden });
    setLast(entry);
    backend.sendRoll(entry);
  };

  return (
    <div class="dice">
      <div class="result" aria-live="polite">
        {rolling ? (
          <span class="muted">{t("common.rolling")}</span>
        ) : last ? (
          <RollLine roll={last} big />
        ) : (
          <span class="muted">{t("dice.prompt")}</span>
        )}
      </div>
      <div class="die-grid">
        {DIE_SIDES.map((sides) => {
          const count = pool.counts[sides] ?? 0;
          return (
            <div class="die-cell" key={sides}>
              <button
                type="button"
                class={`die ${count > 0 ? "on" : ""}`}
                aria-label={t("dice.addDie", { sides, count })}
                onClick={() => addDie(sides, 1)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  addDie(sides, -1);
                }}
              >
                d{sides}
                {count > 0 && <span class="count">{count}</span>}
              </button>
              {count > 0 && (
                <button type="button" class="minus" aria-label={t("dice.removeDie", { sides })} onClick={() => addDie(sides, -1)}>
                  −
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div class="chips presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            class={`chip ${isPreset(preset) ? "strong" : ""}`}
            aria-pressed={isPreset(preset)}
            onClick={() => togglePreset(preset)}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>

      {keepSizes.map((sides) => {
        const count = pool.counts[sides];
        const rule = pool.keep?.[sides];
        const choose = (mode: Keep["mode"]) =>
          updatePool(withKeep(pool, sides, { mode, n: Math.min(rule?.n ?? Math.max(1, count - 1), count - 1) }));
        return (
          <div class="keep-row" key={sides}>
            <span class="keep-die">
              {count}d{sides}
              <Help text={t("dice.keepHelp")} />
            </span>
            <div class="segmented small" role="group" aria-label={t("dice.keepWhich", { sides })}>
              <button type="button" class={!rule ? "on" : ""} aria-pressed={!rule} onClick={() => updatePool(withKeep(pool, sides, null))}>
                {t("dice.all")}
              </button>
              <button type="button" class={rule?.mode === "h" ? "on" : ""} aria-pressed={rule?.mode === "h"} onClick={() => choose("h")}>
                {t("dice.highest")}
              </button>
              <button type="button" class={rule?.mode === "l" ? "on" : ""} aria-pressed={rule?.mode === "l"} onClick={() => choose("l")}>
                {t("dice.lowest")}
              </button>
            </div>
            {rule && (
              <div class="stepper" role="group" aria-label={t("dice.keepCount", { sides })}>
                <button
                  type="button"
                  aria-label={t("dice.keepFewer")}
                  disabled={rule.n <= 1}
                  onClick={() => updatePool(withKeep(pool, sides, { ...rule, n: rule.n - 1 }))}
                >
                  −
                </button>
                <span>{rule.n}</span>
                <button
                  type="button"
                  aria-label={t("dice.keepMore")}
                  disabled={rule.n >= count - 1}
                  onClick={() => updatePool(withKeep(pool, sides, { ...rule, n: rule.n + 1 }))}
                >
                  +
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div class="roll-row">
        <div class="stepper" role="group" aria-label={t("dice.modifier")}>
          <button type="button" aria-label={t("dice.modifierDown")} onClick={() => addModifier(-1)}>
            −
          </button>
          <span>{pool.modifier >= 0 ? `+${pool.modifier}` : pool.modifier}</span>
          <button type="button" aria-label={t("dice.modifierUp")} onClick={() => addModifier(1)}>
            +
          </button>
        </div>
        <input
          class={`notation ${textInvalid ? "invalid" : ""}`}
          type="text"
          aria-label={t("dice.asText")}
          aria-invalid={textInvalid}
          placeholder="2d6 + 3"
          value={text}
          onInput={(e) => onText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void roll();
          }}
        />
        <button
          type="button"
          class="ghost"
          disabled={diceCount(pool) === 0 && pool.modifier === 0 && text === ""}
          onClick={() => {
            updatePool(EMPTY_POOL);
            // Dice that are still rolling must land first, or their roll would never finish.
            if (!rolling) clearBox();
          }}
        >
          {t("dice.clear")}
        </button>
      </div>
      {textInvalid && (
        <p class="field-help error">{t("dice.invalid")}</p>
      )}

      <div class="roll-row">
        <button type="button" class="primary wide" disabled={!canRoll} onClick={roll}>
          {rolling ? t("common.rolling") : t("dice.roll")}
        </button>
        <label class="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
          {t("dice.hidden")}
          <Help text={t("dice.hiddenHelp")} />
        </label>
      </div>
    </div>
  );
}
