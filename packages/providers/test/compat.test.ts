import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MemorySecretStore,
  createOpenAICompatProvider,
  createAnthropicCompatProvider,
  joinProviderUrl,
  __anthropicBodyForTests,
} from "../dist/index.js";

test("joinProviderUrl: /v1 base + chat completions", () => {
  assert.equal(
    joinProviderUrl("https://api.openai.com/v1", "/v1/chat/completions"),
    "https://api.openai.com/v1/chat/completions",
  );
  assert.equal(
    joinProviderUrl("http://127.0.0.1:11434/v1/", "/v1/chat/completions"),
    "http://127.0.0.1:11434/v1/chat/completions",
  );
  assert.equal(
    joinProviderUrl("https://api.anthropic.com", "/v1/messages"),
    "https://api.anthropic.com/v1/messages",
  );
});

test("OpenAI-compat complete uses chat/completions + Bearer", async () => {
  const secrets = new MemorySecretStore();
  secrets.set("oai", "sk-test");
  let seenUrl = "";
  let seenAuth = "";
  const p = createOpenAICompatProvider({
    id: "oai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    secrets,
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? "");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "hi" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
        { status: 200 },
      );
    },
  });
  const result = await p.complete({ messages: [{ role: "user", content: "ping" }] });
  assert.equal(result.text, "hi");
  assert.match(seenUrl, /\/v1\/chat\/completions$/);
  assert.equal(seenAuth, "Bearer sk-test");
  assert.equal(p.describe().hasSecret, true);
});

test("Anthropic-compat complete uses Messages + x-api-key", async () => {
  const secrets = new MemorySecretStore();
  secrets.set("ant", "sk-ant-test");
  let seenUrl = "";
  let seenKey = "";
  let seenBody: Record<string, unknown> = {};
  const p = createAnthropicCompatProvider({
    id: "ant",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
    secrets,
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      const headers = init?.headers as Record<string, string>;
      seenKey = headers["x-api-key"] ?? "";
      seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "hello" }],
          usage: { input_tokens: 3, output_tokens: 4 },
        }),
        { status: 200 },
      );
    },
  });
  const result = await p.complete({
    messages: [
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ],
  });
  assert.equal(result.text, "hello");
  assert.match(seenUrl, /\/v1\/messages$/);
  assert.equal(seenKey, "sk-ant-test");
  assert.equal(seenBody.system, "be brief");
  assert.equal(result.usage?.promptTokens, 3);
});

test("Anthropic body extracts system and normalizes roles", () => {
  const body = __anthropicBodyForTests([
    { role: "system", content: "sys" },
    { role: "user", content: "a" },
    { role: "user", content: "b" },
    { role: "assistant", content: "c" },
  ]);
  assert.equal(body.system, "sys");
  const messages = body.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0]?.role, "user");
  assert.match(messages[0]?.content ?? "", /a/);
  assert.match(messages[0]?.content ?? "", /b/);
});
