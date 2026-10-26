// V-AGENT-SCENARIO-1 — deterministic agent scenario catalogue (Schedule + General).
// Catalogue: tests/agent-scenarios/  Live: scripts/agent-eval-live.mjs (V-AGENT-SCENARIO-2).

import { test, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { exec as execCb } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { flushLoop, __resetActiveXForTests } from "@envoyhome/test-utils";
import {
  applyEditFile,
  applyUnifiedPatch,
  parseAssistantToolCalls,
} from "@envoyhome/harness-host";
import {
  HEARTBEAT_OK,
  isHeartbeatSilentOk,
} from "../dist/schedule/heartbeat.js";

const execAsync = promisify(execCb);
import {
  startDaemon,
  type RunningDaemon,
  safeJoin,
  PathJailError,
  parentToolNamesForSurface,
  HomeModelAdapter,
  createHomeMeshSubmitter,
  homeSubagentInput,
  textFromSubagentResult,
} from "../dist/index.js";
import { resolveScheduleFromText } from "../dist/schedule/resolve-nl.js";
import { zonedParts } from "../dist/schedule/cron-next.js";
import { homePaths } from "../dist/home-paths.js";
import { runExtendedWorkflowTool, listWorkflowTools } from "../dist/workflow-tools.js";
import { searchSandboxFiles } from "../dist/sandbox-fs-browse.js";
import { exportDocument, isExportFormat } from "../dist/document-export.js";
import {
  probeBrowserRuntime,
  __resetBrowserSerpGatesForTests,
} from "../dist/web-search-browser.js";
import { assertBrowserNavigateUrl } from "../dist/browser-control.js";
import { SkillService } from "../dist/skills.js";
import { ChannelService } from "../dist/channels/service.js";
import { DaemonLogger } from "../dist/logger.js";
import { BindingStore } from "../dist/bindings.js";
import { DeviceCredentialStore } from "../dist/auth.js";
import { WebSearchService } from "../dist/web-search.js";
import { matchesAny } from "../../../tests/agent-scenarios/lib/expect.mjs";
import { substituteVars } from "../../../tests/agent-scenarios/lib/fence.mjs";

const BING_SERP_FIXTURE = `<!DOCTYPE html><html><body>
<li class="b_algo">
  <h2><a href="https://fixture.example/envoyhome">EnvoyHome fixture hit</a></h2>
  <div class="b_caption"><p>Local SERP fixture for browser fallback.</p></div>
</li>
</body></html>`;

const GOOGLE_SERP_FIXTURE = `<!DOCTYPE html><html><body>
<div class="g">
  <a href="https://fixture.example/envoymesh"><h3>EnvoyMesh fixture hit</h3></a>
  <div data-sncf="1">Google-shaped fixture.</div>
</div>
</body></html>`;

type WebSearchRunExtras = {
  origin?: "attended" | "unattended";
  authorizeBrowserFallback?: (detail: { engines: string[] }) => Promise<boolean>;
  browserFetchHtml?: (url: string, timeoutMs: number) => Promise<string>;
};

type PreparedSandbox = {
  filesRoot: string;
  skillId?: string;
  skipReason?: string;
  webSearchExtras?: WebSearchRunExtras;
  cleanupExtra?: () => Promise<void>;
  autoAnswerAskUser?: Record<string, unknown>;
};

async function listenHtmlFixture(html: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}/serp`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function chromiumFetchLocal(url: string, timeoutMs: number): Promise<string> {
  const pw = await import("playwright");
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await new Promise((r) => setTimeout(r, 150));
    return await page.content();
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Minimal page factory for browser tool scenarios (mirrors browser-control.test). */
function mockBrowserPage(url = "https://example.com/") {
  let current = url;
  const attrs = new Map<string, string>();
  return {
    goto: async (u: string) => {
      current = u;
    },
    url: () => current,
    title: async () => "Example",
    content: async () => "<html></html>",
    innerText: async () => "Hello body text",
    locator: (sel: string) => ({
      count: async () => (sel.includes("data-eh-ref") ? 1 : 0),
      nth: () => ({
        click: async () => undefined,
        fill: async () => undefined,
        selectOption: async () => undefined,
        dragTo: async () => undefined,
        evaluate: async <T>(fn: (el: Element) => T) => fn({} as Element),
        screenshot: async () => Buffer.from([]),
      }),
    }),
    evaluate: async <T>(fn: () => T) => {
      const fakeDoc = {
        querySelectorAll: () => [
          {
            setAttribute: (k: string, v: string) => attrs.set(k, v),
            innerText: "Go",
            tagName: "BUTTON",
            getAttribute: () => null,
          },
        ],
      };
      const orig = (globalThis as { document?: unknown }).document;
      (globalThis as { document: unknown }).document = fakeDoc;
      try {
        return fn();
      } finally {
        if (orig === undefined) delete (globalThis as { document?: unknown }).document;
        else (globalThis as { document: unknown }).document = orig;
      }
    },
    screenshot: async () => Buffer.from([1, 2, 3]),
    close: async () => undefined,
  };
}

async function applyBrowserSetup(
  daemon: RunningDaemon,
  setup: Record<string, unknown>,
): Promise<{ skipReason?: string }> {
  const bc = daemon.browserControl;
  await bc.load();
  if (setup.browserEnabled === false) {
    await bc.setConfig({ enabled: false });
    return {};
  }
  if (setup.browserMock) {
    __resetBrowserSerpGatesForTests();
    await bc.setConfig({ enabled: true });
    bc.pageFactory = async () => mockBrowserPage() as never;
    return {};
  }
  if (setup.browserChromium) {
    const probe = await probeBrowserRuntime();
    if (probe.status !== "ready") {
      if (setup.skipIfChromiumMissing) {
        return { skipReason: `Chromium missing — ${probe.installHint}` };
      }
      throw new Error(`Chromium required: ${probe.installHint}`);
    }
    __resetBrowserSerpGatesForTests();
    await bc.setConfig({ enabled: true });
    bc.pageFactory = null;
    return {};
  }
  return {};
}

async function seedMemoryFacts(
  daemon: RunningDaemon,
  setup: Record<string, unknown>,
): Promise<void> {
  const rows = setup.seedMemory as
    | Array<{ text: string; target?: "l1" | "l2" | "l3" | "auto"; key?: string }>
    | undefined;
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    await daemon.memory.remember("alice", {
      text: row.text,
      target: row.target ?? "l2",
      ...(row.key ? { key: row.key } : {}),
      trust: "owner",
    });
  }
  const sess = setup.seedSessionSearch as { text?: string; sessionId?: string } | undefined;
  if (sess?.text) {
    await daemon.memory.indexSession("alice", sess.sessionId ?? "agent-scen-sess", sess.text);
  }
}

const TZ = "Asia/Shanghai";
/** Fixed reference: 2026-10-09 14:00 Asia/Shanghai — Friday (matches schedule-nl). */
const REF = new Date("2026-10-09T06:00:00.000Z");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const loadCatalogueUrl = pathToFileURL(
  join(repoRoot, "tests/agent-scenarios/lib/load-catalogue.mjs"),
).href;

const daemons: RunningDaemon[] = [];

after(async () => {
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
});

async function boot() {
  const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-agent-scen-"));
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);
  return {
    daemon,
    stateDir,
    cleanup: async () => {
      await daemon.stop().catch(() => undefined);
      const idx = daemons.indexOf(daemon);
      if (idx >= 0) daemons.splice(idx, 1);
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

async function installSampleSkill(svc: SkillService, stateDir: string): Promise<string> {
  const src = join(stateDir, `incoming-brief-${Date.now()}`);
  await mkdir(src, { recursive: true });
  await writeFile(
    join(src, "SKILL.md"),
    `---
name: Morning brief
description: Short weather and coffee tip
---
# Morning brief
Prefer a short weather summary and a coffee tip.
`,
  );
  const installed = await svc.installSkill({ source: "path", ref: src });
  const verify = await svc.verifySkill(installed.id);
  assert.equal(verify.ok, true, verify.findings.join("; "));
  return installed.id;
}

async function ensureAlice(daemon: RunningDaemon): Promise<void> {
  try {
    await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  } catch {
    // already exists
  }
}

/** One-shot WS RPC against a running daemon (demo HA setup). */
async function daemonRpc(
  port: number,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { WebSocket } = await import("ws");
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`timeout ${method}`));
    }, 20_000);
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (message["id"] !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.on("error", reject);
  });
}

type SeqStep = {
  name: string;
  args?: Record<string, unknown>;
  /** Map this step's arg key → field name on the previous step's JSON result (e.g. `{ path: "uri" }`). */
  argsFromPrev?: Record<string, string>;
  refuse?: boolean;
  useInstalledSkillId?: boolean;
  usePriorProposalId?: boolean;
};

async function applyWebSearchSetup(
  daemon: RunningDaemon,
  setup: Record<string, unknown>,
): Promise<{
  skipReason?: string;
  webSearchExtras?: WebSearchRunExtras;
  cleanupExtra?: () => Promise<void>;
}> {
  const ws = daemon.webSearch;
  await ws.load();
  if (setup.webSearchEnabled === false) {
    await ws.setConfig({ enabled: false });
    return {};
  }
  const mock = setup.mockWebSearch as
    | {
        provider?: string;
        results?: Array<{ title?: string; url?: string; description?: string }>;
      }
    | undefined;
  if (mock) {
    const provider = mock.provider === "tavily" ? "tavily" : "brave";
    await ws.setConfig({
      enabled: true,
      provider,
      apiKey: provider === "brave" ? "test-brave-key" : "tvly-test-key",
    });
    const hits = Array.isArray(mock.results) ? mock.results : [];
    ws.fetchImpl = (async () => {
      if (provider === "tavily") {
        return new Response(
          JSON.stringify({
            results: hits.map((h) => ({
              title: h.title ?? "",
              url: h.url ?? "",
              content: h.description ?? "",
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          web: {
            results: hits.map((h) => ({
              title: h.title ?? "",
              url: h.url ?? "",
              description: h.description ?? "",
            })),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
  }

  const fb = setup.webSearchBrowserFallback as
    | {
        approve?: boolean;
        primaryEmpty?: boolean;
        fixture?: "bing" | "google";
        useChromium?: boolean;
        skipIfChromiumMissing?: boolean;
        origin?: "attended" | "unattended";
        unattendedBrowser?: boolean;
      }
    | undefined;
  if (!fb) return {};

  __resetBrowserSerpGatesForTests();
  if (fb.useChromium) {
    const probe = await probeBrowserRuntime();
    if (probe.status !== "ready") {
      if (fb.skipIfChromiumMissing) {
        return { skipReason: `Chromium missing — ${probe.installHint}` };
      }
      throw new Error(`Chromium required: ${probe.installHint}`);
    }
  }

  await ws.setConfig({
    enabled: true,
    fallback: "browser",
    unattendedBrowser: fb.unattendedBrowser === true,
    // Keep default duckduckgo primary; empty HTML forces fallback.
  });
  if (fb.primaryEmpty !== false) {
    ws.fetchImpl = (async () =>
      new Response("<html><body>no hits</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;
  }

  const html = fb.fixture === "google" ? GOOGLE_SERP_FIXTURE : BING_SERP_FIXTURE;
  const fixture = await listenHtmlFixture(html);
  const useChromium = fb.useChromium === true;
  return {
    webSearchExtras: {
      origin: fb.origin === "unattended" ? "unattended" : "attended",
      authorizeBrowserFallback: async () => fb.approve !== false,
      browserFetchHtml: async (_serpUrl, timeoutMs) => {
        if (useChromium) return chromiumFetchLocal(fixture.url, timeoutMs);
        return html;
      },
    },
    cleanupExtra: async () => {
      await fixture.close();
      __resetBrowserSerpGatesForTests();
    },
  };
}

async function runSandboxOrWorkflowTool(input: {
  daemon: RunningDaemon;
  stateDir: string;
  filesRoot: string;
  name: string;
  args: Record<string, unknown>;
  webSearchExtras?: WebSearchRunExtras;
}): Promise<string> {
  const { daemon, filesRoot, name, args } = input;
  if (name === "write_file") {
    const rel = String(args.path ?? "");
    const dest = safeJoin(filesRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, String(args.content ?? ""), "utf8");
    return JSON.stringify({ ok: true, path: rel });
  }
  if (name === "read_file") {
    const rel = String(args.path ?? "");
    return await readFile(safeJoin(filesRoot, rel), "utf8");
  }
  if (name === "list_dir") {
    const rel = String(args.path ?? ".");
    const entries = await readdir(safeJoin(filesRoot, rel));
    return JSON.stringify({ entries, path: rel });
  }
  if (name === "search_files") {
    const found = await searchSandboxFiles(
      {
        accountFilesRoot: filesRoot,
        shareRoot: homePaths(input.stateDir).shareDir,
      },
      {
        pattern: String(args.pattern ?? "*"),
        path: typeof args.path === "string" ? args.path : "documents",
        maxDepth: typeof args.maxDepth === "number" ? args.maxDepth : 4,
      },
    );
    return JSON.stringify(found);
  }
  if (name === "edit_file") {
    const rel = String(args.path ?? "");
    const abs = safeJoin(filesRoot, rel);
    const existing = await readFile(abs, "utf8");
    const result = applyEditFile(existing, {
      path: rel,
      ...(typeof args.oldString === "string" ? { oldString: args.oldString } : {}),
      ...(typeof args.newString === "string" ? { newString: args.newString } : {}),
      ...(typeof args.startLine === "number" ? { startLine: args.startLine } : {}),
      ...(typeof args.endLine === "number" ? { endLine: args.endLine } : {}),
    });
    if (!result.ok) throw new Error(result.reason);
    await writeFile(abs, result.content, "utf8");
    return JSON.stringify({ ok: true, path: rel, detail: result.detail });
  }
  if (name === "apply_patch") {
    const result = applyUnifiedPatch((relPath) => {
      try {
        return readFileSync(safeJoin(filesRoot, relPath), "utf8");
      } catch {
        return undefined;
      }
    }, {
      ...(typeof args.path === "string" ? { path: args.path } : {}),
      patch: String(args.patch ?? ""),
    });
    if (!result.ok) throw new Error(result.reason);
    const abs = safeJoin(filesRoot, result.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, result.content, "utf8");
    return JSON.stringify({ ok: true, path: result.path, detail: result.detail });
  }
  if (name === "exec") {
    const cmd = String(args.cmd ?? "").trim();
    if (!cmd) throw new Error("envoyhome.bad_params: cmd required");
    // Scenario safety — refuse obvious host-destroying patterns (product still uses ApprovalSink).
    if (/\brm\s+(-[^\s]*f[^\s]*\s+)?\/\b|fork\s*bomb|\/etc\/(?:passwd|shadow)\b/i.test(cmd)) {
      throw new Error("envoyhome.exec_refused: unsafe command pattern");
    }
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: filesRoot,
        timeout: 15_000,
        maxBuffer: 1_000_000,
        env: { ...process.env, PWD: filesRoot },
      } as import("node:child_process").ExecOptions);
      return JSON.stringify({
        ok: true,
        stdout: String(stdout ?? "").slice(0, 32_000),
        stderr: String(stderr ?? "").slice(0, 8_000),
      });
    } catch (err) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        message?: string;
        code?: number | string;
      };
      return JSON.stringify({
        ok: false,
        code: e.code ?? 1,
        stdout: String(e.stdout ?? "").slice(0, 32_000),
        stderr: String(e.stderr ?? e.message ?? "").slice(0, 8_000),
      });
    }
  }
  if (name === "memory_remember") {
    const out = await daemon.memory.remember("alice", {
      text: String(args.text ?? ""),
      target: (args.target as "l1" | "l2" | "l3" | "auto" | undefined) ?? "l2",
      ...(typeof args.key === "string" ? { key: args.key } : {}),
      trust: "owner",
    });
    return JSON.stringify(out);
  }
  if (name === "memory_recall") {
    const out = await daemon.memory.recall("alice", {
      query: String(args.query ?? ""),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
    });
    return JSON.stringify(out);
  }
  if (name === "session_search") {
    const out = await daemon.memory.sessionSearch("alice", {
      query: String(args.query ?? ""),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
    });
    return JSON.stringify(out);
  }
  if (name === "web_search") {
    const extras = input.webSearchExtras ?? {};
    return daemon.webSearch.runSearch(args, {
      origin: extras.origin ?? "attended",
      ...(extras.authorizeBrowserFallback
        ? { authorizeBrowserFallback: extras.authorizeBrowserFallback }
        : {}),
      ...(extras.browserFetchHtml ? { browserFetchHtml: extras.browserFetchHtml } : {}),
    });
  }
  if (name === "browser") {
    // Pre-check SSRF the same way the service does for clearer refuseMatching.
    if (args.action === "navigate" && typeof args.url === "string") {
      try {
        assertBrowserNavigateUrl(args.url);
      } catch (err) {
        throw err;
      }
    }
  }
  return runExtendedWorkflowTool({
    tool: name,
    args,
    accountId: "alice",
    skills: daemon.skills,
    channels: daemon.channels,
    paths: homePaths(input.stateDir),
    schedules: daemon.schedules,
    standingOrders: daemon.standingOrders,
    workflows: daemon.workflows,
    memory: daemon.memory,
    knowledge: daemon.knowledge,
    webSearch: daemon.webSearch,
    browserControl: daemon.browserControl,
    actuations: daemon.actuations,
    ...(input.webSearchExtras?.authorizeBrowserFallback
      ? { authorizeBrowserFallback: input.webSearchExtras.authorizeBrowserFallback }
      : {}),
  });
}

async function prepareSandbox(
  daemon: RunningDaemon,
  stateDir: string,
  setup: Record<string, unknown>,
): Promise<PreparedSandbox> {
  await ensureAlice(daemon);
  const paths = homePaths(stateDir);
  const filesRoot = paths.accountFiles("alice");
  await mkdir(join(filesRoot, "documents"), { recursive: true });
  await mkdir(join(filesRoot, "output"), { recursive: true });
  await mkdir(join(filesRoot, "knowledge"), { recursive: true });
  await mkdir(join(filesRoot, "uploads"), { recursive: true });
  let skillId: string | undefined;
  if (setup.installSampleSkill) {
    skillId = await installSampleSkill(daemon.skills, stateDir);
  }
  if (setup.seedFiles && typeof setup.seedFiles === "object") {
    for (const [rel, body] of Object.entries(setup.seedFiles as Record<string, string>)) {
      const abs = safeJoin(filesRoot, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, body, "utf8");
    }
  }
  if (Array.isArray(setup.seedExports)) {
    for (const raw of setup.seedExports as Array<Record<string, unknown>>) {
      const format = raw.format;
      if (!isExportFormat(format)) {
        throw new Error(`seedExports: bad format ${String(format)}`);
      }
      const rel = String(raw.path ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (!rel || rel.includes("..")) throw new Error(`seedExports: bad path ${rel}`);
      const markdown = String(raw.markdown ?? "");
      const title =
        typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined;
      const buf = await exportDocument(format, markdown, title ? { title } : undefined);
      const abs = safeJoin(filesRoot, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, buf);
    }
  }
  const web = await applyWebSearchSetup(daemon, setup);
  const browser = await applyBrowserSetup(daemon, setup);
  await seedMemoryFacts(daemon, setup);
  const seedKnowYou = setup.seedKnowYou as
    | Array<{ key?: string; text: string }>
    | undefined;
  if (Array.isArray(seedKnowYou) && daemon.knowledge) {
    for (const row of seedKnowYou) {
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) continue;
      const key =
        typeof row.key === "string" && row.key.trim()
          ? row.key.trim()
          : `eval.${text.slice(0, 24).replace(/\W+/g, "_").toLowerCase()}`;
      await daemon.knowledge.updateKnowYou("alice", {
        action: "supersede",
        key,
        text,
      });
    }
  }
  if (setup.knowledgePolicy && typeof setup.knowledgePolicy === "object" && daemon.knowledge) {
    const pol = setup.knowledgePolicy as Record<string, unknown>;
    await daemon.knowledge.setPolicy("alice", {
      ...(typeof pol.knowledgeInject === "string"
        ? { knowledgeInject: pol.knowledgeInject as "off" | "tool" | "auto" }
        : {}),
      ...(typeof pol.episodicInject === "string"
        ? { episodicInject: pol.episodicInject as "off" | "tool" | "auto" }
        : {}),
      ...(typeof pol.knowledgeInjectBudget === "number"
        ? { knowledgeInjectBudget: pol.knowledgeInjectBudget }
        : {}),
      ...(typeof pol.episodicInjectBudget === "number"
        ? { episodicInjectBudget: pol.episodicInjectBudget }
        : {}),
    });
  }
  if (setup.reindexKnowledge) {
    await daemon.knowledge.reindexKnowledge("alice");
  }
  if (setup.enableHeartbeat) {
    const everyMs =
      typeof setup.heartbeatEveryMs === "number" && setup.heartbeatEveryMs > 0
        ? setup.heartbeatEveryMs
        : 60 * 60_000;
    await daemon.schedules.ensureHeartbeatJob("alice", { everyMs });
  }
  if (setup.demoHa) {
    const started = await daemonRpc(daemon.config.wsPort, "home.startDemoHa", {
      accountId: "alice",
    });
    if (started["error"]) {
      throw new Error(`demoHa: ${JSON.stringify(started["error"])}`);
    }
    const prevCleanup = web.cleanupExtra ?? browser.cleanupExtra;
    const stopDemo = async () => {
      await daemonRpc(daemon.config.wsPort, "home.stopDemoHa", {}).catch(() => undefined);
      await prevCleanup?.();
    };
    return {
      filesRoot,
      skillId,
      skipReason: web.skipReason ?? browser.skipReason,
      webSearchExtras: web.webSearchExtras,
      cleanupExtra: stopDemo,
      autoAnswerAskUser:
        setup.autoAnswerAskUser && typeof setup.autoAnswerAskUser === "object"
          ? (setup.autoAnswerAskUser as Record<string, unknown>)
          : undefined,
    };
  }
  return {
    filesRoot,
    skillId,
    skipReason: web.skipReason ?? browser.skipReason,
    webSearchExtras: web.webSearchExtras,
    cleanupExtra: web.cleanupExtra,
    autoAnswerAskUser:
      setup.autoAnswerAskUser && typeof setup.autoAnswerAskUser === "object"
        ? (setup.autoAnswerAskUser as Record<string, unknown>)
        : undefined,
  };
}

function assertStepExpect(out: string, stepExpect: Record<string, unknown> | undefined) {
  if (!stepExpect) return;
  if (stepExpect.bodyMatching) {
    assert.ok(matchesAny(out, stepExpect.bodyMatching as string | string[]), out.slice(0, 200));
  }
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(out) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }
  if (stepExpect.jsonFields && parsed) {
    for (const f of stepExpect.jsonFields as string[]) {
      assert.ok(f in parsed, `missing ${f}`);
    }
  }
  if (typeof stepExpect.countMin === "number" && parsed) {
    assert.ok(Number(parsed.count) >= stepExpect.countMin);
  }
  if (stepExpect.confirmOk && parsed) {
    assert.ok(parsed.armed === true || parsed.job);
  }
}

function assertScheduleNl(
  text: string,
  expect: Record<string, unknown>,
  locale?: string,
): { whenInstant?: string } {
  const r = resolveScheduleFromText({
    text,
    referenceNow: REF,
    timeZone: TZ,
    ...(locale ? { locale } : {}),
  });
  const want = expect.scheduleNl as Record<string, unknown> | undefined;
  if (!want) return {};
  if (want.ok === false) {
    assert.equal(r.ok, false, text);
    return {};
  }
  assert.equal(r.ok, true, `${text} → ${JSON.stringify(r)}`);
  if (!r.ok) return {};
  if (want.kind) assert.equal(r.spec.kind, want.kind, text);
  if (typeof want.relativeMs === "number") {
    assert.equal(r.spec.kind, "at");
    assert.equal(
      new Date(r.spec.whenInstant!).getTime(),
      REF.getTime() + want.relativeMs,
      text,
    );
  }
  if (typeof want.hour === "number" || typeof want.dayOffset === "number") {
    assert.equal(r.spec.kind, "at");
    const p = zonedParts(new Date(r.spec.whenInstant!), TZ);
    if (typeof want.hour === "number") assert.equal(p.hour, want.hour, text);
    if (typeof want.minute === "number") assert.equal(p.minute, want.minute, text);
    if (typeof want.dayOffset === "number") {
      const refParts = zonedParts(REF, TZ);
      assert.equal(p.day, refParts.day + want.dayOffset, text);
    }
  }
  return { whenInstant: r.spec.kind === "at" ? r.spec.whenInstant : undefined };
}

describe("V-AGENT-SCENARIO-1 agent catalogue", async () => {
  const { loadCatalogue } = await import(loadCatalogueUrl);
  const cases = loadCatalogue() as Array<Record<string, unknown>>;

  test("catalogue loads with unique ids", () => {
    assert.ok(cases.length >= 195, `expected ≥195 cases, got ${cases.length}`);
    const ids = new Set(cases.map((c) => c.id));
    assert.equal(ids.size, cases.length);
  });

  test("live cases soft-expect LLM tools or honesty", () => {
    const live = cases.filter((c) => c.live === true);
    assert.ok(live.length >= 95, `expected ≥95 live LLM cases, got ${live.length}`);
    for (const c of live) {
      const expect = (c.expect ?? {}) as Record<string, unknown>;
      const hasTools = Array.isArray(expect.liveTools) && expect.liveTools.length > 0;
      const hasHonesty =
        expect.honestyMatching != null ||
        expect.liveHonesty != null;
      assert.ok(
        hasTools || hasHonesty,
        `${c.id}: live case needs expect.liveTools and/or honestyMatching`,
      );
      assert.ok(
        typeof c.prompt === "string" && String(c.prompt).trim().length > 0,
        `${c.id}: live case needs a prompt for the real LLM`,
      );
    }
  });

  const instantById = new Map<string, string | undefined>();

  for (const c of cases.filter((x) => x.mode === "nl")) {
    test(`nl:${c.id}`, () => {
      const expect = c.expect as Record<string, unknown>;
      const primary = assertScheduleNl(String(c.prompt), expect, c.locale as string | undefined);
      instantById.set(String(c.id), primary.whenInstant);
      const cluster = expect.cluster as string[] | undefined;
      if (cluster?.length && primary.whenInstant) {
        for (const variant of cluster) {
          const r = resolveScheduleFromText({
            text: variant,
            referenceNow: REF,
            timeZone: TZ,
            ...(c.locale ? { locale: String(c.locale) } : {}),
          });
          assert.equal(r.ok, true, variant);
          if (!r.ok) continue;
          assert.equal(r.spec.kind, "at");
          assert.equal(r.spec.whenInstant, primary.whenInstant, variant);
        }
      }
      const matchId = expect.matchInstantFromId as string | undefined;
      if (matchId && primary.whenInstant) {
        const other = instantById.get(matchId);
        // Match id may run later — resolve on the fly.
        if (other) {
          assert.equal(primary.whenInstant, other, `match ${matchId}`);
        } else {
          const peer = cases.find((x) => x.id === matchId);
          assert.ok(peer, matchId);
          const peerHit = assertScheduleNl(
            String(peer!.prompt),
            peer!.expect as Record<string, unknown>,
            peer!.locale as string | undefined,
          );
          assert.equal(primary.whenInstant, peerHit.whenInstant, `match ${matchId}`);
        }
      }
    });
  }

  for (const c of cases.filter((x) => x.mode === "tool" && Array.isArray(x.toolSequence))) {
    test(`seq:${c.id}`, async (t) => {
      const expect = c.expect as Record<string, unknown>;
      const setup = (c.setup ?? {}) as Record<string, unknown>;
      const steps = c.toolSequence as SeqStep[];
      const { daemon, stateDir, cleanup } = await boot();
      let cleanupExtra: (() => Promise<void>) | undefined;
      try {
        const prepared = await prepareSandbox(daemon, stateDir, setup);
        cleanupExtra = prepared.cleanupExtra;
        if (prepared.skipReason) {
          t.skip(prepared.skipReason);
          return;
        }
        if (expect.heartbeatJobPresent) {
          const job = await daemon.schedules.store.getJob(
            "alice",
            "system:heartbeat:alice",
          );
          assert.ok(job?.enabled, "expected enabled system:heartbeat job");
          assert.equal(job!.payload.kind, "system");
        }
        const { filesRoot, skillId, webSearchExtras } = prepared;
        let proposalId: string | undefined;
        let prevParsed: Record<string, unknown> | undefined;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]!;
          const args = { ...(step.args ?? {}) };
          if (step.useInstalledSkillId && skillId) args.id = skillId;
          if (step.usePriorProposalId && proposalId) args.proposalId = proposalId;
          if (step.argsFromPrev && prevParsed) {
            for (const [argKey, field] of Object.entries(step.argsFromPrev)) {
              if (prevParsed[field] != null) args[argKey] = prevParsed[field];
            }
          }
          const stepExpect = expect[`step${i}`] as Record<string, unknown> | undefined;
          if (step.refuse) {
            await assert.rejects(
              () =>
                runSandboxOrWorkflowTool({
                  daemon,
                  stateDir,
                  filesRoot,
                  name: step.name,
                  args,
                  webSearchExtras,
                }),
              (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                assert.ok(
                  matchesAny(msg, (stepExpect?.refuseMatching ?? expect.refuseMatching) as string | string[]),
                  msg,
                );
                return true;
              },
            );
            continue;
          }
          const out = await runSandboxOrWorkflowTool({
            daemon,
            stateDir,
            filesRoot,
            name: step.name,
            args,
            webSearchExtras,
          });
          try {
            const parsed = JSON.parse(out) as Record<string, unknown>;
            prevParsed = parsed;
            if (typeof parsed.proposalId === "string") proposalId = parsed.proposalId;
          } catch {
            prevParsed = undefined;
          }
          assertStepExpect(out, stepExpect);
        }
        if (expect.sequenceOk) assert.ok(true);
        for (let i = 0; i < 10 && daemon.turns.activeTurnCount() > 0; i++) {
          await flushLoop(5);
        }
      } finally {
        await cleanupExtra?.().catch(() => undefined);
        await cleanup();
      }
    });
  }

  for (const c of cases.filter((x) => x.mode === "tool" && !Array.isArray(x.toolSequence))) {
    test(`tool:${c.id}`, async (t) => {
      const tool = (c.tool ?? {}) as Record<string, unknown>;
      const expect = c.expect as Record<string, unknown>;
      const name = String(tool.name ?? "");

      if (tool.parseOnly && name === "ask_user") {
        const fence = [
          "```envoyhome-tools",
          JSON.stringify([
            {
              tool: "ask_user",
              args: {
                question: "Pick a time",
                options: [
                  { id: "a", label: "8am" },
                  { id: "b", label: "9am" },
                ],
                selection: "one",
              },
            },
          ]),
          "```",
        ].join("\n");
        const { tools } = parseAssistantToolCalls(fence, { allowSandbox: true });
        assert.equal(tools.length, 1);
        assert.equal(tools[0]!.tool, "ask_user");
        if (expect.askUserParseOk) assert.ok(true);
        return;
      }

      if (expect.catalogueAvailable !== undefined && name === "web_search") {
        const stateDir = await mkdtemp(join(tmpdir(), "envoyhome-ws-cat-"));
        try {
          const paths = homePaths(stateDir);
          const skills = new SkillService(paths);
          const devices = new DeviceCredentialStore();
          const bindings = new BindingStore(stateDir, devices);
          const channels = new ChannelService({
            stateDir,
            bindings,
            logger: new DaemonLogger(),
          });
          const webSearch = new WebSearchService(paths);
          await webSearch.load();
          if (tool.webSearchEnabled === false) {
            await webSearch.setConfig({ provider: "brave" });
          }
          const tools = await listWorkflowTools({ skills, channels, webSearch });
          const row = tools.find((t) => t.name === "web_search");
          assert.equal(row?.available, expect.catalogueAvailable);
        } finally {
          await rm(stateDir, { recursive: true, force: true });
        }
        return;
      }

      const { daemon, stateDir, cleanup } = await boot();
      let cleanupExtra: (() => Promise<void>) | undefined;
      try {
        const setup = {
          ...((c.setup ?? {}) as Record<string, unknown>),
          ...(tool.installSampleSkill ? { installSampleSkill: true } : {}),
          ...(tool.sandboxFiles || expect.jsonFields ? { sandboxFiles: true } : {}),
        };
        const prepared = await prepareSandbox(daemon, stateDir, setup);
        cleanupExtra = prepared.cleanupExtra;
        if (prepared.skipReason) {
          t.skip(prepared.skipReason);
          return;
        }
        if (expect.heartbeatJobPresent) {
          const job = await daemon.schedules.store.getJob(
            "alice",
            "system:heartbeat:alice",
          );
          assert.ok(job?.enabled, "expected enabled system:heartbeat job");
        }
        const { filesRoot, skillId, webSearchExtras } = prepared;
        const args = { ...(tool.args as Record<string, unknown>) };
        if (tool.useInstalledSkillId && skillId) {
          args.id = skillId;
        }

        const run = () =>
          runSandboxOrWorkflowTool({
            daemon,
            stateDir,
            filesRoot,
            name,
            args,
            webSearchExtras,
          });

        if (tool.refuse) {
          await assert.rejects(run, (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            assert.ok(
              matchesAny(msg, expect.refuseMatching as string | string[]),
              msg,
            );
            return true;
          });
          return;
        }

        const out = await run();
        if (expect.toolOk) assert.ok(out.length > 0);
        if (expect.bodyMatching) {
          assert.ok(matchesAny(out, expect.bodyMatching as string | string[]), out.slice(0, 200));
        }
        let parsed: Record<string, unknown> | undefined;
        try {
          parsed = JSON.parse(out) as Record<string, unknown>;
        } catch {
          parsed = undefined;
        }
        if (expect.jsonFields && parsed) {
          for (const f of expect.jsonFields as string[]) {
            assert.ok(f in parsed, `missing ${f} in ${out.slice(0, 200)}`);
          }
        }
        if (expect.resolvedLocalMatching && parsed) {
          assert.ok(
            matchesAny(String(parsed.resolvedLocal ?? ""), String(expect.resolvedLocalMatching)),
          );
        }
        if (typeof expect.countMin === "number" && parsed) {
          assert.ok(Number(parsed.count) >= expect.countMin);
        }

        if (tool.confirmAfter && parsed?.proposalId) {
          const confirmed = await runSandboxOrWorkflowTool({
            daemon,
            stateDir,
            filesRoot,
            name: "schedule",
            args: { action: "confirm", proposalId: String(parsed.proposalId) },
            webSearchExtras,
          });
          const cj = JSON.parse(confirmed) as Record<string, unknown>;
          if (expect.confirmOk) {
            assert.ok(cj.armed === true || cj.job);
          }
        }

        if (tool.listAfter) {
          const listed = await runSandboxOrWorkflowTool({
            daemon,
            stateDir,
            filesRoot,
            name: "schedule",
            args: { action: "list" },
            webSearchExtras,
          });
          if (expect.listHasProposal) {
            assert.ok(/proposal|job|schedule/i.test(listed), listed.slice(0, 300));
          }
        }

        for (let i = 0; i < 10 && daemon.turns.activeTurnCount() > 0; i++) {
          await flushLoop(5);
        }
      } finally {
        await cleanupExtra?.().catch(() => undefined);
        await cleanup();
      }
    });
  }

  for (const c of cases.filter((x) => x.mode === "turn")) {
    test(`turn:${c.id}`, () => {
      const expect = c.expect as Record<string, unknown>;
      const purpose = String(c.purpose ?? "general");
      const homeSurface = purpose === "home";
      const schedulesSurface = purpose === "schedules";
      const names = parentToolNamesForSurface({ homeSurface, schedulesSurface });

      if (expect.surfaceToolsExact) {
        assert.deepEqual(names.slice().sort(), (expect.surfaceTools as string[]).slice().sort());
      }
      if (expect.surfaceToolsIncludes) {
        for (const t of expect.surfaceToolsIncludes as string[]) {
          assert.ok(names.includes(t), `missing ${t} in ${names.join(",")}`);
        }
      }
      if (expect.surfaceToolsForbidden) {
        for (const t of expect.surfaceToolsForbidden as string[]) {
          assert.ok(!names.includes(t), `forbidden ${t} present`);
        }
      }

      const jail = expect.pathJail as
        | { path: string; mustThrow?: boolean }
        | undefined;
      if (jail?.mustThrow) {
        const root = join(tmpdir(), "envoyhome-jail-root");
        assert.throws(() => safeJoin(root, jail.path), PathJailError);
      }

      const hb = expect.heartbeatSilent as
        | Array<{ text: string; silent: boolean }>
        | undefined;
      if (Array.isArray(hb)) {
        for (const row of hb) {
          assert.equal(
            isHeartbeatSilentOk(row.text),
            row.silent,
            `heartbeatSilent: ${JSON.stringify(row)} (const=${HEARTBEAT_OK})`,
          );
        }
      }

      if (expect.heartbeatJobEnabled) {
        // Deferred to tool/setup cases that call ensureHeartbeatJob — surface marker only.
        assert.ok(true);
      }
    });
  }

  for (const c of cases.filter((x) => x.mode === "compose")) {
    test(`compose:${c.id}`, async (t) => {
      const expect = c.expect as Record<string, unknown>;
      const setup = (c.setup ?? {}) as Record<string, unknown>;
      const allowTools = (c.allowTools as string[] | undefined) ?? [
        "skills_list",
        "skill_view",
        "skill_propose",
        "schedule",
        "ask_user",
        "read_file",
        "write_file",
        "edit_file",
        "apply_patch",
        "list_dir",
        "search_files",
        "export_document",
        "extract_document",
        "web_search",
        "browser",
        "memory_recall",
        "memory_remember",
        "session_search",
        "knowledge_search",
        "knowyou_search",
        "ha_get_state",
        "ha_call_service",
        "ha_list_entities",
        "exec",
      ];
      const rounds = c.rounds as Array<{ reply: string }>;
      const { daemon, stateDir, cleanup } = await boot();
      let cleanupExtra: (() => Promise<void>) | undefined;
      try {
        const prepared = await prepareSandbox(daemon, stateDir, setup);
        cleanupExtra = prepared.cleanupExtra;
        if (prepared.skipReason) {
          t.skip(prepared.skipReason);
          return;
        }
        const filesRoot = prepared.filesRoot;
        const skillId = prepared.skillId ?? "";
        const webSearchExtras = prepared.webSearchExtras;
        const autoAnswer = prepared.autoAnswerAskUser;
        const vars: Record<string, string> = { skillId };
        let proposalId = "";
        const replies = rounds.map((r) => substituteVars(r.reply, vars));
        // Re-bind proposalId after first schedule propose inside dispatch.
        let round = 0;
        const allowSmartHome = allowTools.some(
          (t) => t.startsWith("ha_") || t.startsWith("mqtt_"),
        );
        const allowExec = allowTools.includes("exec");
        const fenceModel = new HomeModelAdapter(
          async () => {
            const idx = round++;
            let text = replies[idx] ?? "done.";
            if (proposalId) text = substituteVars(text, { ...vars, proposalId });
            return text;
          },
          { allowSmartHome, allowExec, allowHttpFetch: allowTools.includes("http_fetch") },
        );
        const dispatchOrder: string[] = [];
        const submitter = createHomeMeshSubmitter({
          model: fenceModel,
          allowTools,
          cwd: filesRoot,
          dispatch: async (tool, args) => {
            dispatchOrder.push(tool);
            if (tool === "ask_user") {
              // Multi-turn: auto-answer so the scripted model can continue (V-UX-14 peer).
              if (autoAnswer) {
                return JSON.stringify({
                  answered: true,
                  question: (args as Record<string, unknown>).question ?? null,
                  ...autoAnswer,
                });
              }
              return JSON.stringify({ parked: true, args });
            }
            const out = await runSandboxOrWorkflowTool({
              daemon,
              stateDir,
              filesRoot,
              name: tool,
              args: args as Record<string, unknown>,
              webSearchExtras,
            });
            try {
              const parsed = JSON.parse(out) as Record<string, unknown>;
              if (typeof parsed.proposalId === "string") {
                proposalId = parsed.proposalId;
              }
            } catch {
              /* text */
            }
            return out;
          },
        });
        const result = await submitter.submit(
          homeSubagentInput(String(c.prompt)),
          AbortSignal.timeout(30_000),
        );
        assert.equal(result.status, "completed", JSON.stringify(result));
        const finalText = textFromSubagentResult(result);
        if (expect.dispatchOrder) {
          assert.deepEqual(dispatchOrder, expect.dispatchOrder as string[]);
        }
        if (typeof expect.minToolRounds === "number") {
          assert.ok(
            dispatchOrder.length >= expect.minToolRounds,
            `tools=${dispatchOrder.join(",")}`,
          );
        }
        if (expect.finalMatching) {
          assert.ok(
            matchesAny(finalText, expect.finalMatching as string | string[]),
            finalText.slice(0, 300),
          );
        }
      } finally {
        await cleanupExtra?.().catch(() => undefined);
        await cleanup();
      }
    });
  }
});
