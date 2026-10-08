/** Narrow LLM summarize step — no tool loop (Design §7). */
export type LlmSummarizeStep = { type: "llm_summarize"; prompt: string; [k: string]: unknown };
