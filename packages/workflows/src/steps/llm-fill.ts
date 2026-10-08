/** Narrow LLM fill step — no tool loop (Design §7). */
export type LlmFillStep = { type: "llm_fill"; prompt: string; [k: string]: unknown };
