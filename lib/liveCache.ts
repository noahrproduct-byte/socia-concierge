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
//   • Failures are reused only briefly. A read that came back empty,
//     unavailable or degraded is kept for FAIL_TTL_S at most (a Page without
//     read_insights would otherwise be asked again on every view), and a
//     connect / disconnect / sync clears it at once.
//   • Every value carries the time it was fetched, so the page can say so.
import { unstable_cache, revalidateTag } from "next/cache";
import { timed } from "@/lib/timing";

/** How long a good live platform read may be reused, in seconds. */
export const LIVE_TTL_S = 900;
/** How long an empty, unavailable or degraded read may be reused, in seconds. */
export const FAIL_TTL_S = 300;

export type Fetched<T> = { value: T; fetchedAt: string };

const liveTag = (ownerId: string) => `live:${ownerId}`;

class NotCached extends Error {}
class Miss extends Error {}

const bucketOf = (ttl: number) => String(Math.floor(Date.now() / (ttl * 1000)));

/**
 * `load()` through the cache. `parts` must name everything that changes the
 * answer besides the owner (workspace, account, range…). Returns null when
 * `load` returns null. `keep` decides whether a value is good for `ttl`
 * (default: any non-null value); anything else is reused for `failTtl` only.
 */
export async function cachedLive<T>(
  ownerId: string,
  parts: Array<string | number | null | undefined>,
  load: () => Promise<T | null>,
  keep: (value: T) => boolean = () => true,
  ttl: number = LIVE_TTL_S,
  failTtl: number = FAIL_TTL_S,
): Promise<Fetched<T> | null> {
  const base = ["live", ownerId, ...parts.map((p) => String(p ?? "-"))];
  const tags = [liveTag(ownerId)];

  // The short-lived entry for a failed read. Next's cache has no read-only
  // lookup, so the same cached function serves two phases: "probe" throws on
  // a miss (storing nothing) and "store" returns the value to be kept.
  let phase: "probe" | "store" = "probe";
  let failed: Fetched<T> | null = null;
  const failEntry = unstable_cache(
    async (): Promise<Fetched<T> | null> => {
      if (phase === "probe") throw new Miss();
      return failed;
    },
    [...base, "fail", bucketOf(failTtl)],
    { revalidate: failTtl, tags },
  );
  if (failTtl > 0) {
    try {
      return await failEntry();
    } catch (e) {
      if (!(e instanceof Miss)) throw e;
    }
  }

  const run = unstable_cache(
    async (): Promise<Fetched<T>> => {
      const value = await timed(`live:${parts.map((p) => String(p ?? "-")).join(":")}`, load);
      const fetched = value == null ? null : { value, fetchedAt: new Date().toISOString() };
      if (!fetched || !keep(fetched.value)) {
        failed = fetched;
        throw new NotCached();
      }
      return fetched;
    },
    [...base, bucketOf(ttl)],
    { revalidate: ttl, tags },
  );
  try {
    return await run();
  } catch (e) {
    if (!(e instanceof NotCached)) throw e;
  }
  if (failTtl > 0) {
    phase = "store";
    try {
      await failEntry();
    } catch {
      /* storing a failure is best effort */
    }
  }
  return failed;
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
