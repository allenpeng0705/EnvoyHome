import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { parseMqttBrokerUrl, probeMqttBroker } from "../dist/probe.js";

test("parseMqttBrokerUrl: defaults and schemes", () => {
  assert.deepEqual(parseMqttBrokerUrl("mqtt://127.0.0.1:1883"), {
    host: "127.0.0.1",
    port: 1883,
    tls: false,
  });
  assert.deepEqual(parseMqttBrokerUrl("mqtts://broker.example"), {
    host: "broker.example",
    port: 8883,
    tls: true,
  });
  assert.equal(parseMqttBrokerUrl(""), null);
});

test("probeMqttBroker: TCP connect success / failure", async () => {
  const server = createServer((sock) => sock.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const port = addr.port;
  const ok = await probeMqttBroker(`mqtt://127.0.0.1:${port}`, 2000);
  assert.equal(ok.ok, true);
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const fail = await probeMqttBroker("mqtt://127.0.0.1:1", 800);
  assert.equal(fail.ok, false);
});
