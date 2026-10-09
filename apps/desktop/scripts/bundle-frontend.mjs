// Bundle Settings shell into ui-dist/ for Tauri frontendDist.
// Keep apps/desktop/dist/ for tsc output (resolve-config tests import it).
import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiDist = join(root, "ui-dist");

await rm(uiDist, { recursive: true, force: true });
await mkdir(uiDist, { recursive: true });
await cp(join(root, "index.html"), join(uiDist, "index.html"));
await cp(join(root, "public", "styles.css"), join(uiDist, "styles.css"));
await cp(join(root, "public", "logo.png"), join(uiDist, "logo.png"));
await cp(join(root, "public", "favicon.png"), join(uiDist, "favicon.png"));

await esbuild.build({
  entryPoints: [join(root, "public", "app.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  outfile: join(uiDist, "app.js"),
  logLevel: "info",
});

console.log("frontend:bundle → apps/desktop/ui-dist");
