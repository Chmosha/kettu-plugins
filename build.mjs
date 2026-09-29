import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const root = process.cwd();
const pluginsDir = path.join(root, "plugins");
const distDir = path.join(root, "dist");

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const pluginName = entry.name;
  const pluginDir = path.join(pluginsDir, pluginName);
  const manifestPath = path.join(pluginDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const entryFile = path.join(pluginDir, manifest.main || "src/index.ts");

  const bundle = await rollup({
    input: entryFile,
    external: (id) => id === "@vendetta" || id.startsWith("@vendetta/"),
    plugins: [esbuild({ target: "es2020", jsx: "transform" })]
  });

  const outputDir = path.join(distDir, pluginName);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "index.js");

  await bundle.write({
    file: outputPath,
    format: "iife",
    name: pluginName.replace(/[^a-zA-Z0-9_$]/g, "_"),
    sourcemap: false,
    globals: (id) => id === "@vendetta" ? "vendetta" : id.replace(/^@vendetta\//, "vendetta.")
  });
  await bundle.close();

  const built = await fs.readFile(outputPath);
  const hash = crypto.createHash("sha256").update(built).digest("hex");
  const outputManifest = { ...manifest, main: "index.js", hash };

  await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(outputManifest, null, 2) + "\n");
}

await fs.writeFile(path.join(distDir, ".nojekyll"), "");
await fs.writeFile(
  path.join(distDir, "index.html"),
  "<!doctype html><html><head><meta charset=\"utf-8\"><title>Kettu Plugins</title></head><body><h1>Kettu Plugins</h1></body></html>\n"
);
console.log("Build complete.");
