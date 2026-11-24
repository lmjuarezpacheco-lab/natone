import { readFileSync } from "node:fs";
import preact from "@preact/preset-vite";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Set BASE_PATH when hosting under a sub-path. The published site uses "/natone/".
const base = process.env.BASE_PATH ?? "/";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const DESCRIPTION = {
  es: "Iniciativa con reroll cada ronda, bandeja de dados 3D para toda la mesa y hojas de monstruo que tiran con un clic.",
  en: "Initiative with a re-roll every round, a 3D dice tray for the whole table and monster sheets that roll with one click.",
};

/**
 * Serves and emits the Owlbear Rodeo manifests with paths that follow `base`: `manifest.json` in Spanish
 * and `en/manifest.json` in English. The manifest a GM installs decides the language for the whole room.
 */
function owlbearManifest(): Plugin {
  // The English pages have their own addresses instead of a "?lang=en" query: Owlbear Rodeo adds its
  // own query to the page it opens, and a manifest address that already has one is not worth the risk.
  const manifest = (lang: "es" | "en") => {
    const pages = lang === "en" ? `${base}en/` : base;
    return JSON.stringify(
      {
        name: "NatOne",
        version: pkg.version,
        manifest_version: 1,
        description: DESCRIPTION[lang],
        author: "ANoobDM",
        homepage_url: "https://anoobdm.com/natone/",
        icon: `${base}icon.svg`,
        action: {
          title: "NatOne",
          // One colour: Owlbear Rodeo shows this one on its toolbar.
          icon: `${base}action.svg`,
          popover: `${pages}panel.html`,
          // Main column plus the dice tray handle. The panel widens itself while the tray is open.
          width: 404,
          height: 660,
        },
        background_url: `${pages}background.html`,
      },
      null,
      2,
    );
  };
  const MANIFESTS: Record<string, "es" | "en"> = { [`${base}manifest.json`]: "es", [`${base}en/manifest.json`]: "en" };
  // The panel is panel.html, so the folder root can hold another page where the extension is published.
  const rootToPanel: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== base) return next();
    res.statusCode = 302;
    res.setHeader("Location", `${base}panel.html`);
    res.end();
  };
  return {
    name: "owlbear-manifest",
    configureServer(server) {
      server.middlewares.use(rootToPanel);
      server.middlewares.use((req, res, next) => {
        const lang = MANIFESTS[req.url?.split("?")[0] ?? ""];
        if (!lang) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(manifest(lang));
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(rootToPanel);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: manifest("es") });
      this.emitFile({ type: "asset", fileName: "en/manifest.json", source: manifest("en") });
    },
  };
}

export default defineConfig({
  base,
  plugins: [preact(), owlbearManifest()],
  server: { cors: { origin: "https://www.owlbear.rodeo" } },
  preview: { cors: { origin: "https://www.owlbear.rodeo" } },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        panel: "panel.html",
        background: "background.html",
        "panel-en": "en/panel.html",
        "background-en": "en/background.html",
      },
    },
  },
  test: { environment: "node" },
});
