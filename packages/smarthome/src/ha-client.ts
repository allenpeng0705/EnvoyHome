// Home Assistant REST/WS client — B14 stub with typed surface for tools.

export interface HaClientConfig {
  baseUrl: string;
  token: string;
}

export interface HaEntityState {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HaClient {
  listEntities(): Promise<HaEntityState[]>;
  getState(entityId: string): Promise<HaEntityState | undefined>;
  listServices(): Promise<Array<{ domain: string; services: string[] }>>;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
}

export function createHaClient(config: HaClientConfig): HaClient {
  return {
    async listEntities() {
      void config;
      return [];
    },
    async getState(entityId) {
      void config;
      return { entityId, state: "unknown", attributes: {} };
    },
    async listServices() {
      return [];
    },
    async callService(domain, service, data) {
      void config;
      void domain;
      void service;
      void data;
    },
  };
}
