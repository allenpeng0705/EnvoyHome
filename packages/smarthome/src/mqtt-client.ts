// MQTT client — real broker I/O via mqtt.js (Design §5.7).

import mqtt, { type MqttClient as MqttJsClient } from "mqtt";

export interface MqttClientConfig {
  brokerUrl: string;
  username?: string;
  password?: string;
}

export interface MqttClient {
  subscribe(topic: string): Promise<void>;
  read(topic: string): Promise<{ topic: string; payload: string } | undefined>;
  publish(topic: string, payload: string): Promise<void>;
  close(): Promise<void>;
}

function connect(config: MqttClientConfig): Promise<MqttJsClient> {
  return new Promise((resolve, reject) => {
    const opts: mqtt.IClientOptions = {
      connectTimeout: 5_000,
      reconnectPeriod: 0,
    };
    if (config.username) opts.username = config.username;
    if (config.password) opts.password = config.password;
    const client = mqtt.connect(config.brokerUrl, opts);
    const onError = (err: Error) => {
      cleanup();
      client.end(true);
      reject(err);
    };
    const onConnect = () => {
      cleanup();
      resolve(client);
    };
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("error", onError);
    };
    client.on("connect", onConnect);
    client.on("error", onError);
  });
}

export function createMqttClient(config: MqttClientConfig): MqttClient {
  const cache = new Map<string, string>();
  let shared: Promise<MqttJsClient> | undefined;

  const getClient = () => {
    if (!shared) shared = connect(config);
    return shared;
  };

  return {
    async subscribe(topic) {
      if (!topic) throw new Error("topic required");
      const client = await getClient();
      await new Promise<void>((resolve, reject) => {
        client.subscribe(topic, { qos: 0 }, (err) => (err ? reject(err) : resolve()));
      });
      client.on("message", (t, payload) => {
        if (t === topic || mqttMatch(topic, t)) {
          cache.set(t, payload.toString("utf8"));
        }
      });
    },
    async read(topic) {
      if (!topic) throw new Error("topic required");
      if (cache.has(topic)) return { topic, payload: cache.get(topic)! };
      // One-shot subscribe + short wait for retained / live message.
      const client = await getClient();
      return await new Promise((resolve) => {
        const timer = setTimeout(() => {
          client.unsubscribe(topic);
          client.off("message", onMsg);
          resolve(cache.has(topic) ? { topic, payload: cache.get(topic)! } : undefined);
        }, 800);
        const onMsg = (t: string, payload: Buffer) => {
          if (t !== topic) return;
          cache.set(t, payload.toString("utf8"));
          clearTimeout(timer);
          client.unsubscribe(topic);
          client.off("message", onMsg);
          resolve({ topic: t, payload: cache.get(t)! });
        };
        client.on("message", onMsg);
        client.subscribe(topic, { qos: 0 });
      });
    },
    async publish(topic, payload) {
      if (!topic) throw new Error("topic required");
      const client = await getClient();
      await new Promise<void>((resolve, reject) => {
        client.publish(topic, payload, { qos: 0, retain: false }, (err) =>
          err ? reject(err) : resolve(),
        );
      });
      cache.set(topic, payload);
    },
    async close() {
      if (!shared) return;
      const client = await shared;
      shared = undefined;
      await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    },
  };
}

/** Minimal +/# MQTT filter match for cache keys. */
function mqttMatch(filter: string, topic: string): boolean {
  if (filter === topic) return true;
  const f = filter.split("/");
  const t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true;
    if (f[i] === "+") {
      if (i >= t.length) return false;
      continue;
    }
    if (f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}
