// Local demo Home Assistant lifecycle — Design §5.7 (demo only; real HA remains first-class).

import {
  DEMO_DEFAULT_PORT,
  DEMO_ENTITIES,
  DEMO_TOKEN,
  demoBaseUrl,
  demoPanelUrl,
  startFakeHaServer,
  type FakeHaHandle,
} from "@envoyhome/fake-ha";
import type { ChannelService } from "./channels/service.js";
import {
  configPointsAtDemoHa,
  removeDemoHaRegistry,
} from "./demo-cleanup.js";

export interface DemoHaStatus {
  running: boolean;
  baseUrl?: string;
  panelUrl?: string;
  token?: string;
  port?: number;
  /** True when we attached to an already-running `pnpm fake:ha`. */
  external?: boolean;
}

export class DemoHaService {
  private handle: FakeHaHandle | undefined;
  private external = false;

  status(): DemoHaStatus {
    if (!this.handle) return { running: false };
    return {
      running: true,
      baseUrl: this.handle.baseUrl,
      panelUrl: this.handle.panelUrl,
      token: this.handle.token,
      port: this.handle.port,
      ...(this.external ? { external: true } : {}),
    };
  }

  async ensureStarted(port = DEMO_DEFAULT_PORT): Promise<FakeHaHandle> {
    if (this.handle) return this.handle;
    try {
      this.handle = await startFakeHaServer({ port, token: DEMO_TOKEN });
      this.external = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/EADDRINUSE/.test(msg)) throw err;
      // Standalone `pnpm fake:ha` (or prior daemon) already owns the port.
      const baseUrl = demoBaseUrl(port);
      const probe = await fetch(`${baseUrl}/api/`, {
        headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
      }).catch(() => undefined);
      if (!probe?.ok) {
        throw new Error(
          `envoyhome.tool_unavailable: demo HA port ${port} is busy but not responding as EnvoyHome fake-ha`,
        );
      }
      this.external = true;
      this.handle = {
        port,
        token: DEMO_TOKEN,
        baseUrl,
        panelUrl: demoPanelUrl(port),
        store: undefined as unknown as FakeHaHandle["store"],
        close: async () => {
          this.handle = undefined;
          this.external = false;
        },
      };
    }
    return this.handle;
  }

  /**
   * Stop the in-process fake-ha. When `channels` is provided and homeassistant
   * still points at this demo **by URL**, remove demo objects, clear the demo
   * flag, and disable the channel. Sticky `demo: true` alone is not enough
   * (a real hub URL must not be cleaned on stop/shutdown).
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
      cfg = await channels.peekChannelConfig("homeassistant");
    } catch {
      return;
    }
    if (!configPointsAtDemoHa(cfg)) return;
    await removeDemoHaRegistry(channels.objects);
    await channels
      .setChannelConfig("homeassistant", { demo: "" })
      .catch(() => undefined);
    await channels.disableChannel("homeassistant").catch(() => undefined);
  }

  /**
   * Start demo HA (if needed), point the homeassistant channel at it, enable,
   * register demo sources, and bind them to the account.
   */
  async useDemoHa(input: {
    channels: ChannelService;
    accountId: string;
  }): Promise<DemoHaStatus & { bound: string[] }> {
    const handle = await this.ensureStarted();
    await input.channels.setChannelConfig(
      "homeassistant",
      {
        baseUrl: handle.baseUrl,
        demo: true,
      },
      { accessToken: handle.token },
    );
    await input.channels.enableChannel("homeassistant");

    const channelAccount =
      input.channels.loader.getChannelStatus("homeassistant").channelAccount;
    const descriptors = DEMO_ENTITIES.map((e) => ({
      sourceId: e.entity_id,
      displayName: String(e.attributes.friendly_name ?? e.entity_id),
      class: e.class,
    }));
    await input.channels.objects.registerSources("homeassistant", channelAccount, descriptors);

    const safetyNeverUnattended = new Set([
      "lock",
      "garage",
      "gate",
      "valve",
      "alarm",
    ]);
    const bound: string[] = [];
    for (const e of DEMO_ENTITIES) {
      await input.channels.objects.setSourceBinding({
        channel: "homeassistant",
        channelAccount,
        sourceId: e.entity_id,
        accountId: input.accountId,
        class: e.class,
        shared: false,
        neverUnattended: safetyNeverUnattended.has(e.class),
        displayName: String(e.attributes.friendly_name ?? e.entity_id),
      });
      bound.push(e.entity_id);
    }

    return {
      ...this.status(),
      bound,
    };
  }
}
