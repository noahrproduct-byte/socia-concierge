// Names the slow part of a page. Any awaited step that takes longer than
// SLOW_LOG_MS (default 300 ms) is logged as "[slow] <label> <ms>ms"; Vercel
// attaches each line to its request, so the page path comes for free and the
// logs say WHICH read was slow instead of just which page.
const SLOW_MS = Number(process.env.SLOW_LOG_MS) || 300;

export async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await run();
  } finally {
    const ms = Date.now() - t0;
    if (ms >= SLOW_MS) console.log(`[slow] ${label} ${ms}ms`);
  }
}

/** The same, as a wrapper around an existing async function. */
export function timedFn<A extends unknown[], R>(label: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => timed(label, () => fn(...args));
}
