import { DEMO_MQTT_DEVICES, type DemoMqttDevice } from "./demo-devices.js";

export class FakeMqttStore {
  private readonly byTopic = new Map<string, DemoMqttDevice>();

  constructor(seeds: readonly DemoMqttDevice[] = DEMO_MQTT_DEVICES) {
    for (const d of seeds) {
      this.byTopic.set(d.topic, { ...d });
    }
  }

  list(): DemoMqttDevice[] {
    return [...this.byTopic.values()].map((d) => ({ ...d }));
  }

  get(topic: string): DemoMqttDevice | undefined {
    const row = this.byTopic.get(topic);
    return row ? { ...row } : undefined;
  }

  /** Apply a published payload; returns true if a known demo topic changed. */
  applyPublish(topic: string, payload: string): boolean {
    const row = this.byTopic.get(topic);
    if (!row || row.readOnly) return false;
    const raw = payload.trim();
    let next = raw;
    if (row.class === "climate") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 5 || n > 35) return false;
      next = String(Math.round(n * 2) / 2);
    } else {
      const upper = raw.toUpperCase();
      if (upper === "ON" || upper === "1" || upper === "TRUE") next = "ON";
      else if (upper === "OFF" || upper === "0" || upper === "FALSE") next = "OFF";
    }
    if (row.state === next) return false;
    this.byTopic.set(topic, { ...row, state: next });
    return true;
  }

  setState(topic: string, state: string): boolean {
    const row = this.byTopic.get(topic);
    if (!row || row.readOnly) return false;
    if (row.class === "climate") {
      const n = Number(state);
      if (!Number.isFinite(n) || n < 5 || n > 35) return false;
      this.byTopic.set(topic, { ...row, state: String(Math.round(n * 2) / 2) });
      return true;
    }
    this.byTopic.set(topic, { ...row, state });
    return true;
  }
}
