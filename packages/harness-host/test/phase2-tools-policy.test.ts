// P2-C/E policy catalogue + parse fence allow-list.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAssistantToolCalls,
  toolSpec,
  unattendedRequiresGrant,
} from "../dist/index.js";

test("V-P2-MSG / V-P2-AGENT: catalogue + unattended grants", () => {
  assert.equal(toolSpec("message")?.risk, "network");
  assert.equal(toolSpec("sessions_list")?.risk, "read");
  assert.equal(toolSpec("sessions_send")?.risk, "write");
  assert.equal(toolSpec("sessions_send")?.attendedAsk, true);
  assert.equal(toolSpec("view_image")?.risk, "read");
  assert.equal(toolSpec("image_generate")?.risk, "network");
  assert.equal(toolSpec("image_generate")?.attendedAsk, true);
  assert.equal(toolSpec("spawn_helper")?.risk, "exec");
  assert.equal(toolSpec("task")?.risk, "exec");
  assert.equal(
    unattendedRequiresGrant(toolSpec("spawn_helper")!, "unattended"),
    true,
  );
  assert.equal(unattendedRequiresGrant(toolSpec("task")!, "unattended"), true);
  assert.equal(
    unattendedRequiresGrant(toolSpec("sessions_send")!, "unattended"),
    true,
  );
  assert.equal(
    unattendedRequiresGrant(toolSpec("image_generate")!, "unattended"),
    true,
  );
  assert.equal(
    unattendedRequiresGrant(toolSpec("sessions_list")!, "unattended"),
    false,
  );
});

test("V-P2-MSG / V-P2-AGENT: fence parse allows phase2 tools", () => {
  const { tools } = parseAssistantToolCalls(
    `\`\`\`envoyhome-tools
[{"tool":"sessions_list","args":{"limit":5}},{"tool":"sessions_send","args":{"sessionId":"s","text":"hi"}},{"tool":"message","args":{"channel":"fake","channelAccount":"d","peerId":"u","text":"hi"}},{"tool":"spawn_helper","args":{"prompt":"x"}},{"tool":"task","args":{"tasks":[{"objective":"a"},{"objective":"b"}]}},{"tool":"view_image","args":{"path":"uploads/a.png"}},{"tool":"image_generate","args":{"prompt":"cat"}},{"tool":"exec","args":{"cmd":"rm -rf /"}}]
\`\`\``,
    { allowSandbox: true },
  );
  const names = tools.map((t) => t.tool);
  assert.ok(names.includes("sessions_list"));
  assert.ok(names.includes("sessions_send"));
  assert.ok(names.includes("message"));
  assert.ok(names.includes("spawn_helper"));
  assert.ok(names.includes("task"));
  assert.ok(names.includes("view_image"));
  assert.ok(names.includes("image_generate"));
  assert.ok(!names.includes("exec"), "exec never via fence");
});
