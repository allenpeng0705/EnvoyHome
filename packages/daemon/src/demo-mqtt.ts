// Local demo MQTT lifecycle — Design §5.7 (demo only; real brokers remain first-class).
// Runs on ports distinct from fake-ha so both demos can be active together.

import {
  DEMO_MQTT_DEVICES,
  DEMO_MQTT_PANEL_PORT,
  DEMO_MQTT_PASSWORD,
  DEMO_MQTT_PORT,
  DEMO_MQTT_USERNAME,
  demoMqttBrokerUrl,
  demoMqttPanelUrl,
  startFakeMqttServer,
  type FakeMqttHandle,
} from "@envoyhome/fake-mqtt";
import type { ChannelService } from "./channels/service.js";
import {
  configPointsAtDemoMqtt,
  removeDemoMqttRegistry,
} from "./demo-cleanup.js";

export interface DemoMqttStatus {
  running: boolean;
  brokerUrl?: string;
  panelUrl?: string;
  username?: string;
  password?: string;
  mqttPort?: number;
  panelPort?: number;
  /** True when we attached to an already-running `pnpm fake:mqtt`. */
  external?: boolean;
}

export class DemoMqttService {
  private handle: FakeMqttHandle | undefined;
  private external = false;

  status(): DemoMqttStatus {
    if (!this.handle) return { running: false };
    return {
      running: true,
      brokerUrl: this.handle.brokerUrl,
      panelUrl: this.handle.panelUrl,
      username: this.handle.username,
      password: this.handle.password,
      mqttPort: this.handle.mqttPort,
      panelPort: this.handle.panelPort,
      ...(this.external ? { external: true } : {}),
    };
  }

  async ensureStarted(
    mqttPort = DEMO_MQTT_PORT,
    panelPort = DEMO_MQTT_PANEL_PORT,
  ): Promise<FakeMqttHandle> {
    if (this.handle) return this.handle;
    try {
      this.handle = await startFakeMqttServer({ mqttPort, panelPort });
      this.external = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/EADDRINUSE/.test(msg)) throw err;
      const brokerUrl = demoMqttBrokerUrl(mqttPort);
      const panelUrl = demoMqttPanelUrl(panelPort);
      const probe = await fetch(`${panelUrl}api/`).catch(() => undefined);
      if (!probe?.ok) {
        throw new Error(
          `envoyhome.tool_unavailable: demo MQTT port ${mqttPort}/${panelPort} is busy but not responding as EnvoyHome fake-mqtt`,
        );
      }
      this.external = true;
      this.handle = {
        mqttPort,
        panelPort,
        brokerUrl,
        panelUrl,
        username: DEMO_MQTT_USERNAME,
        password: DEMO_MQTT_PASSWORD,
        store: undefined as unknown as FakeMqttHandle["store"],
        close: async () => {
          this.handle = undefined;
          this.external = false;
        },
      };
    }
    return this.handle;
  }

  /**
   * Stop the in-process broker. When `channels` is provided and mqtt still
   * points at this demo **by URL**, remove demo objects, clear the demo flag,
   * and disable the channel. Sticky `demo: true` alone is not enough.
   */
  async stop(channels?: ChannelService): Promise<void> {
    if (!this.handle && !channels) return;
    const h = this.handle;
    const wasExternal = this.external;
    this.handle = undefined;
    this.external = false;
    if (h && !wasExternal) await h.close().catch(() => undefined);
    if (!channels) return;
    let cfg: Record<string, unknown>;
    try {
      cfg = await channels.peekChannelConfig("mqtt");
    } catch {
      return;
    }
    if (!configPointsAtDemoMqtt(cfg)) return;
    await removeDemoMqttRegistry(channels.objects);
    await channels.setChannelConfig("mqtt", { demo: "" }).catch(() => undefined);
    await channels.disableChannel("mqtt").catch(() => undefined);
  }

  /**
   * Start demo MQTT (if needed), point the mqtt channel at it, enable,
   * register demo topics, and bind them to the account.
   */
  async useDemoMqtt(input: {
    channels: ChannelService;
    accountId: string;
  }): Promise<DemoMqttStatus & { bound: string[] }> {
    const handle = await this.ensureStarted();
    await input.channels.setChannelConfig(
      "mqtt",
      {
        brokerUrl: handle.brokerUrl,
        demo: true,
      },
      {
        username: handle.username,
        password: handle.password,
      },
    );
    await input.channels.enableChannel("mqtt");

    const channelAccount = input.channels.loader.getChannelStatus("mqtt").channelAccount;
    const descriptors = DEMO_MQTT_DEVICES.map((d) => ({
      sourceId: d.topic,
      displayName: d.displayName,
      class: d.class,
    }));
    await input.channels.objects.registerSources("mqtt", channelAccount, descriptors);

    const bound: string[] = [];
    for (const d of DEMO_MQTT_DEVICES) {
      await input.channels.objects.setSourceBinding({
        channel: "mqtt",
        channelAccount,
        sourceId: d.topic,
        accountId: input.accountId,
        class: d.class,
        shared: false,
        neverUnattended: false,
        displayName: d.displayName,
        actuationAllowList: d.readOnly ? [] : [d.topic],
      });
      bound.push(d.topic);
    }

    return {
      ...this.status(),
      bound,
    };
  }
}