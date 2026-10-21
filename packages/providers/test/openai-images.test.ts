import { test } from "node:test";
import assert from "node:assert/strict";
import { generateOpenAIImage } from "../dist/openai-images.js";

test("V-P2-MEDIA-2: generateOpenAIImage decodes b64_json", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const out = await generateOpenAIImage({
    baseUrl: "https://api.openai.com/v1",
    secret: "sk-test",
    prompt: "a cat",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  assert.equal(out.mimeType, "image/png");
  assert.equal(out.ext, "png");
  assert.deepEqual(out.bytes, png);
});

test("V-P2-MEDIA-2: generateOpenAIImage fails closed on empty data", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    () =>
      generateOpenAIImage({
        baseUrl: "https://api.openai.com/v1",
        prompt: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    /empty response/,
  );
});
