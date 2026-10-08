// RESOLVED config = bundled defaults merged with persisted (persisted wins).

export interface DaemonUiConfig {
  wsPort: number;
  httpPort: number;
  publicBaseUrl: string;
  label: string;
}

export function resolveDaemonConfig(input: {
  bundled: Partial<DaemonUiConfig>;
  persisted: Partial<DaemonUiConfig>;
}): DaemonUiConfig {
  return {
    wsPort: input.persisted.wsPort ?? input.bundled.wsPort ?? 4780,
    httpPort: input.persisted.httpPort ?? input.bundled.httpPort ?? 4781,
    publicBaseUrl:
      input.persisted.publicBaseUrl ??
      input.bundled.publicBaseUrl ??
      `http://127.0.0.1:${input.persisted.httpPort ?? input.bundled.httpPort ?? 4781}`,
    label: input.persisted.label ?? input.bundled.label ?? "EnvoyHome",
  };
}
