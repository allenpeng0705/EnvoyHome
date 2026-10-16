import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import aedes from "aedes";
import {
  DEMO_MQTT_PANEL_PORT,
  DEMO_MQTT_PASSWORD,
  DEMO_MQTT_PORT,
  DEMO_MQTT_USERNAME,
  demoMqttBrokerUrl,
  demoMqttPanelUrl,
} from "./demo-devices.js";
import { panelHtml } from "./panel-html.js";
import { FakeMqttStore } from "./store.js";

export interface FakeMqttServerOptions {
  mqttPort?: number;
  panelPort?: number;
  host?: string;
  store?: FakeMqttStore;
  username?: string;
  password?: string;
}

export interface FakeMqttHandle {
  mqttPort: number;
  panelPort: number;
  brokerUrl: string;
  panelUrl: string;
  username: string;
  password: string;
  store: FakeMqttStore;
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(raw);
}

export async function startFakeMqttServer(
  opts: FakeMqttServerOptions = {},
): Promise<FakeMqttHandle> {
  const mqttPort = opts.mqttPort ?? DEMO_MQTT_PORT;
  const panelPort = opts.panelPort ?? DEMO_MQTT_PANEL_PORT;
  const host = opts.host ?? "127.0.0.1";
  const username = opts.username ?? DEMO_MQTT_USERNAME;
  const password = opts.password ?? DEMO_MQTT_PASSWORD;
  const store = opts.store ?? new FakeMqttStore();

  // aedes default export is a factory; typings expose a constructable class.
  type AedesBroker = {
    handle: (stream: import("node:net").Socket) => void;
    authenticate?: (
      client: unknown,
      user: string | undefined,
      pass: Buffer | undefined,
      done: (err: Error | null, success: boolean) => void,
    ) => void;
    on(event: "publish", cb: (packet: { topic?: string; payload?: Buffer | string }, client: unknown) => void): void;
    publish(
      packet: {
        cmd: "publish";
        topic: string;
        payload: Buffer;
        qos: 0 | 1 | 2;
        retain: boolean;
        dup: boolean;
      },
      cb: () => void,
    ): void;
    close(cb: () => void): void;
  };
  const broker = (aedes as unknown as () => AedesBroker)();
  broker.authenticate = (_client, user, pass, done) => {
    const u = user ?? "";
    const p = pass ? pass.toString("utf8") : "";
    done(null, u === username && p === password);
  };
  broker.on("publish", (packet, _client) => {
    if (!packet?.topic || packet.topic.startsWith("$SYS/")) return;
    const payload =
      typeof packet.payload === "string"
        ? packet.payload
        : packet.payload?.toString?.() ?? String(packet.payload ?? "");
    store.applyPublish(packet.topic, payload);
  });

  const mqttServer: NetServer = createNetServer((stream) => broker.handle(stream));
  const boundMqttPort = await new Promise<number>((resolve, reject) => {
    mqttServer.once("error", reject);
    mqttServer.listen(mqttPort, host, () => {
      mqttServer.off("error", reject);
      const addr = mqttServer.address();
      resolve(typeof addr === "object" && addr ? addr.port : mqttPort);
    });
  });

  const publishFromPanel = (topic: string, payload: string) => {
    store.applyPublish(topic, payload);
    broker.publish(
      {
        cmd: "publish",
        topic,
        payload: Buffer.from(payload, "utf8"),
        qos: 0,
        retain: false,
        dup: false,
      },
      () => undefined,
    );
  };

  // Seed retained? skip — panel + first publish is enough for demo.

  const httpServer = createHttpServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${host}:${panelPort}`);

      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        });
        res.end();
        return;
      }

      if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          panelHtml({
            brokerUrl: demoMqttBrokerUrl(boundMqttPort),
            username,
            password,
          }),
        );
        return;
      }

      if (method === "GET" && url.pathname === "/api/") {
        sendJson(res, 200, { ok: true, brokerUrl: demoMqttBrokerUrl(mqttPort) });
        return;
      }

      if (method === "GET" && url.pathname === "/api/devices") {
        sendJson(res, 200, store.list());
        return;
      }

      if (method === "POST" && url.pathname === "/api/set") {
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { topic?: string; payload?: string };
        const topic = String(body.topic ?? "");
        const payload = String(body.payload ?? "");
        if (!topic || !store.get(topic)) {
          sendJson(res, 404, { message: "unknown topic" });
          return;
        }
        publishFromPanel(topic, payload);
        sendJson(res, 200, { ok: true, device: store.get(topic) });
        return;
      }

      sendJson(res, 404, { message: "not found" });
    } catch (err) {
      sendJson(res, 500, { message: err instanceof Error ? err.message : String(err) });
    }
  });

  const boundPanelPort = await new Promise<number>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(panelPort, host, () => {
      httpServer.off("error", reject);
      const addr = httpServer.address();
      resolve(typeof addr === "object" && addr ? addr.port : panelPort);
    });
  });

  return {
    mqttPort: boundMqttPort,
    panelPort: boundPanelPort,
    brokerUrl: demoMqttBrokerUrl(boundMqttPort),
    panelUrl: demoMqttPanelUrl(boundPanelPort),
    username,
    password,
    store,
    close: async () => {
      await new Promise<void>((resolve) => mqttServer.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await new Promise<void>((resolve) => broker.close(() => resolve()));
    },
  };
}
