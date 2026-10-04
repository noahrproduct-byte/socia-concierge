// Short-lived cache for LIVE platform reads (YouTube Analytics, Facebook Page
// Insights, Instagram demographics). Those reads cost several API round trips
// per page view and their numbers move by the day, not the second, so a page
// revisited within a few minutes reuses the last answer instead of asking the
// platform again.
//
// Honesty rules this keeps:
//   • The expiry is STRICT. Next's data cache serves a stale entry while it
//     refreshes in the background, which could show hours-old numbers to the
//     first visitor after a quiet spell. The time bucket in the key makes an
//     entry unreachable once its window ends, so nothing older than the TTL is
//     ever shown.
//   • Failures are not cached. A read that came back empty, unavailable or
//     degraded is returned to this request only; the next request asks again.
//   • Every value carries the time it was fetched, so the page can say so.
import { unstable_cache, revalidateTag } from "next/cache";
import { timed } from "@/lib/timing";

/** How long a live platform read may be reused, in seconds. */
export const LIVE_TTL_S = 900;

export type Fetched<T> = { value: T; fetchedAt: string };

const liveTag = (ownerId: string) => `live:${ownerId}`;

class NotCached extends Error {}

/**
 * `load()` through the cache. `parts` must name everything that changes the
 * answer besides the owner (workspace, account, range…). Returns null when
 * `load` returns null. `keep` decides whether a value is good enough to reuse
 * (default: any non-null value).
 */
export async function cachedLive<T>(
  ownerId: string,
  parts: Array<string | number | null | undefined>,
  load: () => Promise<T | null>,
  keep: (value: T) => boolean = () => true,
  ttl: number = LIVE_TTL_S,
): Promise<Fetched<T> | null> {
  const bucket = Math.floor(Date.now() / (ttl * 1000));
  const key = ["live", ownerId, ...parts.map((p) => String(p ?? "-")), String(bucket)];
  let uncached: Fetched<T> | null = null;
  const run = unstable_cache(
    async (): Promise<Fetched<T>> => {
      const value = await timed(`live:${parts.map((p) => String(p ?? "-")).join(":")}`, load);
      const fetched = value == null ? null : { value, fetchedAt: new Date().toISOString() };
      if (!fetched || !keep(fetched.value)) {
        uncached = fetched;
        throw new NotCached();
      }
      return fetched;
    },
    key,
    { revalidate: ttl, tags: [liveTag(ownerId)] },
  );
  try {
    return await run();
  } catch (e) {
    if (e instanceof NotCached) return uncached;
    throw e;
  }
}

/** Drop every cached live read for an owner: after a connect, disconnect or
 *  manual sync, the next page view must ask the platforms again. */
export function clearLiveCache(ownerId: string): void {
  try {
    revalidateTag(liveTag(ownerId));
  } catch {
    /* outside a request (a job or a test): nothing is cached there */
  }
}

/** The oldest fetch time among the reads a page used, or null if none were cached reads. */
export function oldestFetch(...items: Array<Fetched<unknown> | null | undefined>): string | null {
  const times = items.filter((i): i is Fetched<unknown> => Boolean(i)).map((i) => i.fetchedAt).sort();
  return times[0] ?? null;
}
