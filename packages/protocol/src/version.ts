// @envoyhome/protocol — version constants.
//
// Design §3.7 fixes exactly THREE version numbers on three axes. This file owns
// the wire axis and nothing else:
//
//   wire        protocolApiVersion   here, advertised by home.hello   (this file)
//   plugin      apiVersion           plugin manifest (channel/harness)
//   on-disk     stateSchemaVersion   daemon.json + migrations
//
// Rules (Design §3.7):
//   1. Additive change (new method, new optional field, widened enum) — NO bump.
//      Clients discover it through `home.hello.methods[]` and MUST tolerate its
//      absence.
//   2. Breaking change (removed/renamed method, removed field, changed type or
//      meaning, tightened schema) — bump PROTOCOL_API_VERSION, add a Design
//      changelog row, and add an Appendix A entry.
//   3. Never add a protocol-level `apiVersion` alongside `methods[]`.

/** The wire compatibility axis. Currently `1` (Design §3.7). */
export const PROTOCOL_API_VERSION = 1 as const;

/** Product name carried in the pairing URI `app=` parameter and `home.hello`. */
export const PRODUCT_NAME = "EnvoyHome" as const;

/** Error-message namespace prefix. `code` belongs to the transport catalogue,
 *  so EnvoyHome namespaces the *message* instead (Design §3.1). */
export const ERROR_NAMESPACE = "envoyhome" as const;

/**
 * The plugin-contract axis, for comparison against a plugin manifest.
 * Kept here so a plugin's declared `apiVersion` is checked in one place
 * (`checkPluginApiVersion`) rather than re-derived per loader.
 */
export const PLUGIN_API_VERSION = 1 as const;

export interface PluginApiCompatibility {
  ok: boolean;
  reason?: "plugin_newer_than_daemon";
}

/**
 * A plugin may only be loaded when its `apiVersion` is <= the daemon's.
 * A newer plugin may rely on methods this daemon does not have.
 */
export function checkPluginApiVersion(
  pluginApiVersion: unknown,
): PluginApiCompatibility {
  if (typeof pluginApiVersion !== "number" || !Number.isInteger(pluginApiVersion)) {
    return { ok: false, reason: "plugin_newer_than_daemon" };
  }
  return pluginApiVersion <= PLUGIN_API_VERSION
    ? { ok: true }
    : { ok: false, reason: "plugin_newer_than_daemon" };
}
