import { readFileSync } from "node:fs";
import preact from "@preact/preset-vite";
import type { Plugin } from "vite";
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
        description: "Iniciativa con reroll por ronda y dados 3D.",
        icon: `${base}icon.svg`,
        action: {
          title: "NatOne",
          icon: `${base}icon.svg`,
          popover: `${base}index.html`,
          width: 380,
          height: 660,
        },
        background_url: `${base}background.html`,
      },
      null,
      2,
    );
  return {
    name: "owlbear-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${base}manifest.json`) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(manifest());
      });
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
    rollupOptions: { input: { index: "index.html", background: "background.html" } },
  },
  test: { environment: "node" },
});
