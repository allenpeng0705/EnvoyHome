#!/usr/bin/env node
import { DEMO_MQTT_PANEL_PORT, DEMO_MQTT_PORT } from "./demo-devices.js";
import { startFakeMqttServer } from "./server.js";

const mqttPort = Number(process.env.ENVOYHOME_FAKE_MQTT_PORT || DEMO_MQTT_PORT);
const panelPort = Number(process.env.ENVOYHOME_FAKE_MQTT_PANEL_PORT || DEMO_MQTT_PANEL_PORT);

const handle = await startFakeMqttServer({ mqttPort, panelPort });
console.log(`[fake-mqtt] broker ${handle.brokerUrl}`);
console.log(`[fake-mqtt] panel  ${handle.panelUrl}`);

const shutdown = async () => {
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
