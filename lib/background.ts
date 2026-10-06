// Work that should not hold up a response: refreshing a snapshot the page has
// already rendered from, for instance. Inside a request it runs after the
// response is sent (next/server after()); outside one (a script, a test)
// there is nothing to attach to, and the caller does the work inline.
import { after } from "next/server";

export function scheduleBackground(label: string, fn: () => Promise<unknown>): boolean {
  try {
    after(async () => {
      try { await fn(); } catch (e) { console.error(`[background] ${label}:`, (e as Error)?.message ?? e); }
    });
    return true;
  } catch {
    return false;
  }
}

// One background refresh per key per window, per process: two pages rendered
// within a minute of each other must not both re-sync the same account.
const recent = new Map<string, number>();
export function onceEvery(key: string, windowMs: number, now: number = Date.now()): boolean {
  const last = recent.get(key) ?? 0;
  if (now - last < windowMs) return false;
  recent.set(key, now);
  if (recent.size > 2000) for (const [k, t] of recent) if (now - t > windowMs) recent.delete(k);
  return true;
}
