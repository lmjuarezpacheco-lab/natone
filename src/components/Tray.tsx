import { useEffect, useState } from "preact/hooks";
import { RollCleared, clearBox, preview3d } from "../dice/box";
import { THEMES, findTheme } from "../dice/themes";
import type { Prefs } from "../prefs";
import type { RollEntry } from "../types";
import { Help } from "./Help";
import { RollLine } from "./RollLine";

interface Props {
  open: boolean;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  rolls: RollEntry[];
  /** Dice are rolling in the stage. */
  rolling: boolean;
  notice: string;
  onNotice: (text: string) => void;
  /** Runs a job on the 3D engine after the one before it has finished. */
  exclusive: <T>(job: () => Promise<T>) => Promise<T>;
}

/** The dice tray: the 3D stage, the personal dice settings behind the gear, and the roll log. */
export function Tray({ open, prefs, onPrefs, rolls, rolling, notice, onNotice, exclusive }: Props) {
  const [showPrefs, setShowPrefs] = useState(false);
  const [used, setUsed] = useState(false);
  const theme = findTheme(prefs.theme);

  useEffect(() => {
    if (rolling) setUsed(true);
  }, [rolling]);

  // While the settings are open, the stage shows the chosen model and color.
  useEffect(() => {
    if (!open || !showPrefs) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void exclusive(async () => {
        if (cancelled) return;
        await preview3d("#dice-tray", theme.id, prefs.themeColor);
      }).catch((error) => {
        // The sample dice were cleared before they settled: the settings closed or a real roll took over.
        if (error instanceof RollCleared) return;
        console.warn("3D dice preview failed.", error);
        onNotice("Dados 3D no disponibles ahora.");
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, showPrefs, theme.id, prefs.themeColor]);

  const togglePrefs = () => {
    if (showPrefs && !rolling) clearBox();
    setShowPrefs(!showPrefs);
  };

  return (
    <aside id="tray-panel" class="tray-panel" aria-label="Bandeja de dados" inert={!open}>
      <div class="tray-head">
        <h2 class="tray-title">
          Bandeja de dados
          <Help text="Tus tiradas de iniciativa, de dados y de monstruos ruedan aquí en 3D. La animación solo la ves tú: los demás reciben el resultado. Con la bandeja cerrada, los dados 3D no se cargan y la tirada es inmediata." />
        </h2>
        <button
          type="button"
          class={`icon ${showPrefs ? "on" : ""}`}
          aria-expanded={showPrefs}
          aria-label="Mis dados: modelo, color y avisos"
          title="Mis dados"
          onClick={togglePrefs}
        >
          <GearIcon />
        </button>
      </div>

      {showPrefs && (
        <div class="settings">
          <div class="field inline">
            <label>
              Modelo
              <select value={theme.id} onChange={(e) => onPrefs({ theme: e.currentTarget.value })}>
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
                disabled={!theme.colorable}
                onChange={(e) => onPrefs({ themeColor: e.currentTarget.value })}
              />
            </label>
          </div>
          {!theme.colorable && <p class="field-help">Este modelo tiene color fijo.</p>}
          <label class="check">
            <input type="checkbox" checked={prefs.notify} onChange={(e) => onPrefs({ notify: e.currentTarget.checked })} />
            Avisarme de tiradas de otros
            <Help text="Muestra un aviso cada vez que otra persona comparte una tirada. Las tiradas de iniciativa no avisan: ya se ven en el tracker." />
          </label>
          <p class="field-help">Estos ajustes son solo tuyos. Los demás no ven tus dados 3D, solo el resultado.</p>
        </div>
      )}

      {/* The 3D engine puts its canvas inside #dice-tray, so that element must have no other children. */}
      <div class="tray-wrap">
        <div id="dice-tray" class="tray" aria-hidden="true" />
        {showPrefs ? (
          <span class="tray-caption">Vista previa de tus dados</span>
        ) : (
          !used && <span class="tray-caption">Tus tiradas ruedan aquí.</span>
        )}
      </div>
      {notice && <p class="banner">{notice}</p>}

      <h3 class="log-title">Tiradas</h3>
      {rolls.length === 0 ? (
        <p class="empty">Aún no hay tiradas.</p>
      ) : (
        <ul class="log" tabIndex={0} aria-label="Registro de tiradas">
          {rolls.map((r) => (
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
    </aside>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      <circle cx="12" cy="12" r="6.8" />
    </svg>
  );
}
