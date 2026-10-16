// Seed inventory for the local demo home (Design §5.7 — enhance HA, don't become one).
// Covers lights plus security / climate / covers / sensors for richer Approvals demos.

export const DEMO_TOKEN = "envoyhome-demo";
export const DEMO_DEFAULT_PORT = 18123;

export type DemoObjectClass =
  | "light"
  | "lock"
  | "climate"
  | "switch"
  | "sensor"
  | "garage"
  | "gate"
  | "valve"
  | "alarm"
  | "camera"
  | "presence"
  | "other";

export interface DemoEntitySeed {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  /** EnvoyHome object class for bind seeding. */
  class: DemoObjectClass;
  /** Panel section label. */
  section: "lights" | "climate" | "covers" | "security" | "sensors" | "media";
  /** When true, panel is display-only (no click actuation). */
  readOnly?: boolean;
}

export const DEMO_ENTITIES: readonly DemoEntitySeed[] = [
  /* ---- Lights / switches ------------------------------------------------ */
  {
    entity_id: "light.living_room",
    state: "off",
    attributes: { friendly_name: "Living room / 客厅", brightness: 180 },
    class: "light",
    section: "lights",
  },
  {
    entity_id: "light.kitchen",
    state: "on",
    attributes: { friendly_name: "Kitchen / 厨房", brightness: 220 },
    class: "light",
    section: "lights",
  },
  {
    entity_id: "light.bedroom",
    state: "off",
    attributes: { friendly_name: "Bedroom / 卧室", brightness: 120 },
    class: "light",
    section: "lights",
  },
  {
    entity_id: "switch.desk_lamp",
    state: "off",
    attributes: { friendly_name: "Desk lamp" },
    class: "switch",
    section: "lights",
  },
  {
    entity_id: "fan.ceiling",
    state: "off",
    attributes: { friendly_name: "Ceiling fan", percentage: 50 },
    class: "switch",
    section: "lights",
  },

  /* ---- Climate ---------------------------------------------------------- */
  {
    entity_id: "climate.hallway",
    state: "heat",
    attributes: {
      friendly_name: "Hallway thermostat",
      temperature: 21,
      current_temperature: 20.5,
      hvac_modes: ["off", "heat", "cool"],
      unit_of_measurement: "°C",
    },
    class: "climate",
    section: "climate",
  },

  /* ---- Covers / garage / gate ------------------------------------------- */
  {
    entity_id: "cover.living_blinds",
    state: "open",
    attributes: { friendly_name: "Living blinds", current_position: 100 },
    class: "other",
    section: "covers",
  },
  {
    entity_id: "cover.garage_door",
    state: "closed",
    attributes: { friendly_name: "Garage door", device_class: "garage" },
    class: "garage",
    section: "covers",
  },
  {
    entity_id: "cover.garden_gate",
    state: "closed",
    attributes: { friendly_name: "Garden gate", device_class: "gate" },
    class: "gate",
    section: "covers",
  },
  {
    entity_id: "valve.irrigation",
    state: "closed",
    attributes: { friendly_name: "Garden valve" },
    class: "valve",
    section: "covers",
  },

  /* ---- Security --------------------------------------------------------- */
  {
    entity_id: "lock.front_door",
    state: "locked",
    attributes: { friendly_name: "Front door" },
    class: "lock",
    section: "security",
  },
  {
    entity_id: "alarm_control_panel.home",
    state: "disarmed",
    attributes: {
      friendly_name: "Home alarm",
      supported_features: 3,
      code_arm_required: false,
    },
    class: "alarm",
    section: "security",
  },
  {
    entity_id: "camera.porch",
    state: "idle",
    attributes: { friendly_name: "Porch camera", entity_picture: "" },
    class: "camera",
    section: "security",
    readOnly: true,
  },

  /* ---- Sensors / presence ----------------------------------------------- */
  {
    entity_id: "sensor.outdoor_temperature",
    state: "18.4",
    attributes: {
      friendly_name: "Outdoor temp",
      unit_of_measurement: "°C",
      device_class: "temperature",
    },
    class: "sensor",
    section: "sensors",
    readOnly: true,
  },
  {
    entity_id: "binary_sensor.hallway_motion",
    state: "off",
    attributes: {
      friendly_name: "Hallway motion",
      device_class: "motion",
    },
    class: "presence",
    section: "sensors",
  },
  {
    entity_id: "binary_sensor.front_door_contact",
    state: "off",
    attributes: {
      friendly_name: "Front door contact",
      device_class: "door",
    },
    class: "sensor",
    section: "sensors",
    readOnly: true,
  },

  /* ---- Media ------------------------------------------------------------ */
  {
    entity_id: "media_player.living_room",
    state: "idle",
    attributes: {
      friendly_name: "Living room speaker",
      volume_level: 0.4,
      media_title: "Demo playlist",
    },
    class: "other",
    section: "media",
  },
];

export const DEMO_SECTIONS: ReadonlyArray<{ id: DemoEntitySeed["section"]; label: string }> = [
  { id: "lights", label: "Lights & fans" },
  { id: "climate", label: "Climate" },
  { id: "covers", label: "Covers & garage" },
  { id: "security", label: "Security" },
  { id: "sensors", label: "Sensors" },
  { id: "media", label: "Media" },
];

export function demoPanelUrl(port = DEMO_DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}/`;
}

export function demoBaseUrl(port = DEMO_DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`;
}
