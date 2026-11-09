import "server-only";

/**
 * Process state that the health routes report. It lives on `globalThis`
 * because Next.js may load a module more than once (per route bundle), and
 * the state must be one per process.
 */
interface Lifecycle {
  draining: boolean;
}

const KEY = Symbol.for("crypto-blog.lifecycle");
const store = globalThis as typeof globalThis & { [KEY]?: Lifecycle };

function state(): Lifecycle {
  store[KEY] ??= { draining: false };
  return store[KEY];
}

/** True once the process has been asked to stop. */
export function isDraining(): boolean {
  return state().draining;
}

/** Marks the process as stopping: readiness fails from now on. */
export function startDraining(): void {
  state().draining = true;
}

/** For tests only. */
export function resetLifecycleForTests(): void {
  state().draining = false;
}
