/** Drain microtasks + a burst of macrotask ticks (conventions R8). */
export async function flushLoop(ticks = 10): Promise<void> {
  await Promise.resolve();
  for (let i = 0; i < ticks; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}
