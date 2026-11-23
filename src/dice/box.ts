// The 3D engine is loaded on first use, so players with 3D dice turned off never download it.
import type DiceBox from "@3d-dice/dice-box";

/** How long settled dice stay in the tray. */
const CLEAR_AFTER_MS = 5000;

let box: Promise<DiceBox> | null = null;
let applied = "";
let clearTimer: ReturnType<typeof setTimeout> | undefined;

async function getBox(container: string, theme: string, themeColor: string): Promise<DiceBox> {
  if (!box) {
    box = (async () => {
      const { default: DiceBoxClass } = await import("@3d-dice/dice-box");
      const instance = new DiceBoxClass({
        container,
        assetPath: `${import.meta.env.BASE_URL}assets/dice-box/`,
        theme,
        themeColor,
        // Sized for the tray's double-resolution canvas.
        scale: 12,
        throwForce: 4,
        spinForce: 5,
        settleTimeout: 4000,
      });
      await instance.init();
      applied = `${theme}|${themeColor}`;
      return instance;
    })();
    // A failed start must not block later attempts.
    box.catch(() => (box = null));
  }
  const instance = await box;
  if (applied !== `${theme}|${themeColor}`) {
    await instance.updateConfig({ theme, themeColor });
    applied = `${theme}|${themeColor}`;
  }
  return instance;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("3D dice timed out")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

/** Throws physical dice in `container` and resolves with the faces that landed up. */
export async function roll3d(
  container: string,
  dice: readonly { sides: number; qty: number }[],
  theme: string,
  themeColor: string,
  /** False leaves the dice in the tray until the next roll or `clearBox`. */
  autoClear = true,
): Promise<{ sides: number; value: number }[]> {
  clearTimeout(clearTimer);
  const instance = await withTimeout(getBox(container, theme, themeColor), 20000);
  const results = await withTimeout(
    instance.roll(
      dice.map((d) => `${d.qty}d${d.sides}`),
      { theme, themeColor },
    ),
    20000,
  );
  if (autoClear) clearTimer = setTimeout(() => instance.clear(), CLEAR_AFTER_MS);
  return results.map((r) => ({ sides: Number(r.sides), value: r.value }));
}

const SAMPLE_DICE = [4, 6, 8, 10, 12, 20].map((sides) => ({ sides, qty: 1 }));

/** Shows one die of each shape with the chosen model and color. The result is not a roll. */
export async function preview3d(container: string, theme: string, themeColor: string): Promise<void> {
  await roll3d(container, SAMPLE_DICE, theme, themeColor, false);
}

export function clearBox(): void {
  clearTimeout(clearTimer);
  void box?.then((instance) => instance.clear()).catch(() => {});
}

/** Call after the tray becomes visible again or changes size. */
export function resizeBox(): void {
  void box?.then((instance) => instance.resizeWorld()).catch(() => {});
}
