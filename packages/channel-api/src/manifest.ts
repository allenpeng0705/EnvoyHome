import { checkPluginApiVersion, PLUGIN_API_VERSION } from "@envoyhome/protocol";

export type ChannelKind = "chat" | "event-source";

export interface ChannelManifest {
  id: string;
  apiVersion: number;
  kind: ChannelKind;
  label: string;
  /** Declared config keys; secrets are write-only. */
  configSchema: Record<
    string,
    { secret?: boolean; required?: boolean; credentialScope?: "read" | "write" }
  >;
  capabilities?: readonly string[];
}

export function assertManifestCompatible(manifest: ChannelManifest): void {
  const check = checkPluginApiVersion(manifest.apiVersion);
  if (!check.ok) {
    throw new Error(
      `envoyhome.version_too_low: plugin apiVersion ${manifest.apiVersion} > daemon ${PLUGIN_API_VERSION}`,
    );
  }
}
