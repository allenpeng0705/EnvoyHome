// Seed inventory for the local demo MQTT bus (Design §5.7 — integrate, don't become a broker).
// Topics are distinct from fake-ha entity ids so both demos can run together.

export const DEMO_MQTT_PORT = 18883;
export const DEMO_MQTT_PANEL_PORT = 18884;
/** Demo broker credentials (lab only — same idea as fake-ha DEMO_TOKEN). */
export const DEMO_MQTT_USERNAME = "envoyhome";
export const DEMO_MQTT_PASSWORD = "demo";

export type DemoObjectClass =
  | "light"
  | "switch"
  | "climate"
  | "sensor"
  | "other";

export interface DemoMqttDevice {
  /** Command + state topic (same topic for demo simplicity). */
  topic: string;
  state: "ON" | "OFF" | string;
  displayName: string;
  class: DemoObjectClass;
  /** When true, panel is display-only. */
  readOnly?: boolean;
}

export const DEMO_MQTT_DEVICES: readonly DemoMqttDevice[] = [
  {
    topic: "envoyhome/demo/switch/mqtt_desk",
    state: "OFF",
    displayName: "MQTT Desk lamp / MQTT台灯",
    class: "switch",
  },
  {
    topic: "envoyhome/demo/light/mqtt_porch",
    state: "OFF",
    displayName: "MQTT Porch light / MQTT廊灯",
    class: "light",
  },
  {
    topic: "envoyhome/demo/switch/mqtt_fan",
    state: "OFF",
    displayName: "MQTT Fan / MQTT风扇",
    class: "switch",
  },
  {
    /** Writable setpoint — publish a number (°C); not a read-only sensor. */
    topic: "envoyhome/demo/climate/mqtt_thermostat",
    state: "22",
    displayName: "MQTT Thermostat / MQTT温度",
    class: "climate",
  },
];

export function demoMqttBrokerUrl(port = DEMO_MQTT_PORT): string {
  return `mqtt://127.0.0.1:${port}`;
}

export function demoMqttPanelUrl(port = DEMO_MQTT_PANEL_PORT): string {
  return `http://127.0.0.1:${port}/`;
}
