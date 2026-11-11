/** Plan / Design Appendix C.5 — Obscura parity gate checklist. */
export const OBSCURA_PARITY_GATE = {
  extractStageA: {
    shipped: true,
    defaultBackend: "auto",
    obscuraOptIn: true,
  },
  serpStageB: {
    shipped: true,
    defaultEngine: "auto",
    gate: "Hard Obscura-only (no Chromium fallback) needs organic hit rate ≥ Chromium",
  },
  managedStageC: {
    shipped: true,
    defaultEngine: "auto",
    gate: "Hard Obscura-only needs browser corpus ≥ Chromium; personal/remote stay real CDP",
  },
  bundleStageD: {
    shipped: true,
    pin: "0.2.6",
    resolveOrder: ["ENVOYHOME_OBSCURA", "ENVOYHOME_OBSCURA_BUNDLE", "managed", "PATH"],
    autoEnv: "ENVOYHOME_OBSCURA_AUTO",
  },
  autoStageE: {
    shipped: true,
    prefer: "obscura",
    fallbackExtract: "fetch",
    fallbackSerpManaged: "chromium",
  },
  never: [
    "CAPTCHA solve via stealth",
    "silent Chromium download",
    "stealth Obscura as product default",
    "map personal/remote elevated profiles to Obscura",
  ] as const,
};
