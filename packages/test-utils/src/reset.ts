const registries: Array<() => void> = [];

/** Register a module-level reset hook for suite isolation (R8). */
export function registerResetHook(fn: () => void): void {
  registries.push(fn);
}

export function __resetActiveXForTests(): void {
  for (const fn of registries) fn();
}
