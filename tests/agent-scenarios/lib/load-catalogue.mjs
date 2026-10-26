/**
 * Load + validate agent-scenario JSON cases under catalogue/{pack}/*.json
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenarioCase } from "../schema.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_ROOT = path.resolve(here, "..", "catalogue");

/**
 * @param {{ packs?: string[]; modes?: string[]; liveOnly?: boolean }} [opts]
 * @returns {import("../schema.mjs").ScenarioCase[]}
 */
export function loadCatalogue(opts = {}) {
  const packs = opts.packs?.length ? opts.packs : ["schedule", "general"];
  const modeFilter = opts.modes?.length ? new Set(opts.modes) : null;
  /** @type {import("../schema.mjs").ScenarioCase[]} */
  const out = [];
  const seen = new Set();

  for (const pack of packs) {
    const dir = path.join(CATALOGUE_ROOT, pack);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const full = path.join(dir, file);
      const raw = JSON.parse(readFileSync(full, "utf8"));
      const cases = Array.isArray(raw) ? raw : [raw];
      for (let i = 0; i < cases.length; i++) {
        const label = `${pack}/${file}[${i}]`;
        const c = validateScenarioCase(cases[i], label);
        if (c.pack !== pack) {
          throw new Error(`${label}: pack field ${c.pack} != directory ${pack}`);
        }
        if (seen.has(c.id)) throw new Error(`duplicate scenario id: ${c.id}`);
        seen.add(c.id);
        if (modeFilter && !modeFilter.has(c.mode)) continue;
        if (opts.liveOnly && !c.live) continue;
        out.push(c);
      }
    }
  }
  return out;
}
