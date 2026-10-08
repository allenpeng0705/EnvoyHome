// MQTT client — B14 stub; actuation routes through daemon journal + gate.

export interface MqttClientConfig {
  brokerUrl: string;
  username?: string;
  password?: string;
}

export interface MqttClient {
  subscribe(topic: string): Promise<void>;
  read(topic: string): Promise<{ topic: string; payload: string } | undefined>;
  publish(topic: string, payload: string): Promise<void>;
}

export function createMqttClient(config: MqttClientConfig): MqttClient {
  return {
    async subscribe(topic) {
      void config;
      void topic;
    },
    async read(topic) {
      void config;
      return { topic, payload: "" };
    },
    async publish(topic, payload) {
      void config;
      void topic;
      void payload;
    },
  };
}
