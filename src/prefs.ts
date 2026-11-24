/** Personal preferences. They stay in this browser and are never shared with the room. */
export interface Prefs {
  /** The dice tray is open. 3D dice run only while it is. */
  tray: boolean;
  theme: string;
  themeColor: string;
  notify: boolean;
}

const KEY = "tirada/prefs";

export const DEFAULT_PREFS: Prefs = {
  // Closed until the player opens it: the 3D engine is heavy for weak computers.
  tray: false,
  theme: "default",
  themeColor: "#7c5cff",
  notify: true,
};

/** Reads stored preferences. Anything missing or of the wrong type falls back to the default. */
export function readPrefs(stored: unknown): Prefs {
  const raw = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, unknown>;
  // Before the tray existed, the same choice was the "Dados 3D" checkbox.
  const tray = typeof raw.tray === "boolean" ? raw.tray : typeof raw.dice3d === "boolean" ? raw.dice3d : DEFAULT_PREFS.tray;
  return {
    tray,
    theme: typeof raw.theme === "string" ? raw.theme : DEFAULT_PREFS.theme,
    themeColor: typeof raw.themeColor === "string" ? raw.themeColor : DEFAULT_PREFS.themeColor,
    notify: typeof raw.notify === "boolean" ? raw.notify : DEFAULT_PREFS.notify,
  };
}

export function loadPrefs(): Prefs {
  try {
    return readPrefs(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be blocked inside an embedded page. Preferences then last until reload.
  }
}
