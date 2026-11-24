// The 3D engine is loaded on first use, so players with 3D dice turned off never download it.
import type DiceBox from "@3d-dice/dice-box";

/** How long settled dice stay in the tray. */
const CLEAR_AFTER_MS = 5000;

let box: Promise<DiceBox> | null = null;
let applied = "";
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let cancelRoll: ((reason: Error) => void) | null = null;
/** Goes up on every `clearBox`, so a roll that was still waiting for the engine knows it was cleared. */
let cleared = 0;

/** The dice were taken out of the tray before they settled, so that roll has no result. */
export class RollCleared extends Error {}

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
        // Heavier fall and more damping than the engine's defaults, so dice land with weight and settle in
        // one and a half to two seconds instead of creeping for three or four. A die still moving after
        // settleTimeout is stopped where it is.
        gravity: 2.5,
        linearDamping: 0.65,
        angularDamping: 0.85,
        settleTimeout: 2600,
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
  const startedAt = cleared;
  const instance = await withTimeout(getBox(container, theme, themeColor), 20000);
  if (cleared !== startedAt) throw new RollCleared("dice cleared");
  const results = await new Promise<Awaited<ReturnType<DiceBox["roll"]>>>((resolve, reject) => {
    cancelRoll = reject;
    withTimeout(
      instance.roll(
        dice.map((d) => `${d.qty}d${d.sides}`),
        { theme, themeColor },
      ),
      20000,
    ).then(resolve, reject);
  }).finally(() => (cancelRoll = null));
  if (autoClear) clearTimer = setTimeout(() => instance.clear(), CLEAR_AFTER_MS);
  return results.map((r) => ({ sides: Number(r.sides), value: r.value }));
}

const SAMPLE_DICE = [4, 6, 8, 10, 12, 20].map((sides) => ({ sides, qty: 1 }));

/** Shows one die of each shape with the chosen model and color. The result is not a roll. */
export async function preview3d(container: string, theme: string, themeColor: string): Promise<void> {
  await roll3d(container, SAMPLE_DICE, theme, themeColor, false);
}

/** Empties the tray. A roll that is still moving ends with `RollCleared`. */
export function clearBox(): void {
  clearTimeout(clearTimer);
  cleared += 1;
  cancelRoll?.(new RollCleared("dice cleared"));
  void box?.then((instance) => instance.clear()).catch(() => {});
}

/** Call after the tray becomes visible again or changes size. */
export function resizeBox(): void {
  void box?.then((instance) => instance.resizeWorld()).catch(() => {});
}
