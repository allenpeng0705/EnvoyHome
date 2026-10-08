import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDaemonConfig } from "../dist/lib/resolve-config.js";

test("R7 / V-UX-4: persisted wins over bundled for ports", () => {
  const resolved = resolveDaemonConfig({
    bundled: { wsPort: 4780, httpPort: 4781, publicBaseUrl: "http://bundled" },
    persisted: { wsPort: 4781, httpPort: 4782 },
  });
  assert.equal(resolved.wsPort, 4781);
  assert.equal(resolved.httpPort, 4782);
});
