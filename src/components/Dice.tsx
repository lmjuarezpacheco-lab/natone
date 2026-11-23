import { useEffect, useRef, useState } from "preact/hooks";
import { clearBox, preview3d, resizeBox, roll3d } from "../dice/box";
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
  throwWithRng,
  withCount,
  withKeep,
} from "../dice/notation";
import { THEMES, findTheme } from "../dice/themes";
import { type Prefs, loadPrefs, savePrefs } from "../prefs";
import type { Backend, RollEntry, State } from "../types";
import { Help } from "./Help";
import { RollLine } from "./RollLine";

interface Props {
  backend: Backend;
  state: State;
  /** False while another tab is shown. The 3D tray needs a resize when it comes back. */
  visible: boolean;
}

/** One-click pools for the most common keep rules. */
const PRESETS: { label: string; sides: number; count: number; keep: Keep }[] = [
  { label: "Ventaja", sides: 20, count: 2, keep: { mode: "h", n: 1 } },
  { label: "Desventaja", sides: 20, count: 2, keep: { mode: "l", n: 1 } },
  { label: "4d6, 3 más altos", sides: 6, count: 4, keep: { mode: "h", n: 3 } },
];

export function Dice({ backend, state, visible }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [pool, setPool] = useState<Pool>(EMPTY_POOL);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<RollEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [showPrefs, setShowPrefs] = useState(false);
  const rollingNow = useRef(false);

  const theme = findTheme(prefs.theme);

  useEffect(() => {
    if (visible && prefs.dice3d) resizeBox();
  }, [visible, prefs.dice3d]);

  // While "Mis dados" is open, the tray shows the chosen model and color.
  useEffect(() => {
    if (!showPrefs || !prefs.dice3d || !visible) return;
    const timer = setTimeout(() => {
      if (rollingNow.current) return;
      preview3d("#dice-tray", theme.id, prefs.themeColor).catch((error) => {
        console.warn("3D dice preview failed.", error);
        setNotice("Dados 3D no disponibles ahora.");
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [showPrefs, prefs.dice3d, theme.id, prefs.themeColor, visible]);

  const togglePrefs = () => {
    if (showPrefs) clearBox();
    setShowPrefs(!showPrefs);
  };

  const updatePrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

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
    setRolling(true);
    rollingNow.current = true;
    setNotice("");
    const dice = diceToThrow(pool, "normal");
    const expected = dice.reduce((sum, d) => sum + d.qty, 0);
    let thrown: { sides: number; value: number }[] | null = null;
    if (prefs.dice3d) {
      try {
        const result = await roll3d("#dice-tray", dice, theme.id, prefs.themeColor);
        const valid =
          result.length === expected && result.every((d) => Number.isInteger(d.value) && d.value >= 1 && d.value <= d.sides);
        if (valid) thrown = result;
        else throw new Error("unexpected 3D dice result");
      } catch (error) {
        console.warn("3D dice failed, using a plain roll.", error);
        setNotice("Dados 3D no disponibles ahora. Se usó una tirada simple.");
      }
    }
    thrown ??= throwWithRng(dice);

    const entry = makeEntry(state.me, pool, "normal", thrown, { hidden });
    setLast(entry);
    backend.sendRoll(entry);
    rollingNow.current = false;
    setRolling(false);
  };

  return (
    <div class="dice">
      <button type="button" class="ghost section-toggle" aria-expanded={showPrefs} onClick={togglePrefs}>
        Mis dados {showPrefs ? "▴" : "▾"}
      </button>
      {showPrefs && (
        <div class="settings">
          <label class="check">
            <input type="checkbox" checked={prefs.dice3d} onChange={(e) => updatePrefs({ dice3d: e.currentTarget.checked })} />
            Dados 3D
            <Help text="Muestra los dados rodando en la bandeja. Solo cambia lo que ves tú. Apágalos si tu equipo va lento." />
          </label>
          <div class="field inline">
            <label>
              Modelo
              <select value={theme.id} disabled={!prefs.dice3d} onChange={(e) => updatePrefs({ theme: e.currentTarget.value })}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input
                type="color"
                value={prefs.themeColor}
                disabled={!prefs.dice3d || !theme.colorable}
                onChange={(e) => updatePrefs({ themeColor: e.currentTarget.value })}
              />
            </label>
          </div>
          {prefs.dice3d && !theme.colorable && <p class="field-help">Este modelo tiene color fijo.</p>}
          <label class="check">
            <input type="checkbox" checked={prefs.notify} onChange={(e) => updatePrefs({ notify: e.currentTarget.checked })} />
            Avisarme de tiradas de otros
            <Help text="Muestra un aviso cada vez que otra persona comparte una tirada." />
          </label>
          <p class="field-help">Estos ajustes son solo tuyos. Los demás no ven tus dados 3D, solo el resultado.</p>
        </div>
      )}

      {/* The 3D engine puts its canvas inside #dice-tray, so that element must have no other children. */}
      <div class={`tray-wrap ${prefs.dice3d ? "" : "off"}`}>
        <div id="dice-tray" class="tray" aria-hidden="true" />
        {showPrefs && <span class="tray-caption">Vista previa de tus dados</span>}
      </div>

      <div class="result" aria-live="polite">
        {rolling ? (
          <span class="muted">Tirando…</span>
        ) : last ? (
          <RollLine roll={last} big />
        ) : (
          <span class="muted">Elige dados y pulsa Tirar.</span>
        )}
      </div>
      {notice && <p class="banner">{notice}</p>}

      <div class="die-grid">
        {DIE_SIDES.map((sides) => {
          const count = pool.counts[sides] ?? 0;
          return (
            <div class="die-cell" key={sides}>
              <button
                type="button"
                class={`die ${count > 0 ? "on" : ""}`}
                aria-label={`Agregar d${sides}. Ahora ${count}`}
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
                <button type="button" class="minus" aria-label={`Quitar un d${sides}`} onClick={() => addDie(sides, -1)}>
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
            {preset.label}
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
              <Help text="Elige qué dados se suman: todos, los más altos o los más bajos. Con ventaja se tiran 2d20 y cuenta el más alto." />
            </span>
            <div class="segmented small" role="group" aria-label={`Qué d${sides} se suman`}>
              <button type="button" class={!rule ? "on" : ""} aria-pressed={!rule} onClick={() => updatePool(withKeep(pool, sides, null))}>
                Todos
              </button>
              <button type="button" class={rule?.mode === "h" ? "on" : ""} aria-pressed={rule?.mode === "h"} onClick={() => choose("h")}>
                Más altos
              </button>
              <button type="button" class={rule?.mode === "l" ? "on" : ""} aria-pressed={rule?.mode === "l"} onClick={() => choose("l")}>
                Más bajos
              </button>
            </div>
            {rule && (
              <div class="stepper" role="group" aria-label={`Cuántos d${sides} se suman`}>
                <button
                  type="button"
                  aria-label="Sumar un dado menos"
                  disabled={rule.n <= 1}
                  onClick={() => updatePool(withKeep(pool, sides, { ...rule, n: rule.n - 1 }))}
                >
                  −
                </button>
                <span>{rule.n}</span>
                <button
                  type="button"
                  aria-label="Sumar un dado más"
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
        <div class="stepper" role="group" aria-label="Modificador">
          <button type="button" aria-label="Bajar modificador" onClick={() => addModifier(-1)}>
            −
          </button>
          <span>{pool.modifier >= 0 ? `+${pool.modifier}` : pool.modifier}</span>
          <button type="button" aria-label="Subir modificador" onClick={() => addModifier(1)}>
            +
          </button>
        </div>
        <input
          class={`notation ${textInvalid ? "invalid" : ""}`}
          type="text"
          aria-label="Tirada en texto"
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
            clearBox();
          }}
        >
          Limpiar
        </button>
      </div>
      {textInvalid && (
        <p class="field-help error">Formato no válido. Ejemplos: 2d6 + 1d20 - 1, 4d6kh3. Dados: d4 a d100.</p>
      )}

      <div class="roll-row">
        <button type="button" class="primary wide" disabled={!canRoll} onClick={roll}>
          {rolling ? "Tirando…" : "Tirar"}
        </button>
        <label class="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
          Oculta
          <Help text="La tirada no se comparte. Solo tú ves el resultado." />
        </label>
      </div>

      <h2 class="log-title">Tiradas</h2>
      {state.rolls.length === 0 ? (
        <p class="empty">Aún no hay tiradas.</p>
      ) : (
        <ul class="log">
          {state.rolls.map((r) => (
            <li key={r.id}>
              <span class="log-who">
                <span class="dot" style={{ background: r.color }} />
                {r.playerName}
                {r.hidden && <span class="tag">oculta</span>}
              </span>
              <RollLine roll={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
