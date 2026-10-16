import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { DEMO_DEFAULT_PORT, DEMO_TOKEN, demoBaseUrl, demoPanelUrl } from "./demo-entities.js";
import { panelHtml } from "./panel-html.js";
import { FakeHaStore } from "./store.js";

export interface FakeHaServerOptions {
  port?: number;
  token?: string;
  host?: string;
  store?: FakeHaStore;
}

export interface FakeHaHandle {
  port: number;
  token: string;
  baseUrl: string;
  panelUrl: string;
  store: FakeHaStore;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(raw);
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { message: "Unauthorized" });
}

export async function startFakeHaServer(opts: FakeHaServerOptions = {}): Promise<FakeHaHandle> {
  const port = opts.port ?? DEMO_DEFAULT_PORT;
  const token = opts.token ?? DEMO_TOKEN;
  const host = opts.host ?? "127.0.0.1";
  const store = opts.store ?? new FakeHaStore();
  store.startAmbientTicks();

  const server: Server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);

      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        res.end();
        return;
      }

      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = panelHtml();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      const auth = req.headers.authorization ?? "";
      const okAuth = auth === `Bearer ${token}`;

      if (url.pathname.startsWith("/api")) {
        if (!okAuth) {
          unauthorized(res);
          return;
        }

        if (method === "GET" && url.pathname === "/api/") {
          sendJson(res, 200, { message: "API running." });
          return;
        }
        if (method === "GET" && url.pathname === "/api/states") {
          sendJson(res, 200, store.list());
          return;
        }
        const stateMatch = /^\/api\/states\/(.+)$/.exec(url.pathname);
        if (method === "GET" && stateMatch) {
          const id = decodeURIComponent(stateMatch[1]!);
          const row = store.get(id);
          if (!row) {
            sendJson(res, 404, { message: "Entity not found." });
            return;
          }
          sendJson(res, 200, row);
          return;
        }
        if (method === "GET" && url.pathname === "/api/services") {
          sendJson(res, 200, store.servicesCatalog());
          return;
        }
        const svcMatch = /^\/api\/services\/([^/]+)\/([^/]+)$/.exec(url.pathname);
        if (method === "POST" && svcMatch) {
          const domain = decodeURIComponent(svcMatch[1]!);
          const service = decodeURIComponent(svcMatch[2]!);
          let data: Record<string, unknown> = {};
          try {
            const raw = await readBody(req);
            if (raw.trim()) data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            sendJson(res, 400, { message: "Invalid JSON" });
            return;
          }
          const affected = store.callService(domain, service, data);
          sendJson(res, 200, affected);
          return;
        }

        sendJson(res, 404, { message: "Not found" });
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } catch (err) {
      sendJson(res, 500, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const boundPort =
    typeof addr === "object" && addr && typeof addr.port === "number" ? addr.port : port;

  return {
    port: boundPort,
    token,
    baseUrl: demoBaseUrl(boundPort),
    panelUrl: demoPanelUrl(boundPort),
    store,
    close: () =>
      new Promise((resolve, reject) => {
        store.stopAmbientTicks();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
