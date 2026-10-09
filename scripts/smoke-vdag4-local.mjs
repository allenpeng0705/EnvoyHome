#!/usr/bin/env node
/**
 * Optional V-DAG-4: run llm_summarize against a real local OpenAI-compat endpoint.
 * Skip (exit 0) when ENVOYHOME_LOCAL_LLM_URL is unset — CI stays offline.
 *
 *   ENVOYHOME_LOCAL_LLM_URL=http://127.0.0.1:8080/v1 \
 *   ENVOYHOME_LOCAL_LLM_MODEL=qwen2.5 \
 *   node scripts/smoke-vdag4-local.mjs
 */

const base = process.env.ENVOYHOME_LOCAL_LLM_URL;
if (!base) {
  console.log("smoke-vdag4-local: SKIP (set ENVOYHOME_LOCAL_LLM_URL to exercise)");
  process.exit(0);
}

const model = process.env.ENVOYHOME_LOCAL_LLM_MODEL || "default";
const url = `${base.replace(/\/$/, "")}/chat/completions`;

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [
      { role: "system", content: "Summarize in one short sentence." },
      { role: "user", content: "The porch light is on and the door is locked." },
    ],
    max_tokens: 64,
  }),
});

if (!res.ok) {
  console.error(`smoke-vdag4-local: FAIL HTTP ${res.status}`);
  process.exit(1);
}

const json = await res.json();
const text = json?.choices?.[0]?.message?.content;
if (!text || typeof text !== "string") {
  console.error("smoke-vdag4-local: FAIL empty completion");
  process.exit(1);
}

console.log(`smoke-vdag4-local: OK (${text.slice(0, 80).replace(/\n/g, " ")})`);
