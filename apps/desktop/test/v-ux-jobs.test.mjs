// V-UX-12: Jobs authoring — Reminder / Workflow / Tool + unified list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = join(root, "ui-dist", "app.js");

test("V-UX-12: ui-dist Jobs create modes, put/confirm payload, Workflow badge", async () => {
  const src = await readFile(appJs, "utf8");
  assert.match(src, /home\.listSchedules/);
  assert.match(src, /home\.proposeSchedule/);
  assert.match(src, /home\.confirmSchedule/);
  assert.match(src, /home\.confirmSchedule[\s\S]{0,200}payload/);
  assert.match(src, /kind:\s*"notify"/);
  assert.match(src, /data-job-mode/);
  assert.match(src, /jobs\.modeReminder|modeReminder/);
  assert.match(src, /payloadKind/);
  assert.match(src, /jobs\.badgeWorkflow|job-badge/);
  assert.match(src, /data-source/);
  assert.match(src, /jobs\.syncedHint/);
  assert.match(src, /job-list/);
  assert.match(src, /job-create/);
  // No debug dump of listSchedules result on the Jobs tab.
  assert.doesNotMatch(src, /pre\(listed\)/);
});
