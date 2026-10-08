import type { SettingsViewId } from "./lib/rpc-types.js";
import { SmarthomeView } from "./views/smarthome.js";

export const NAV_VIEWS: SettingsViewId[] = [
  "accounts",
  "channels",
  "providers",
  "approvals",
  "memory",
  "smarthome",
  "doctor",
  "advanced",
];

export function renderSmarthomeStub(): string {
  return SmarthomeView({ sources: [], note: "Connect MQTT or Home Assistant channels to bind objects" });
}
