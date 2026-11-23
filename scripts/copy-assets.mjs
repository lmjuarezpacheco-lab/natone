// Copies the dice-box physics engine and the selectable dice themes into public/.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/assets/dice-box");
const boxPackage = join(root, "node_modules/@3d-dice/dice-box");
const themesPackage = join(root, "node_modules/@3d-dice/dice-themes");

// Keep in sync with src/dice/themes.ts. "default" ships with dice-box itself.
const THEMES = [
  "smooth",
  "gemstone",
  "rock",
  "rust",
  "gemstoneMarble",
  "blueGreenMetal",
  "diceOfRolling",
  "wooden",
];

const version = (dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const stamp = JSON.stringify({ box: version(boxPackage), themes: version(themesPackage), list: THEMES });
const stampFile = join(out, ".stamp");

// Deleting and recreating these files makes a running dev server stop serving them,
// so the copy runs only when the packages or the theme list change.
if (existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp && existsSync(join(out, "ammo/ammo.wasm.wasm"))) {
  console.log("dice assets up to date");
} else {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "themes"), { recursive: true });
  cpSync(join(boxPackage, "dist/assets/ammo"), join(out, "ammo"), { recursive: true });
  cpSync(join(boxPackage, "dist/assets/themes/default"), join(out, "themes/default"), { recursive: true });
  for (const theme of THEMES) {
    cpSync(join(themesPackage, "themes", theme), join(out, "themes", theme), {
      recursive: true,
      filter: (src) => !src.endsWith("package.json"),
    });
  }
  writeFileSync(stampFile, stamp);
  console.log(`dice assets copied: default + ${THEMES.length} themes`);
}
