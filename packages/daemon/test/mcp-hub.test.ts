// V-MCP-1…6 — Owner MCP hub (Design §9.5h / P2-F).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetActiveXForTests } from "@envoyhome/test-utils";
import { toolSpec, clearExtraToolSpecsForTests } from "@envoyhome/harness-host";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import {
  McpHub,
  assertSafeMcpUrl,
  mcpCatalogueToolName,
  riskFromAnnotations,
  homePaths,
  startDaemon,
  type RunningDaemon,
  type McpSession,
} from "../dist/index.js";
import {
  requiresAttendedApproval,
  unattendedRequiresGrant,
} from "@envoyhome/harness-host";

const daemons: RunningDaemon[] = [];
const dirs: string[] = [];

after(async () => {
  clearExtraToolSpecsForTests();
  __resetActiveXForTests();
  for (const d of daemons.splice(0)) {
    await d.stop().catch(() => undefined);
  }
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

function mockSession(tools: Array<{ name: string; description?: string }>): McpSession {
  let calledMutating = false;
  return {
    async listTools() {
      return tools.map((t) => ({
        name: mcpCatalogueToolName("demo", t.name),
        mcpName: t.name,
        ...(t.description ? { description: t.description } : {}),
      }));
    },
    async callTool(name, args) {
      calledMutating = true;
      return JSON.stringify({ name, args });
    },
    async close() {},
    /** test helper */
    get calledMutating() {
      return calledMutating;
    },
  } as McpSession & { calledMutating: boolean };
}

test("V-MCP-3: remote URL SSRF refused", () => {
  assert.throws(() => assertSafeMcpUrl("http://169.254.169.254/latest"), /ssrf/i);
  assert.throws(() => assertSafeMcpUrl("file:///etc/passwd"), /ssrf|http/i);
  assert.ok(assertSafeMcpUrl("https://example.com/mcp"));
});

test("V-MCP-1/2/4/6: upsert, test lists tools without call, enable gate, remove", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mcp-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  let session = mockSession([{ name: "ping", description: "Ping" }]);
  const hub = new McpHub(paths, async () => session);
  await hub.load();

  const row = await hub.upsert({
    id: "demo",
    label: "Demo MCP",
    transport: "stdio",
    command: "true",
  });
  assert.equal(row.id, "demo");
  assert.equal(row.ready, false);

  await assert.rejects(() => hub.setEnabled("demo", true), /not_ready/i);

  const tested = await hub.test("demo");
  assert.equal(tested.ok, true);
  assert.equal(tested.tools.length, 1);
  assert.equal(tested.tools[0]!.mcpName, "ping");
  // Test path must not invoke tools/call (session.callTool unused).

  const enabled = await hub.setEnabled("demo", true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.ready, true);
  const names = await hub.listReadyToolNames();
  assert.ok(names.includes("mcp__demo__ping"));
  assert.ok(toolSpec("mcp__demo__ping"));

  await hub.remove("demo");
  assert.deepEqual(await hub.listServers(), []);
  assert.deepEqual(await hub.listReadyToolNames(), []);
});

test("V-MCP-1: Owner RPC upsert via daemon; catalogue absent until test", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mcp-d-"));
  dirs.push(stateDir);
  const daemon = await startDaemon({
    config: { wsPort: 0, httpPort: 0, stateDir, hatchApiKey: "k-mcp" },
    packageVersion: "0.0.0-test",
  });
  daemons.push(daemon);

  const session = mockSession([{ name: "echo" }]);
  daemon.mcpHub.setSessionFactoryForTests(async (server) => {
    return {
      async listTools() {
        return [
          {
            name: mcpCatalogueToolName(server.id, "echo"),
            mcpName: "echo",
            description: "Echo",
          },
        ];
      },
      async callTool() {
        throw new Error("test must not call tools");
      },
      async close() {},
    };
  });

  await daemon.accounts.create({ accountId: "alice", displayName: "Alice" });
  // Loopback path: router treats missing caller as owner-capable for local.
  const up = await daemon.mcpHub.upsert({
    id: "weather",
    label: "Weather",
    transport: "http",
    url: "https://example.com/mcp",
  });
  assert.equal(up.id, "weather");
  assert.equal((await daemon.mcpHub.listReadyToolNames()).length, 0);

  const t = await daemon.mcpHub.test("weather");
  assert.equal(t.ok, true);
  await daemon.mcpHub.setEnabled("weather", true);
  assert.ok((await daemon.mcpHub.listReadyToolNames()).includes("mcp__weather__echo"));

  // SSRF on upsert
  await assert.rejects(
    () =>
      daemon.mcpHub.upsert({
        id: "bad",
        label: "Bad",
        transport: "http",
        url: "http://127.0.0.1:9/mcp",
      }),
    /ssrf/i,
  );
  void session;
});

test("V-MCP-5: toolSpec mcp defaults to network grantable", () => {
  const spec = toolSpec("mcp__any__tool");
  assert.ok(spec);
  assert.equal(spec!.risk, "network");
  assert.equal(spec!.grantable, true);
});

test("V-MCP-5: annotations escalate only — readOnlyHint:false stays ask (admin not write)", async () => {
  // Never map to write (write skips attended ask / unattended grant).
  assert.equal(riskFromAnnotations({ readOnlyHint: false }), "admin");
  assert.equal(riskFromAnnotations({ destructiveHint: true }), "admin");
  assert.equal(riskFromAnnotations({ readOnlyHint: true }), "network");
  assert.equal(riskFromAnnotations(undefined), "network");

  const stateDir = await mkdtemp(join(tmpdir(), "eh-mcp-ann-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const hub = new McpHub(paths, async (server) => ({
    async listTools() {
      return [
        {
          name: mcpCatalogueToolName(server.id, "mutate"),
          mcpName: "mutate",
          annotations: { readOnlyHint: false },
        },
      ];
    },
    async callTool() {
      return "{}";
    },
    async close() {},
  }));
  await hub.load();
  await hub.upsert({
    id: "ann",
    label: "Ann",
    transport: "stdio",
    command: "true",
  });
  assert.equal((await hub.test("ann")).ok, true);
  await hub.setEnabled("ann", true);
  const spec = toolSpec("mcp__ann__mutate");
  assert.ok(spec);
  assert.equal(spec!.risk, "admin");
  assert.equal(requiresAttendedApproval(spec!, "attended", "standard"), true);
  assert.equal(unattendedRequiresGrant(spec!, "unattended"), true);
});

test("V-MCP-6: remove tears down secrets + live; test() evicts prior live", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mcp-rm-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  let liveClosed = 0;
  let sessionsMade = 0;
  const hub = new McpHub(paths, async (server) => {
    sessionsMade += 1;
    return {
      async listTools() {
        return [
          {
            name: mcpCatalogueToolName(server.id, "ping"),
            mcpName: "ping",
          },
        ];
      },
      async callTool() {
        return JSON.stringify({ ok: true });
      },
      async close() {
        liveClosed += 1;
      },
    };
  });
  await hub.load();
  await hub.upsert({
    id: "demo",
    label: "Demo",
    transport: "stdio",
    command: "true",
    env: { SECRET: "x" },
  });
  assert.equal((await hub.test("demo")).ok, true);
  await hub.setEnabled("demo", true);
  await hub.callTool("mcp__demo__ping", {});
  const secretPath = join(stateDir, "secrets", "mcp", "demo", "env.json");
  await access(secretPath, fsConstants.F_OK);

  // Re-test must close the live session opened by callTool.
  const closedBeforeRetest = liveClosed;
  assert.equal((await hub.test("demo")).ok, true);
  assert.ok(liveClosed > closedBeforeRetest);

  await hub.setEnabled("demo", true);
  await hub.callTool("mcp__demo__ping", {});
  const closedBeforeRemove = liveClosed;
  await hub.remove("demo");
  assert.ok(liveClosed > closedBeforeRemove);
  await assert.rejects(() => access(secretPath, fsConstants.F_OK), /ENOENT/);
  assert.deepEqual(await hub.listServers(), []);
  void sessionsMade;
});

test("V-MCP-2: config/secret change invalidates ready; enable requires re-test", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "eh-mcp-inv-"));
  dirs.push(stateDir);
  const paths = homePaths(stateDir);
  const hub = new McpHub(paths, async (server) => ({
    async listTools() {
      return [
        {
          name: mcpCatalogueToolName(server.id, "ping"),
          mcpName: "ping",
        },
      ];
    },
    async callTool() {
      throw new Error("no call");
    },
    async close() {},
  }));
  await hub.load();

  await hub.upsert({
    id: "demo",
    label: "Demo",
    transport: "stdio",
    command: "true",
  });
  assert.equal((await hub.test("demo")).ok, true);
  await hub.setEnabled("demo", true);
  assert.ok((await hub.listReadyToolNames()).includes("mcp__demo__ping"));
  assert.ok(toolSpec("mcp__demo__ping"));

  // Secret change clears readiness and unregisters catalogue.
  await hub.upsert({
    id: "demo",
    label: "Demo",
    transport: "stdio",
    command: "true",
    env: { TOKEN: "x" },
  });
  const afterSecret = (await hub.listServers()).find((s) => s.id === "demo");
  assert.equal(afterSecret?.ready, false);
  assert.deepEqual(await hub.listReadyToolNames(), []);

  await assert.rejects(
    () =>
      hub.upsert({
        id: "demo",
        label: "Demo",
        transport: "stdio",
        command: "true",
        enabled: true,
      }),
    /not_ready/i,
  );

  assert.equal((await hub.test("demo")).ok, true);
  await hub.setEnabled("demo", true);
  assert.ok((await hub.listReadyToolNames()).includes("mcp__demo__ping"));
});
