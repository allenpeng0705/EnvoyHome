// Shared helpers for real Obscura integration tests.

import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { resolveObscuraBinary } from "../dist/web-extract-obscura.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export const stagedObscuraBinary = join(
  repoRoot,
  "apps/desktop/src-tauri/resources/obscura",
  process.platform === "win32" ? "obscura.exe" : "obscura",
);

export async function resolveTestObscuraBinary(): Promise<string | null> {
  const resolved = await resolveObscuraBinary();
  if (resolved) return resolved;
  if (existsSync(stagedObscuraBinary)) {
    process.env.ENVOYHOME_OBSCURA_BUNDLE = stagedObscuraBinary;
    return stagedObscuraBinary;
  }
  return null;
}

export async function withObscuraEnv<T>(
  binary: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env.ENVOYHOME_OBSCURA;
  process.env.ENVOYHOME_OBSCURA = binary;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ENVOYHOME_OBSCURA;
    else process.env.ENVOYHOME_OBSCURA = prev;
  }
}

/** Obscura 0.2.x blocks loopback/RFC1918 by default — enable for local fixtures only. */
export async function withPrivateNetworkFetch<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OBSCURA_ALLOW_PRIVATE_NETWORK;
  process.env.OBSCURA_ALLOW_PRIVATE_NETWORK = "1";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.OBSCURA_ALLOW_PRIVATE_NETWORK;
    else process.env.OBSCURA_ALLOW_PRIVATE_NETWORK = prev;
  }
}

export async function listenHtmlFixture(html: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}/page`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function isSoftNetworkFailure(msg: string): boolean {
  return /timeout|captcha|block|tool_unavailable|ECONN|fetch failed|net::|obscura_serve|CDP/i.test(
    msg,
  );
}

export const BING_SERP_FIXTURE = `<!DOCTYPE html><html><body>
<li class="b_algo">
  <h2><a href="https://example.com/">Example Domain</a></h2>
  <div class="b_caption"><p>Example dig target for Obscura research.</p></div>
</li>
<li class="b_algo">
  <h2><a href="https://www.iana.org/domains/reserved">IANA Reserved Domains</a></h2>
  <div class="b_caption"><p>Second dig target for multi-page research.</p></div>
</li>
</body></html>`;
