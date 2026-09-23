// The one way to read a user's tracked competitors. After a plan downgrade,
// competitors beyond the cap are marked is_active = false (never deleted);
// every reader goes through here so an inactive row is excluded everywhere.
//
// The database may not be migrated yet: tracked_competitors gains is_active in
// supabase/plans-and-usage.sql. Each read tries the filtered shape first and,
// when the column is missing, falls back to the unfiltered select (in which
// every row is, by definition, active).
//
// Server only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type ListTrackedOptions = {
  platform?: string;
  /**
   * Plan cap: the oldest `limit` rows (by added_at) are returned, the rest are
   * never handed out, even when more active rows exist. Implies byAdded.
   */
  limit?: number;
  /** Order by added_at ascending (oldest first). */
  byAdded?: boolean;
};

function baseQuery(supabase: Supa, userId: string, cols: string, opts: ListTrackedOptions) {
  let q = supabase.from("tracked_competitors").select(cols).eq("user_id", userId);
  if (opts.platform) q = q.eq("platform", opts.platform);
  if (opts.byAdded || opts.limit != null) q = q.order("added_at", { ascending: true });
  if (opts.limit != null) q = q.limit(Math.max(0, opts.limit));
  return q;
}

/** The limit applied once more in memory, so a read that ignored it (older schema) still respects the cap. */
function capped<T>(rows: T[], opts: ListTrackedOptions): T[] {
  if (opts.limit == null) return rows;
  return rows.slice(0, Math.max(0, opts.limit));
}

/**
 * Active tracked competitors for a user. Throws only when even the fallback
 * read fails, so callers can decide between "empty" and "unknown".
 */
export async function listTracked<T = Record<string, unknown>>(
  supabase: Supa,
  userId: string,
  cols: string,
  opts: ListTrackedOptions = {},
): Promise<T[]> {
  if (opts.limit != null && opts.limit <= 0) return [];
  try {
    const { data, error } = await baseQuery(supabase, userId, cols, opts).eq("is_active", true);
    if (!error) return capped((data ?? []) as T[], opts);
  } catch {
    /* is_active may not exist yet; fall through */
  }
  const { data, error } = await baseQuery(supabase, userId, cols, opts);
  if (error) throw error;
  return capped((data ?? []) as T[], opts);
}

export type TrackedState = { exists: false } | { exists: true; active: boolean };

/** Whether one handle is already in the roster, and whether it still counts. */
export async function trackedState(supabase: Supa, userId: string, platform: string, handle: string): Promise<TrackedState> {
  const h = handle.toLowerCase();
  const one = (cols: string) =>
    supabase.from("tracked_competitors").select(cols).eq("user_id", userId).eq("platform", platform).eq("handle", h).limit(1);
  try {
    const { data, error } = await one("handle, is_active");
    if (!error) {
      const row = data?.[0] as { is_active?: boolean | null } | undefined;
      return row ? { exists: true, active: row.is_active !== false } : { exists: false };
    }
  } catch {
    /* column may not exist yet */
  }
  const { data, error } = await one("handle");
  if (error) throw error;
  return data?.length ? { exists: true, active: true } : { exists: false };
}
