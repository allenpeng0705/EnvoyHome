// Atomic JSON/text writes — temp file + rename (avoids torn reads/wipes).

import { rename, writeFile } from "node:fs/promises";

/**
 * Write `contents` to `path` via a same-directory temp file then rename.
 * Readers either see the previous complete file or the new complete file.
 */
export async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, path);
}
