// Copies the dice-box physics engine and the selectable dice themes into public/.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/assets/dice-box");
const boxPackage = join(root, "node_modules/@3d-dice/dice-box");
const themesPackage = join(root, "node_modules/@3d-dice/dice-themes");
// Number textures with more contrast, built by scripts/make-contrast-textures.sh. They replace the package files.
const overrides = join(root, "dice-overrides");

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
const overrideFiles = readdirSync(overrides, { recursive: true })
  .map((file) => String(file))
  .filter((file) => statSync(join(overrides, file)).isFile())
  .sort()
  .map((file) => `${file}:${statSync(join(overrides, file)).size}`);
const stamp = JSON.stringify({
  box: version(boxPackage),
  themes: version(themesPackage),
  list: THEMES,
  overrides: overrideFiles,
});
const stampFile = join(out, ".stamp");

// The copy runs only when its inputs change, and it overwrites in place. Deleting and recreating
// these files makes a running dev server stop serving them.
if (existsSync(stampFile) && readFileSync(stampFile, "utf8") === stamp && existsSync(join(out, "ammo/ammo.wasm.wasm"))) {
  console.log("dice assets up to date");
} else {
  mkdirSync(join(out, "themes"), { recursive: true });
  for (const stale of readdirSync(join(out, "themes"))) {
    if (stale !== "default" && !THEMES.includes(stale)) rmSync(join(out, "themes", stale), { recursive: true, force: true });
  }
  cpSync(join(boxPackage, "dist/assets/ammo"), join(out, "ammo"), { recursive: true });
  cpSync(join(boxPackage, "dist/assets/themes/default"), join(out, "themes/default"), { recursive: true });
  for (const theme of THEMES) {
    cpSync(join(themesPackage, "themes", theme), join(out, "themes", theme), {
      recursive: true,
      filter: (src) => !src.endsWith("package.json"),
    });
  }
  cpSync(overrides, out, { recursive: true });
  writeFileSync(stampFile, stamp);
  console.log(`dice assets copied: default + ${THEMES.length} themes, ${overrideFiles.length} contrast textures`);
}
