/** TCP reachability probe for mqtt(s):// broker URLs (Design §5.3.6 health). */

import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

export function parseMqttBrokerUrl(raw: string): {
  host: string;
  port: number;
  tls: boolean;
} | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `mqtt://${text}`;
    const u = new URL(withScheme);
    const proto = u.protocol.replace(/:$/, "").toLowerCase();
    const tls = proto === "mqtts" || proto === "ssl" || proto === "tls";
    const host = u.hostname;
    if (!host) return null;
    const port = u.port
      ? Number(u.port)
      : tls
        ? 8883
        : 1883;
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
    return { host, port, tls };
  } catch {
    return null;
  }
}

/** Best-effort TCP/TLS connect — not a full MQTT handshake. */
export async function probeMqttBroker(
  brokerUrl: string,
  timeoutMs = 4000,
): Promise<{ ok: boolean; detail: string }> {
  const parsed = parseMqttBrokerUrl(brokerUrl);
  if (!parsed) {
    return { ok: false, detail: "invalid broker URL" };
  }
  const { host, port, tls } = parsed;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, detail });
    };
    const socket = tls
      ? tlsConnect({ host, port, servername: host, rejectUnauthorized: false })
      : netConnect({ host, port });
    const timer = setTimeout(() => finish(false, `timeout connecting to ${host}:${port}`), timeoutMs);
    if (tls) {
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        finish(true, `reachable ${host}:${port} (tls)`);
      });
    } else {
      socket.once("connect", () => {
        clearTimeout(timer);
        finish(true, `reachable ${host}:${port}`);
      });
    }
    socket.once("error", (err) => {
      clearTimeout(timer);
      finish(false, err instanceof Error ? err.message : String(err));
    });
  });
}
