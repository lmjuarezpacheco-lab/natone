/** Personal preferences. They stay in this browser and are never shared with the room. */
export interface Prefs {
  dice3d: boolean;
  theme: string;
  themeColor: string;
  notify: boolean;
}

const KEY = "tirada/prefs";

export const DEFAULT_PREFS: Prefs = {
  // Off until the player turns it on: the 3D engine is heavy for weak computers.
  dice3d: false,
  theme: "default",
  themeColor: "#7c5cff",
  notify: true,
};

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return {
      dice3d: typeof raw.dice3d === "boolean" ? raw.dice3d : DEFAULT_PREFS.dice3d,
      theme: typeof raw.theme === "string" ? raw.theme : DEFAULT_PREFS.theme,
      themeColor: typeof raw.themeColor === "string" ? raw.themeColor : DEFAULT_PREFS.themeColor,
      notify: typeof raw.notify === "boolean" ? raw.notify : DEFAULT_PREFS.notify,
    };
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
