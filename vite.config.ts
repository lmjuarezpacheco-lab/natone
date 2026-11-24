import { readFileSync } from "node:fs";
import preact from "@preact/preset-vite";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Set BASE_PATH when hosting under a sub-path. The published site uses "/natone/".
const base = process.env.BASE_PATH ?? "/";
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** Serves and emits the Owlbear Rodeo manifest with paths that follow `base`. */
function owlbearManifest(): Plugin {
  const manifest = () =>
    JSON.stringify(
      {
        name: "NatOne",
        version: pkg.version,
        manifest_version: 1,
        description:
          "Iniciativa con reroll cada ronda, bandeja de dados 3D para toda la mesa y hojas de monstruo que tiran con un clic.",
        author: "ANoobDM",
        homepage_url: "https://anoobdm.com/natone/",
        icon: `${base}icon.svg`,
        action: {
          title: "NatOne",
          // One colour: Owlbear Rodeo shows this one on its toolbar.
          icon: `${base}action.svg`,
          popover: `${base}panel.html`,
          // Main column plus the dice tray handle. The panel widens itself while the tray is open.
          width: 404,
          height: 660,
        },
        background_url: `${base}background.html`,
      },
      null,
      2,
    );
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
        if (req.url?.split("?")[0] !== `${base}manifest.json`) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(manifest());
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(rootToPanel);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.json", source: manifest() });
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
    rollupOptions: { input: { panel: "panel.html", background: "background.html" } },
  },
  test: { environment: "node" },
});
