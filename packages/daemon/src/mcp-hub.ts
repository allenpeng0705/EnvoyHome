/**
 * Design §9.5h / P2-F — Owner-driven MCP servers (open to add, gated to act).
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import type { HomePaths } from "./home-paths.js";
import { isBlockedHostname } from "./skill-remote.js";
import { clearMcpToolSpecs, registerToolSpec } from "@envoyhome/harness-host";

export const MCP_MAX_SERVERS = 16;
export const MCP_MAX_TOOLS_PER_SERVER = 128;
export const MCP_TEST_TIMEOUT_MS = 20_000;

export type McpTransport = "stdio" | "http" | "sse";

export type McpToolInfo = {
  name: string;
  description?: string;
  /** Raw MCP tool name (before mcp__ prefix). */
  mcpName: string;
  annotations?: Record<string, unknown>;
};

export type McpServerRecord = {
  id: string;
  label: string;
  enabled: boolean;
  transport: McpTransport;
  /** stdio */
  command?: string;
  args?: string[];
  /** http/sse */
  url?: string;
  hasEnvSecret: boolean;
  hasAuthToken: boolean;
  ready: boolean;
  lastTestOkAt: string | null;
  lastTestError: string | null;
  toolCount: number;
  updatedAt: string;
};

type StoredServer = {
  id: string;
  label: string;
  enabled: boolean;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  lastTestOkAt: string | null;
  lastTestError: string | null;
  cachedTools: McpToolInfo[];
  updatedAt: string;
};

type StoreFile = { servers: StoredServer[]; updatedAt: string };

export type McpListToolsResult = {
  ok: boolean;
  tools: McpToolInfo[];
  latencyMs: number;
  error?: string;
};

/** Injectable transport for tests (V-MCP-*). */
export type McpSession = {
  listTools(): Promise<McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
};

export type McpSessionFactory = (server: StoredServer, secrets: McpSecrets) => Promise<McpSession>;

export type McpSecrets = {
  env: Record<string, string>;
  authToken: string | null;
};

function emptyStore(): StoreFile {
  return { servers: [], updatedAt: new Date().toISOString() };
}

export function sanitizeMcpServerId(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (!s) throw Object.assign(new Error("envoyhome.bad_params: mcp server id required"), {
    code: "envoyhome.bad_params",
  });
  return s;
}

export function mcpCatalogueToolName(serverId: string, toolName: string): string {
  const t = toolName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96);
  return `mcp__${serverId}__${t}`;
}

export function parseMcpCatalogueToolName(
  name: string,
): { serverId: string; toolName: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const i = rest.indexOf("__");
  if (i <= 0) return null;
  return { serverId: rest.slice(0, i), toolName: rest.slice(i + 2) };
}

export function assertSafeMcpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("envoyhome.ssrf_refused: invalid MCP URL"), {
      code: "envoyhome.ssrf_refused",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("envoyhome.ssrf_refused: MCP URL must be http(s)"), {
      code: "envoyhome.ssrf_refused",
    });
  }
  if (isBlockedHostname(url.hostname)) {
    throw Object.assign(new Error("envoyhome.ssrf_refused: blocked MCP host"), {
      code: "envoyhome.ssrf_refused",
    });
  }
  return url;
}

/**
 * Hostname string check + DNS resolve — refuse if any A/AAAA is blocked
 * (link-local / metadata / loopback). Mitigates DNS-rebinding TOCTOU vs
 * hostname-only checks at upsert.
 */
export async function assertSafeMcpUrlResolved(raw: string): Promise<URL> {
  const url = assertSafeMcpUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  try {
    const records = await dnsLookup(host, { all: true, verbatim: true });
    for (const rec of records) {
      if (isBlockedHostname(rec.address)) {
        throw Object.assign(
          new Error("envoyhome.ssrf_refused: blocked MCP resolved address"),
          { code: "envoyhome.ssrf_refused" },
        );
      }
    }
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      (err as { code?: string }).code === "envoyhome.ssrf_refused"
    ) {
      throw err;
    }
    throw Object.assign(new Error("envoyhome.ssrf_refused: MCP host DNS failed"), {
      code: "envoyhome.ssrf_refused",
    });
  }
  return url;
}

/**
 * Design §9.5h — annotations MAY escalate ask severity only; NEVER de-escalate
 * below `network` (`write` would skip attended ask / unattended grant).
 */
export function riskFromAnnotations(
  ann: Record<string, unknown> | undefined,
): "network" | "admin" {
  if (!ann) return "network";
  if (
    ann.destructiveHint === true ||
    ann.openWorldHint === true ||
    ann.readOnlyHint === false
  ) {
    return "admin";
  }
  return "network";
}

async function defaultStdioSession(
  server: StoredServer,
  secrets: McpSecrets,
): Promise<McpSession> {
  const command = server.command?.trim();
  if (!command) {
    throw Object.assign(new Error("envoyhome.bad_params: stdio command required"), {
      code: "envoyhome.bad_params",
    });
  }
  // Minimal inherited env — avoid leaking daemon secrets into Owner-chosen stdio.
  const inherited: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP"]) {
    const v = process.env[key];
    if (typeof v === "string" && v) inherited[key] = v;
  }
  const child: ChildProcessWithoutNullStreams = spawn(command, server.args ?? [], {
    env: { ...inherited, ...secrets.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  const pending = new Map<
    number | string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  let nextId = 1;
  const onLine = (line: string) => {
    let msg: { id?: number | string; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (msg.id === undefined || msg.id === null) return;
    const wait = pending.get(msg.id);
    if (!wait) return;
    pending.delete(msg.id);
    if (msg.error) {
      wait.reject(new Error(msg.error.message ?? "mcp error"));
    } else {
      wait.resolve(msg.result);
    }
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onLine(line);
    }
  });
  const rpc = (method: string, params?: Record<string, unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
      child.stdin.write(`${payload}\n`);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("envoyhome.mcp_timeout"));
        }
      }, MCP_TEST_TIMEOUT_MS);
    });
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "envoyhome", version: "0.0.0" },
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  return {
    async listTools() {
      const result = (await rpc("tools/list", {})) as {
        tools?: Array<{ name?: string; description?: string; annotations?: Record<string, unknown> }>;
      };
      const tools: McpToolInfo[] = [];
      for (const t of result.tools ?? []) {
        if (typeof t.name !== "string" || !t.name.trim()) continue;
        tools.push({
          name: mcpCatalogueToolName(server.id, t.name),
          mcpName: t.name,
          ...(typeof t.description === "string" ? { description: t.description } : {}),
          ...(t.annotations ? { annotations: t.annotations } : {}),
        });
        if (tools.length >= MCP_MAX_TOOLS_PER_SERVER) break;
      }
      return tools;
    },
    async callTool(name, args) {
      const result = (await rpc("tools/call", { name, arguments: args })) as {
        content?: unknown;
        isError?: boolean;
      };
      return JSON.stringify(result ?? {});
    },
    async close() {
      child.kill("SIGTERM");
    },
  };
}

async function defaultHttpSession(
  server: StoredServer,
  secrets: McpSecrets,
): Promise<McpSession> {
  let nextId = 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (secrets.authToken) headers.authorization = `Bearer ${secrets.authToken}`;
  const rpc = async (method: string, params?: Record<string, unknown>) => {
    // Re-resolve each call — hostname allow at upsert is not enough vs DNS rebinding.
    const url = await assertSafeMcpUrlResolved(String(server.url ?? ""));
    const id = nextId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    });
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(MCP_TEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`envoyhome.mcp_http: ${res.status}`);
    const text = await res.text();
    // v1: http and sse share POST JSON-RPC; SSE responses take the last data: frame.
    let jsonText = text.trim();
    if (text.includes("data:")) {
      const lines = text.split("\n").filter((l) => l.startsWith("data:"));
      const last = lines[lines.length - 1];
      if (last) jsonText = last.slice(5).trim();
    }
    let msg: { result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(jsonText) as typeof msg;
    } catch {
      throw new Error("envoyhome.mcp_protocol: invalid JSON response");
    }
    if (msg.error) throw new Error(msg.error.message ?? "mcp error");
    return msg.result;
  };
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "envoyhome", version: "0.0.0" },
  });
  try {
    await rpc("notifications/initialized", {});
  } catch {
    /* some servers ignore */
  }
  return {
    async listTools() {
      const result = (await rpc("tools/list", {})) as {
        tools?: Array<{ name?: string; description?: string; annotations?: Record<string, unknown> }>;
      };
      const tools: McpToolInfo[] = [];
      for (const t of result.tools ?? []) {
        if (typeof t.name !== "string" || !t.name.trim()) continue;
        tools.push({
          name: mcpCatalogueToolName(server.id, t.name),
          mcpName: t.name,
          ...(typeof t.description === "string" ? { description: t.description } : {}),
          ...(t.annotations ? { annotations: t.annotations } : {}),
        });
        if (tools.length >= MCP_MAX_TOOLS_PER_SERVER) break;
      }
      return tools;
    },
    async callTool(name, args) {
      const result = await rpc("tools/call", { name, arguments: args });
      return JSON.stringify(result ?? {});
    },
    async close() {
      /* http is stateless */
    },
  };
}

export class McpHub {
  private store: StoreFile = emptyStore();
  private sessionFactory: McpSessionFactory;
  private live = new Map<string, McpSession>();

  constructor(
    private readonly paths: HomePaths,
    sessionFactory?: McpSessionFactory,
  ) {
    this.sessionFactory =
      sessionFactory ??
      (async (server, secrets) => {
        if (server.transport === "stdio") return defaultStdioSession(server, secrets);
        return defaultHttpSession(server, secrets);
      });
  }

  /** Tests: replace session factory. */
  setSessionFactoryForTests(factory: McpSessionFactory): void {
    this.sessionFactory = factory;
  }

  private configPath(): string {
    return join(this.paths.stateDir, "mcp-servers.json");
  }

  private secretDir(id: string): string {
    return join(this.paths.stateDir, "secrets", "mcp", id);
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.configPath(), "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (Array.isArray(parsed.servers)) this.store = parsed;
    } catch {
      this.store = emptyStore();
    }
    this.reregisterSpecs();
  }

  private async persist(): Promise<void> {
    this.store.updatedAt = new Date().toISOString();
    await mkdir(this.paths.stateDir, { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(this.store, null, 2)}\n`, "utf8");
    this.reregisterSpecs();
  }

  private reregisterSpecs(): void {
    clearMcpToolSpecs();
    for (const s of this.store.servers) {
      if (!s.enabled || !s.lastTestOkAt) continue;
      for (const t of s.cachedTools) {
        registerToolSpec({
          name: t.name,
          risk: riskFromAnnotations(t.annotations),
          grantable: true,
        });
      }
    }
  }

  /** Sanitize Owner-supplied env map (no empty / control keys). */
  private sanitizeEnvMap(
    env: Record<string, string> | null | undefined,
  ): Record<string, string> | null | undefined {
    if (env === undefined || env === null) return env;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      const key = k.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (typeof v !== "string") continue;
      out[key] = v;
    }
    return out;
  }

  private async readSecrets(id: string): Promise<McpSecrets> {
    const dir = this.secretDir(id);
    let env: Record<string, string> = {};
    let authToken: string | null = null;
    try {
      env = JSON.parse(await readFile(join(dir, "env.json"), "utf8")) as Record<string, string>;
    } catch {
      /* none */
    }
    try {
      const tok = (await readFile(join(dir, "auth.token"), "utf8")).trim();
      authToken = tok || null;
    } catch {
      /* none */
    }
    return { env, authToken };
  }

  private async writeSecrets(
    id: string,
    input: { env?: Record<string, string> | null; authToken?: string | null },
  ): Promise<void> {
    const dir = this.secretDir(id);
    await mkdir(dir, { recursive: true });
    if (input.env !== undefined) {
      if (input.env === null) {
        await rm(join(dir, "env.json"), { force: true });
      } else {
        await writeFile(join(dir, "env.json"), `${JSON.stringify(input.env)}\n`, "utf8");
      }
    }
    if (input.authToken !== undefined) {
      if (!input.authToken) {
        await rm(join(dir, "auth.token"), { force: true });
      } else {
        await writeFile(join(dir, "auth.token"), `${input.authToken}\n`, "utf8");
      }
    }
  }

  private async hasSecretFiles(id: string): Promise<{ hasEnvSecret: boolean; hasAuthToken: boolean }> {
    const s = await this.readSecrets(id);
    return {
      hasEnvSecret: Object.keys(s.env).length > 0,
      hasAuthToken: Boolean(s.authToken),
    };
  }

  private toPublic(s: StoredServer, secrets: { hasEnvSecret: boolean; hasAuthToken: boolean }): McpServerRecord {
    return {
      id: s.id,
      label: s.label,
      enabled: s.enabled,
      transport: s.transport,
      ...(s.command ? { command: s.command } : {}),
      ...(s.args ? { args: s.args } : {}),
      ...(s.url ? { url: s.url } : {}),
      hasEnvSecret: secrets.hasEnvSecret,
      hasAuthToken: secrets.hasAuthToken,
      ready: Boolean(s.enabled && s.lastTestOkAt && !s.lastTestError),
      lastTestOkAt: s.lastTestOkAt,
      lastTestError: s.lastTestError,
      toolCount: s.cachedTools.length,
      updatedAt: s.updatedAt,
    };
  }

  async listServers(): Promise<McpServerRecord[]> {
    const out: McpServerRecord[] = [];
    for (const s of this.store.servers) {
      out.push(this.toPublic(s, await this.hasSecretFiles(s.id)));
    }
    return out;
  }

  async listReadyToolNames(): Promise<string[]> {
    const names: string[] = [];
    for (const s of this.store.servers) {
      if (!s.enabled || !s.lastTestOkAt) continue;
      for (const t of s.cachedTools) names.push(t.name);
    }
    return names;
  }

  async listMcpTools(serverId?: string): Promise<McpToolInfo[]> {
    const out: McpToolInfo[] = [];
    for (const s of this.store.servers) {
      if (serverId && s.id !== serverId) continue;
      if (!s.enabled || !s.lastTestOkAt) continue;
      out.push(...s.cachedTools);
    }
    return out;
  }

  async upsert(input: {
    id?: string;
    label: string;
    transport: McpTransport;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string> | null;
    authToken?: string | null;
    enabled?: boolean;
  }): Promise<McpServerRecord> {
    const id = sanitizeMcpServerId(input.id ?? (input.label.trim() || randomUUID().slice(0, 8)));
    if (input.transport === "http" || input.transport === "sse") {
      assertSafeMcpUrl(String(input.url ?? ""));
    }
    let row = this.store.servers.find((s) => s.id === id);
    if (!row && this.store.servers.length >= MCP_MAX_SERVERS) {
      throw Object.assign(new Error("envoyhome.mcp_cap: max servers"), {
        code: "envoyhome.mcp_cap",
      });
    }
    const now = new Date().toISOString();
    if (!row) {
      row = {
        id,
        label: input.label.trim() || id,
        enabled: false,
        transport: input.transport,
        lastTestOkAt: null,
        lastTestError: null,
        cachedTools: [],
        updatedAt: now,
      };
      this.store.servers.push(row);
    }
    const priorTransport = row.transport;
    row.label = input.label.trim() || row.label;
    row.transport = input.transport;
    if (input.transport === "stdio") {
      const cmd = input.command?.trim() ?? row.command;
      if (cmd) row.command = cmd;
      if (Array.isArray(input.args)) row.args = input.args.map(String);
      delete row.url;
    } else {
      row.url = String(input.url ?? row.url ?? "").trim();
      delete row.command;
      delete row.args;
    }
    // Config / secret / transport change invalidates readiness until re-test.
    const invalidate =
      priorTransport !== input.transport ||
      input.command !== undefined ||
      input.args !== undefined ||
      input.url !== undefined ||
      input.env !== undefined ||
      input.authToken !== undefined;
    if (invalidate) {
      row.lastTestOkAt = null;
      row.lastTestError = null;
      row.cachedTools = [];
      // Fail closed: config change takes the server out of the turn catalogue.
      row.enabled = false;
      const live = this.live.get(id);
      if (live) {
        await live.close().catch(() => undefined);
        this.live.delete(id);
      }
    }
    if (typeof input.enabled === "boolean") {
      if (input.enabled && !row.lastTestOkAt) {
        throw Object.assign(
          new Error("envoyhome.mcp_not_ready: Test connection before enable"),
          { code: "envoyhome.mcp_not_ready" },
        );
      }
      row.enabled = input.enabled;
    }
    row.updatedAt = now;
    const sanitizedEnv =
      input.env !== undefined ? this.sanitizeEnvMap(input.env) : undefined;
    await this.writeSecrets(id, {
      ...(sanitizedEnv !== undefined ? { env: sanitizedEnv } : {}),
      ...(input.authToken !== undefined ? { authToken: input.authToken } : {}),
    });
    await this.persist();
    return this.toPublic(row, await this.hasSecretFiles(id));
  }

  getServerLabel(id: string): string | undefined {
    return this.store.servers.find((s) => s.id === id)?.label;
  }

  async setEnabled(id: string, enabled: boolean): Promise<McpServerRecord> {
    const row = this.store.servers.find((s) => s.id === id);
    if (!row) {
      throw Object.assign(new Error("envoyhome.not_found: mcp server"), {
        code: "envoyhome.not_found",
      });
    }
    if (enabled && !row.lastTestOkAt) {
      throw Object.assign(
        new Error("envoyhome.mcp_not_ready: Test connection before enable"),
        { code: "envoyhome.mcp_not_ready" },
      );
    }
    row.enabled = enabled;
    row.updatedAt = new Date().toISOString();
    if (!enabled) {
      const live = this.live.get(id);
      if (live) {
        await live.close().catch(() => undefined);
        this.live.delete(id);
      }
    }
    await this.persist();
    return this.toPublic(row, await this.hasSecretFiles(id));
  }

  async remove(id: string): Promise<{ ok: true }> {
    const idx = this.store.servers.findIndex((s) => s.id === id);
    if (idx < 0) {
      throw Object.assign(new Error("envoyhome.not_found: mcp server"), {
        code: "envoyhome.not_found",
      });
    }
    const live = this.live.get(id);
    if (live) {
      await live.close().catch(() => undefined);
      this.live.delete(id);
    }
    this.store.servers.splice(idx, 1);
    await rm(this.secretDir(id), { recursive: true, force: true });
    await this.persist();
    return { ok: true };
  }

  private async evictLive(id: string): Promise<void> {
    const live = this.live.get(id);
    if (!live) return;
    await live.close().catch(() => undefined);
    this.live.delete(id);
  }

  async test(id: string): Promise<McpListToolsResult> {
    const row = this.store.servers.find((s) => s.id === id);
    if (!row) {
      throw Object.assign(new Error("envoyhome.not_found: mcp server"), {
        code: "envoyhome.not_found",
      });
    }
    // Drop any prior live session before opening a probe session (stdio orphans).
    await this.evictLive(id);
    const t0 = Date.now();
    try {
      if (row.transport === "http" || row.transport === "sse") {
        await assertSafeMcpUrlResolved(String(row.url ?? ""));
      }
      const secrets = await this.readSecrets(id);
      const session = await this.sessionFactory(row, secrets);
      const tools = await session.listTools();
      await session.close().catch(() => undefined);
      row.cachedTools = tools.slice(0, MCP_MAX_TOOLS_PER_SERVER);
      row.lastTestOkAt = new Date().toISOString();
      row.lastTestError = null;
      row.updatedAt = row.lastTestOkAt;
      await this.persist();
      return { ok: true, tools: row.cachedTools, latencyMs: Date.now() - t0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      row.lastTestError = message.slice(0, 500);
      row.lastTestOkAt = null;
      row.cachedTools = [];
      row.enabled = false;
      row.updatedAt = new Date().toISOString();
      await this.persist();
      return {
        ok: false,
        tools: [],
        latencyMs: Date.now() - t0,
        error: message.slice(0, 500),
      };
    }
  }

  async callTool(catalogueName: string, args: Record<string, unknown>): Promise<string> {
    const parsed = parseMcpCatalogueToolName(catalogueName);
    if (!parsed) {
      throw Object.assign(new Error("envoyhome.bad_params: not an mcp tool"), {
        code: "envoyhome.bad_params",
      });
    }
    const row = this.store.servers.find((s) => s.id === parsed.serverId);
    if (!row || !row.enabled || !row.lastTestOkAt) {
      throw Object.assign(new Error("envoyhome.tool_unavailable: mcp server not ready"), {
        code: "envoyhome.tool_unavailable",
      });
    }
    const meta = row.cachedTools.find((t) => t.name === catalogueName);
    const mcpName = meta?.mcpName ?? parsed.toolName;
    let session = this.live.get(row.id);
    if (!session) {
      const secrets = await this.readSecrets(row.id);
      session = await this.sessionFactory(row, secrets);
      this.live.set(row.id, session);
    }
    return session.callTool(mcpName, args);
  }

  async shutdown(): Promise<void> {
    for (const [id, s] of this.live) {
      await s.close().catch(() => undefined);
      this.live.delete(id);
    }
  }
}
