import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Dice } from "./components/Dice";
import { Initiative } from "./components/Initiative";
import { Monsters } from "./components/Monsters";
import { Tray } from "./components/Tray";
import { RollCleared, clearBox, resizeBox, roll3d } from "./dice/box";
import { throwWithRng } from "./dice/notation";
import { findTheme } from "./dice/themes";
import { type DiceGroup, type ThrowDice, matchesThrow } from "./dice/throw";
import { t } from "./i18n";
import { type Prefs, loadPrefs, savePrefs } from "./prefs";
import type { Backend, State } from "./types";

type Tab = "initiative" | "dice" | "monsters";

/**
 * NatOne's own blue for buttons, the active tab and the tray. Background and text still follow
 * Owlbear Rodeo's theme, so the panel sits well in the room in light and in dark.
 */
const ACCENT = {
  dark: { color: "#9db4f0", contrast: "#0e1424" },
  light: { color: "#24418a", contrast: "#ffffff" },
};

/** Panel widths in CSS pixels. Keep in sync with styles.css and the manifest in vite.config.ts. */
const MAIN_WIDTH = 380;
const HANDLE_WIDTH = 24;
const TRAY_WIDTH = 300;
const CLOSED_WIDTH = MAIN_WIDTH + HANDLE_WIDTH;
const OPEN_WIDTH = CLOSED_WIDTH + TRAY_WIDTH;

function useBackendState(backend: Backend): State {
  const [state, setState] = useState(backend.getState());
  useEffect(() => {
    setState(backend.getState());
    return backend.subscribe(() => setState(backend.getState()));
  }, [backend]);
  return state;
}

/** Resolves when the window is at least `width` wide, or after a short wait if the host gives less. */
function widthReached(width: number): Promise<void> {
  return new Promise((resolve) => {
    if (window.innerWidth >= width) return resolve();
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("resize", check);
      resolve();
    };
    const check = () => window.innerWidth >= width && done();
    const timer = setTimeout(done, 300);
    window.addEventListener("resize", check);
  });
}

/** How long the tray takes to slide, a little over the 0.22 s of the stylesheet. Nothing when motion is reduced. */
const TRAY_MS = 240;
function pause(ms: number): Promise<void> {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => setTimeout(resolve, reduced ? 0 : ms));
}

export function App({ backend }: { backend: Backend }) {
  const state = useBackendState(backend);
  const [selectedTab, setTab] = useState<Tab>("initiative");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Follows `prefs.tray`, a moment later when the host must widen the panel first.
  const [trayOpen, setTrayOpen] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [trayNotice, setTrayNotice] = useState("");
  const [unread, setUnread] = useState(false);
  const isGM = state.me.role === "GM";
  // The monster library belongs to the GM.
  const tab = selectedTab === "monsters" && !isGM ? "initiative" : selectedTab;

  // Follow Owlbear Rodeo's light or dark theme for surfaces and text. Before the first paint, so no
  // frame shows the wrong background.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = state.theme.mode.toLowerCase();
    root.classList.toggle("standalone", state.standalone);
    const accent = ACCENT[state.theme.mode === "LIGHT" ? "light" : "dark"];
    root.style.setProperty("--primary", accent.color);
    root.style.setProperty("--primary-contrast", accent.contrast);
    root.style.setProperty("--bg", state.theme.background);
    root.style.setProperty("--paper", state.theme.paper);
    root.style.setProperty("--text", state.theme.text);
    root.style.setProperty("--text-2", state.theme.textSecondary);
  }, [state.theme, state.standalone]);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });
  };

  // The tray and the popover change in steps: wide popover, then tray in; tray out, then narrow popover.
  // `wanted` is where the clicks want to end, the rest is what is done so far. One loop walks there,
  // so quick clicks cannot leave a half-open tray or a wide popover with the tray closed.
  const wanted = useRef(prefs.tray);
  const shown = useRef(false);
  const hostWidth = useRef(CLOSED_WIDTH);
  const syncing = useRef(false);
  const standaloneNow = useRef(state.standalone);
  standaloneNow.current = state.standalone;
  const syncTray = async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (;;) {
        if (wanted.current) {
          if (hostWidth.current !== OPEN_WIDTH) {
            hostWidth.current = OPEN_WIDTH;
            await backend.setPanelWidth?.(OPEN_WIDTH).catch(() => {});
            if (!standaloneNow.current) await widthReached(OPEN_WIDTH);
          } else if (!shown.current) {
            shown.current = true;
            setUnread(false);
            setTrayOpen(true);
            await pause(TRAY_MS);
          } else break;
        } else if (shown.current) {
          shown.current = false;
          // Dice that are still rolling finish out of sight: their result is already owed to a roll.
          if (pending.current === 0) clearBox();
          setTrayNotice("");
          setTrayOpen(false);
          await pause(TRAY_MS);
        } else if (hostWidth.current !== CLOSED_WIDTH) {
          hostWidth.current = CLOSED_WIDTH;
          await backend.setPanelWidth?.(CLOSED_WIDTH).catch(() => {});
        } else break;
      }
    } finally {
      syncing.current = false;
    }
  };
  const toggleTray = () => {
    const open = !wanted.current;
    wanted.current = open;
    updatePrefs({ tray: open });
    void syncTray();
  };

  // A tray that was open last time opens again.
  useEffect(() => {
    if (wanted.current) void syncTray();
  }, []);

  // The 3D world follows the size of the tray.
  useEffect(() => {
    if (!trayOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(timer);
      timer = setTimeout(resizeBox, 150);
    };
    // Once now, after the drawer has finished moving.
    timer = setTimeout(resizeBox, 260);
    window.addEventListener("resize", resize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", resize);
    };
  }, [trayOpen]);

  // A dot on the handle says the log has rolls the user has not seen.
  const newestId = state.rolls[0]?.id;
  const seenId = useRef(newestId);
  useEffect(() => {
    if (newestId === seenId.current) return;
    seenId.current = newestId;
    if (!trayOpen && newestId !== undefined) setUnread(true);
  }, [newestId, trayOpen]);

  // The 3D engine takes one job at a time: a roll that starts before the last one settles would never finish.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const exclusive = <T,>(job: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(job, job);
    queue.current = result.catch(() => {});
    return result;
  };
  const trayOpenNow = useRef(trayOpen);
  trayOpenNow.current = trayOpen;
  const prefsNow = useRef(prefs);
  prefsNow.current = prefs;

  const pending = useRef(0);
  const throwDice: ThrowDice = (dice: readonly DiceGroup[]) => {
    // Closed tray: no 3D engine, the answer is immediate.
    if (!trayOpenNow.current) return Promise.resolve(throwWithRng(dice));
    // Sample dice from the settings preview give way to a real roll.
    if (pending.current === 0) clearBox();
    pending.current += 1;
    setRolling(true);
    return exclusive(async () => {
      try {
        if (!trayOpenNow.current) return throwWithRng(dice);
        setTrayNotice("");
        const theme = findTheme(prefsNow.current.theme);
        const result = await roll3d("#dice-tray", dice, theme.id, prefsNow.current.themeColor);
        if (!matchesThrow(dice, result)) throw new Error("unexpected 3D dice result");
        return result;
      } catch (error) {
        // Cleared dice are not a failure of the engine, so there is nothing to tell the user.
        if (!(error instanceof RollCleared)) {
          console.warn("3D dice failed, using a plain roll.", error);
          setTrayNotice(t("tray.fallback"));
        }
        return throwWithRng(dice);
      } finally {
        pending.current -= 1;
        setRolling(pending.current > 0);
      }
    });
  };

  return (
    <div class={`app ${trayOpen ? "tray-open" : ""}`}>
      <div class="main">
        <nav class="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "initiative"} onClick={() => setTab("initiative")}>
            {t("tab.initiative")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "dice"} onClick={() => setTab("dice")}>
            {t("tab.dice")}
          </button>
          {isGM && (
            <button type="button" role="tab" aria-selected={tab === "monsters"} onClick={() => setTab("monsters")}>
              {t("tab.monsters")}
            </button>
          )}
        </nav>

        {state.standalone && backend.setRole && (
          <div class="devbar">
            <span>{t("dev.preview")}</span>
            <span class="devbar-buttons">
              {backend.setThemeMode && (
                <button type="button" onClick={() => backend.setThemeMode!(state.theme.mode === "DARK" ? "LIGHT" : "DARK")}>
                  {t(state.theme.mode === "DARK" ? "dev.themeLight" : "dev.themeDark")}
                </button>
              )}
              <button type="button" onClick={() => backend.setRole!(state.me.role === "GM" ? "PLAYER" : "GM")}>
                {t(state.me.role === "GM" ? "dev.viewAsPlayer" : "dev.viewAsGM")}
              </button>
            </span>
          </div>
        )}

        {/* The panels stay mounted so each keeps its state between tab changes. */}
        <section class={`panel ${tab === "initiative" ? "" : "hidden"}`} role="tabpanel">
          <Initiative
            backend={backend}
            state={state}
            throwDice={throwDice}
            rolling={rolling}
            onOpenProfile={(id) => {
              setProfileId(id);
              setTab("monsters");
            }}
          />
        </section>
        <section class={`panel ${tab === "dice" ? "" : "hidden"}`} role="tabpanel">
          <Dice backend={backend} state={state} throwDice={throwDice} rolling={rolling} />
        </section>
        {isGM && (
          <section class={`panel ${tab === "monsters" ? "" : "hidden"}`} role="tabpanel">
            <Monsters backend={backend} state={state} throwDice={throwDice} rolling={rolling} openId={profileId} onOpen={setProfileId} />
          </section>
        )}
      </div>

      <div class="drawer">
        <button
          type="button"
          class="tray-handle"
          aria-expanded={trayOpen}
          aria-controls="tray-panel"
          aria-label={`${t(prefs.tray ? "tray.close" : "tray.open")}${unread ? `. ${t("tray.unread")}` : ""}`}
          title={t(prefs.tray ? "tray.close" : "tray.open")}
          onClick={toggleTray}
        >
          <svg class="tray-handle-arrow" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="tray-handle-label">{t("tray.handle")}</span>
          {unread && <span class="tray-handle-dot" aria-hidden="true" />}
        </button>
        {/* Stays mounted while closed: the 3D engine keeps its canvas inside. */}
        <div class="tray-clip">
        <Tray
          open={trayOpen}
          prefs={prefs}
          onPrefs={updatePrefs}
          rolls={state.rolls}
          rolling={rolling}
          notice={trayNotice}
          onNotice={setTrayNotice}
          exclusive={exclusive}
        />
        </div>
      </div>
    </div>
  );
}
