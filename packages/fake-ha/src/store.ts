import { DEMO_ENTITIES, type DemoEntitySeed } from "./demo-entities.js";

export interface HaStateRow {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

function domainOf(entityId: string): string {
  return entityId.split(".")[0] ?? "";
}

export class FakeHaStore {
  private readonly states = new Map<string, HaStateRow>();
  private readonly listeners = new Set<() => void>();
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  constructor(seeds: readonly DemoEntitySeed[] = DEMO_ENTITIES) {
    const now = new Date().toISOString();
    for (const s of seeds) {
      this.states.set(s.entity_id, {
        entity_id: s.entity_id,
        state: s.state,
        attributes: { ...s.attributes },
        last_changed: now,
        last_updated: now,
      });
    }
  }

  /** Soft live sensors: temperature drifts; motion auto-clears. */
  startAmbientTicks(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      const temp = this.states.get("sensor.outdoor_temperature");
      if (temp) {
        const cur = Number(temp.state);
        if (Number.isFinite(cur)) {
          const next = Math.round((cur + (Math.random() - 0.5) * 0.3) * 10) / 10;
          this.setState(temp.entity_id, String(next));
        }
      }
      const motion = this.states.get("binary_sensor.hallway_motion");
      if (motion && motion.state === "on") {
        const since = Date.parse(motion.last_changed);
        if (Number.isFinite(since) && Date.now() - since > 8_000) {
          this.setState(motion.entity_id, "off");
        }
      }
    }, 2_500);
  }

  stopAmbientTicks(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  list(): HaStateRow[] {
    return [...this.states.values()].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  }

  get(entityId: string): HaStateRow | undefined {
    return this.states.get(entityId);
  }

  setState(entityId: string, state: string, attrs?: Record<string, unknown>): HaStateRow | undefined {
    const prev = this.states.get(entityId);
    if (!prev) return undefined;
    const now = new Date().toISOString();
    const next: HaStateRow = {
      ...prev,
      state,
      attributes: attrs ? { ...prev.attributes, ...attrs } : prev.attributes,
      last_changed: prev.state === state ? prev.last_changed : now,
      last_updated: now,
    };
    this.states.set(entityId, next);
    this.notify();
    return next;
  }

  callService(domain: string, service: string, data: Record<string, unknown>): HaStateRow[] {
    const raw = data.entity_id;
    const ids = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
    const affected: HaStateRow[] = [];

    // binary_sensor "simulate" from panel: treat as homeassistant.toggle via switch-like path
    if (domain === "binary_sensor" && service === "toggle") {
      for (const entityId of ids) {
        const row = this.states.get(entityId);
        if (!row) continue;
        const updated = this.setState(entityId, row.state === "on" ? "off" : "on");
        if (updated) affected.push(updated);
      }
      return affected;
    }

    for (const entityId of ids) {
      if (!entityId.startsWith(`${domain}.`)) continue;
      const row = this.states.get(entityId);
      if (!row) continue;

      if (domain === "light" || domain === "switch") {
        if (service === "turn_on") {
          const brightness =
            typeof data.brightness === "number"
              ? data.brightness
              : (row.attributes.brightness as number) || 200;
          const updated = this.setState(entityId, "on", { brightness });
          if (updated) affected.push(updated);
        } else if (service === "turn_off") {
          const updated = this.setState(entityId, "off");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const updated = this.setState(entityId, row.state === "on" ? "off" : "on");
          if (updated) affected.push(updated);
        }
      } else if (domain === "fan") {
        if (service === "turn_on") {
          const percentage =
            typeof data.percentage === "number"
              ? data.percentage
              : (row.attributes.percentage as number) || 50;
          const updated = this.setState(entityId, "on", { percentage });
          if (updated) affected.push(updated);
        } else if (service === "turn_off") {
          const updated = this.setState(entityId, "off");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const updated = this.setState(entityId, row.state === "on" ? "off" : "on");
          if (updated) affected.push(updated);
        } else if (service === "set_percentage" && typeof data.percentage === "number") {
          const updated = this.setState(entityId, data.percentage > 0 ? "on" : "off", {
            percentage: data.percentage,
          });
          if (updated) affected.push(updated);
        }
      } else if (domain === "lock") {
        if (service === "lock") {
          const updated = this.setState(entityId, "locked");
          if (updated) affected.push(updated);
        } else if (service === "unlock") {
          const updated = this.setState(entityId, "unlocked");
          if (updated) affected.push(updated);
        }
      } else if (domain === "climate") {
        if (service === "set_temperature" && typeof data.temperature === "number") {
          const mode =
            typeof data.hvac_mode === "string" ? data.hvac_mode : row.state === "off" ? "heat" : row.state;
          const updated = this.setState(entityId, mode === "off" ? row.state : mode, {
            temperature: data.temperature,
          });
          if (updated) affected.push(updated);
        } else if (service === "set_hvac_mode" && typeof data.hvac_mode === "string") {
          const updated = this.setState(entityId, data.hvac_mode);
          if (updated) affected.push(updated);
        } else if (service === "turn_off") {
          const updated = this.setState(entityId, "off");
          if (updated) affected.push(updated);
        } else if (service === "turn_on") {
          const updated = this.setState(entityId, "heat");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const updated = this.setState(entityId, row.state === "off" ? "heat" : "off");
          if (updated) affected.push(updated);
        }
      } else if (domain === "cover") {
        if (service === "open_cover") {
          const updated = this.setState(entityId, "open", { current_position: 100 });
          if (updated) affected.push(updated);
        } else if (service === "close_cover") {
          const updated = this.setState(entityId, "closed", { current_position: 0 });
          if (updated) affected.push(updated);
        } else if (service === "stop_cover") {
          const updated = this.setState(entityId, row.state === "open" ? "open" : "closed");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const open = row.state === "open" || row.state === "opening";
          const updated = this.setState(entityId, open ? "closed" : "open", {
            current_position: open ? 0 : 100,
          });
          if (updated) affected.push(updated);
        } else if (service === "set_cover_position" && typeof data.position === "number") {
          const pos = Math.max(0, Math.min(100, data.position));
          const updated = this.setState(entityId, pos <= 0 ? "closed" : "open", {
            current_position: pos,
          });
          if (updated) affected.push(updated);
        }
      } else if (domain === "valve") {
        if (service === "open_valve" || service === "turn_on") {
          const updated = this.setState(entityId, "open");
          if (updated) affected.push(updated);
        } else if (service === "close_valve" || service === "turn_off") {
          const updated = this.setState(entityId, "closed");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const updated = this.setState(entityId, row.state === "open" ? "closed" : "open");
          if (updated) affected.push(updated);
        }
      } else if (domain === "alarm_control_panel") {
        if (service === "alarm_disarm") {
          const updated = this.setState(entityId, "disarmed");
          if (updated) affected.push(updated);
        } else if (service === "alarm_arm_home" || service === "alarm_arm_away") {
          const updated = this.setState(
            entityId,
            service === "alarm_arm_away" ? "armed_away" : "armed_home",
          );
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const armed = row.state.startsWith("armed");
          const updated = this.setState(entityId, armed ? "disarmed" : "armed_home");
          if (updated) affected.push(updated);
        }
      } else if (domain === "media_player") {
        if (service === "media_play" || service === "turn_on") {
          const updated = this.setState(entityId, "playing");
          if (updated) affected.push(updated);
        } else if (service === "media_pause" || service === "media_stop") {
          const updated = this.setState(entityId, service === "media_stop" ? "idle" : "paused");
          if (updated) affected.push(updated);
        } else if (service === "turn_off") {
          const updated = this.setState(entityId, "off");
          if (updated) affected.push(updated);
        } else if (service === "toggle") {
          const playing = row.state === "playing";
          const updated = this.setState(entityId, playing ? "paused" : "playing");
          if (updated) affected.push(updated);
        } else if (service === "volume_set" && typeof data.volume_level === "number") {
          const updated = this.setState(entityId, row.state, {
            volume_level: data.volume_level,
          });
          if (updated) affected.push(updated);
        }
      } else if (domain === "camera") {
        // read-mostly; allow a soft "on/recording" flip for demos
        if (service === "turn_on") {
          const updated = this.setState(entityId, "recording");
          if (updated) affected.push(updated);
        } else if (service === "turn_off") {
          const updated = this.setState(entityId, "idle");
          if (updated) affected.push(updated);
        }
      }
    }
    return affected;
  }

  servicesCatalog(): Array<{ domain: string; services: Record<string, Record<string, never>> }> {
    return [
      { domain: "light", services: { turn_on: {}, turn_off: {}, toggle: {} } },
      { domain: "switch", services: { turn_on: {}, turn_off: {}, toggle: {} } },
      { domain: "fan", services: { turn_on: {}, turn_off: {}, toggle: {}, set_percentage: {} } },
      {
        domain: "lock",
        services: { lock: {}, unlock: {} },
      },
      {
        domain: "climate",
        services: { set_temperature: {}, set_hvac_mode: {}, turn_on: {}, turn_off: {}, toggle: {} },
      },
      {
        domain: "cover",
        services: {
          open_cover: {},
          close_cover: {},
          stop_cover: {},
          toggle: {},
          set_cover_position: {},
        },
      },
      {
        domain: "valve",
        services: { open_valve: {}, close_valve: {}, turn_on: {}, turn_off: {}, toggle: {} },
      },
      {
        domain: "alarm_control_panel",
        services: {
          alarm_disarm: {},
          alarm_arm_home: {},
          alarm_arm_away: {},
          toggle: {},
        },
      },
      {
        domain: "media_player",
        services: {
          media_play: {},
          media_pause: {},
          media_stop: {},
          turn_on: {},
          turn_off: {},
          toggle: {},
          volume_set: {},
        },
      },
      { domain: "camera", services: { turn_on: {}, turn_off: {} } },
      { domain: "binary_sensor", services: { toggle: {} } },
    ];
  }
}

export { domainOf };
