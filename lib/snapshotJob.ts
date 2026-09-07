// Daily account snapshots for every connected Instagram account, run from
// the scheduled publisher (service role) so history keeps accumulating whether
// or not anyone opens SOCIA. One row per account per UTC day: the first
// observation of the day wins, so the series is taken at a consistent hour.
//
// Only point-in-time totals are recorded (followers, follows, media count).
// Activity metrics come from Meta's finished daily series in syncInstagram.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const IG_V = "v23.0";

export type SnapshotRun = { day: string; accounts: number; written: number; skipped: number; errors: number };

type Conn = { user_id: string; ig_user_id: string | null; access_token: string; is_active?: boolean | null };

/** Upsert one day's totals, tolerating the pre-migration column set. */
export async function writeDailySnapshot(
  supabase: Supa,
  userId: string,
  igUserId: string | null,
  day: string,
  totals: { followers: number | null; follows: number | null; media_count: number | null },
): Promise<boolean> {
  if (totals.followers == null) return false;
  const retrieved_at = new Date().toISOString();
  const full = { user_id: userId, day, followers: totals.followers, follows: totals.follows, media_count: totals.media_count, source: "socia_snapshot", retrieved_at };
  const base = { user_id: userId, day, followers: totals.followers, source: "socia_snapshot", retrieved_at };
  const bare = { user_id: userId, day, followers: totals.followers };
  const shapes = igUserId
    ? [[{ ...full, ig_user_id: igUserId }, "user_id,ig_user_id,day"], [{ ...base, ig_user_id: igUserId }, "user_id,ig_user_id,day"], [full, "user_id,day"], [base, "user_id,day"], [bare, "user_id,day"]]
    : [[full, "user_id,day"], [base, "user_id,day"], [bare, "user_id,day"]];
  for (const [row, onConflict] of shapes as [Record<string, unknown>, string][]) {
    try {
      const { error } = await supabase.from("account_snapshots").upsert(row, { onConflict });
      if (!error) return true;
    } catch {
      // try the next, narrower shape
    }
  }
  return false;
}

/** Does this account already have a follower count for `day`? */
export async function hasSnapshot(supabase: Supa, userId: string, igUserId: string | null, day: string): Promise<boolean> {
  try {
    let q = supabase.from("account_snapshots").select("followers").eq("user_id", userId).eq("day", day).not("followers", "is", null).limit(1);
    if (igUserId) q = q.eq("ig_user_id", igUserId);
    const { data, error } = await q;
    if (!error) return Boolean(data?.length);
  } catch {
    // ig_user_id column may not exist yet
  }
  const { data } = await supabase.from("account_snapshots").select("followers").eq("user_id", userId).eq("day", day).not("followers", "is", null).limit(1);
  return Boolean(data?.length);
}

async function fetchTotals(token: string): Promise<{ followers: number | null; follows: number | null; media_count: number | null } | null> {
  try {
    const u = new URL(`https://graph.instagram.com/${IG_V}/me`);
    u.searchParams.set("fields", "followers_count,follows_count,media_count");
    u.searchParams.set("access_token", token);
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { followers_count?: number; follows_count?: number; media_count?: number };
    return { followers: j.followers_count ?? null, follows: j.follows_count ?? null, media_count: j.media_count ?? null };
  } catch {
    return null;
  }
}

/** Record today's totals for every connection that doesn't have them yet.
 *  Cheap when nothing is missing: one read per connection, no API calls. */
export async function runDailySnapshots(supabase: Supa, now = new Date(), budgetMs = 20000): Promise<SnapshotRun> {
  const day = now.toISOString().slice(0, 10);
  const deadline = Date.now() + budgetMs;
  let conns: Conn[] = [];
  try {
    const { data, error } = await supabase.from("instagram_connections").select("user_id, ig_user_id, access_token, is_active");
    if (error) throw error;
    conns = ((data ?? []) as Conn[]).filter((c) => c.access_token && c.is_active !== false);
  } catch {
    const { data } = await supabase.from("instagram_connections").select("user_id, ig_user_id, access_token");
    conns = ((data ?? []) as Conn[]).filter((c) => c.access_token);
  }
  const run: SnapshotRun = { day, accounts: conns.length, written: 0, skipped: 0, errors: 0 };
  for (const c of conns) {
    if (Date.now() > deadline) break;
    if (await hasSnapshot(supabase, c.user_id, c.ig_user_id, day)) { run.skipped++; continue; }
    const totals = await fetchTotals(c.access_token);
    if (!totals) { run.errors++; continue; }
    (await writeDailySnapshot(supabase, c.user_id, c.ig_user_id, day, totals)) ? run.written++ : run.errors++;
  }
  return run;
}
