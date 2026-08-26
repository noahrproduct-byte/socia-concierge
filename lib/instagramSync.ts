// Instagram data sync: pull the connected account's real profile + recent
// posts and cache them on the user's instagram_connections row. Runs
// automatically right after OAuth connects, and re-runs when the cache
// goes stale. If the cache columns don't exist yet, the fetched snapshot
// is still returned in-memory so pages render real data either way.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

// Media-level insights (Instagram Insights API; professional accounts).
// A key is present ONLY when Meta actually returned it — absence means
// "not provided", never zero.
export type IgMediaInsights = {
  views?: number;
  reach?: number;
  saved?: number; // media insight name is `saved` (account-level uses `saves`)
  shares?: number;
  total_interactions?: number;
};

export type IgMediaItem = {
  id?: string;
  caption?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string; // video poster frame
  insights?: IgMediaInsights;
};

export type IgSnapshot = {
  /** Instagram user id of the account this snapshot describes. Pages use it
   *  to scope snapshot-history reads so accounts never mix. */
  ig_user_id: string | null;
  username: string | null;
  name: string | null;
  followers_count: number | null;
  media_count: number | null;
  biography: string | null;
  profile_picture_url: string | null;
  media: IgMediaItem[];
  last_synced_at: string | null;
  /** false = the token lacks insights permission (reconnect needed);
   *  null = not checked yet. */
  insights_ok: boolean | null;
};

const STALE_MS = 6 * 60 * 60 * 1000; // re-sync after 6 hours

/** Record today's exact follower total (one row per day) so follower history
 *  is real observations, never reconstructed.
 *
 *  Deliberately narrow. Account-level activity metrics (views, likes,
 *  comments, saves, shares) are NOT recorded here: `/me/insights` with
 *  `period=day` returns the value for the day *so far*, so a read taken at
 *  whatever time a sync happens is not a comparable daily total — charting a
 *  series of them would invent a trend out of sync timing. A follower count
 *  is a point-in-time total, which is valid whenever it is read, so that is
 *  the one thing this writes. True per-day activity comes only from Meta's
 *  historical daily series (see fetchDailySeries).
 *
 *  Best-effort: the table/columns may not exist yet. */
async function recordSnapshot(
  supabase: Supa,
  userId: string,
  igUserId: string | null,
  followers: number | null,
) {
  if (followers == null) return;
  const day = new Date().toISOString().slice(0, 10);
  const base = {
    user_id: userId,
    day,
    followers,
    source: "socia_snapshot",
    retrieved_at: new Date().toISOString(),
  };
  try {
    // Post-migration shape: history is per account.
    if (igUserId) {
      const { error } = await supabase
        .from("account_snapshots")
        .upsert({ ...base, ig_user_id: igUserId }, { onConflict: "user_id,ig_user_id,day" });
      if (!error) return;
    }
    const { error } = await supabase
      .from("account_snapshots")
      .upsert(base, { onConflict: "user_id,day" });
    if (error) {
      // Extended columns may not exist yet — fall back to the base shape.
      await supabase
        .from("account_snapshots")
        .upsert({ user_id: userId, day, followers }, { onConflict: "user_id,day" });
    }
  } catch {
    // history simply starts once the table exists
  }
}

const IG_V = "v23.0"; // keep on a currently supported Graph version

/** Insights, requested tolerantly: try the metric bundle; when Meta rejects a
 *  metric for this account/media type, drop the offending metric and retry.
 *  Returns only the values Meta actually provided (empty data ≠ zero), plus
 *  the last permission-style error, if any. */
async function fetchInsights(
  path: string,
  metrics: string[],
  extra: Record<string, string>,
  token: string,
): Promise<{ values: Record<string, number>; permissionError: string | null }> {
  let remaining = [...metrics];
  let permissionError: string | null = null;
  for (let attempt = 0; attempt < 4 && remaining.length; attempt++) {
    const u = new URL(`https://graph.instagram.com/${IG_V}${path}`);
    u.searchParams.set("metric", remaining.join(","));
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", token);
    let json: {
      data?: { name?: string; total_value?: { value?: number }; values?: { value?: number }[] }[];
      error?: { message?: string; code?: number };
    } | null = null;
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
      json = await res.json();
    } catch {
      return { values: {}, permissionError };
    }
    if (json?.error) {
      const msg = json.error.message ?? "";
      if (json.error.code === 10 || /permission|scope/i.test(msg)) {
        permissionError = msg.slice(0, 200);
        return { values: {}, permissionError };
      }
      // "metric[N] must be one of ..." style rejection — drop named metrics.
      const bad = remaining.filter((m) => msg.includes(m));
      const next = bad.length ? remaining.filter((m) => !bad.includes(m)) : remaining.slice(0, -1);
      if (next.length === remaining.length) return { values: {}, permissionError };
      remaining = next;
      continue;
    }
    const values: Record<string, number> = {};
    for (const d of json?.data ?? []) {
      const v = d.total_value?.value ?? d.values?.[d.values.length - 1]?.value;
      if (d.name && typeof v === "number") values[d.name] = v;
    }
    return { values, permissionError };
  }
  return { values: {}, permissionError };
}

/** Meta returns a REAL daily time series for account-level metrics when you
 *  pass since/until (max ~30 days per request, ~2 years of retention). This
 *  is genuine per-day activity — not post totals — so it can be charted as a
 *  time series. Returns one entry per day, only for metrics Meta provided. */
export async function fetchDailySeries(
  token: string,
  days = 90,
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  // Metrics Meta serves as a genuine period=day series. NOTE: `follower_count`
  // is NEW FOLLOWERS PER DAY (gains), not a running total — it is stored as
  // followers_gained and never treated as a follower-count snapshot.
  const METRICS = ["views", "reach", "follower_count"];
  const now = Math.floor(Date.now() / 1000);
  const CHUNK = 30 * 86400;

  for (let back = 0; back < days * 86400; back += CHUNK) {
    const until = now - back;
    const since = Math.max(until - CHUNK, now - days * 86400);
    if (since >= until) break;
    const u = new URL(`https://graph.instagram.com/${IG_V}/me/insights`);
    u.searchParams.set("metric", METRICS.join(","));
    u.searchParams.set("period", "day");
    u.searchParams.set("since", String(since));
    u.searchParams.set("until", String(until));
    u.searchParams.set("access_token", token);
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(12000) });
      const json = (await res.json()) as {
        data?: { name?: string; values?: { value?: number; end_time?: string }[] }[];
        error?: { message?: string };
      };
      if (json?.error || !json?.data) continue;
      for (const metric of json.data) {
        const name = metric.name;
        if (!name) continue;
        for (const v of metric.values ?? []) {
          if (typeof v.value !== "number" || !v.end_time) continue;
          // end_time is the boundary at the START of the following day (UTC).
          const day = new Date(new Date(v.end_time).getTime() - 43200000)
            .toISOString()
            .slice(0, 10);
          const row = out.get(day) ?? {};
          row[name === "follower_count" ? "followers_gained" : name] = v.value;
          out.set(day, row);
        }
      }
    } catch {
      // partial history is fine — we store whatever Meta returned
    }
  }
  return out;
}

async function fetchFromInstagram(token: string): Promise<{
  profile: Record<string, unknown>;
  media: IgMediaItem[];
} | null> {
  try {
    const profUrl = new URL(`https://graph.instagram.com/${IG_V}/me`);
    profUrl.searchParams.set(
      "fields",
      "username,name,biography,account_type,media_count,followers_count,follows_count,profile_picture_url",
    );
    profUrl.searchParams.set("access_token", token);

    const mediaUrl = new URL(`https://graph.instagram.com/${IG_V}/me/media`);
    mediaUrl.searchParams.set(
      "fields",
      "id,caption,media_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url",
    );
    mediaUrl.searchParams.set("limit", "25");
    mediaUrl.searchParams.set("access_token", token);

    const [pRes, mRes] = await Promise.all([fetch(profUrl), fetch(mediaUrl)]);
    if (!pRes.ok) return null;
    const profile = await pRes.json();
    let media: IgMediaItem[] = [];
    if (mRes.ok) {
      const mJson = await mRes.json();
      media = Array.isArray(mJson.data) ? mJson.data : [];
    }
    return { profile, media };
  } catch {
    return null;
  }
}

function toSnapshot(
  profile: Record<string, unknown>,
  media: IgMediaItem[],
  syncedAt: string,
  igUserId: string | null = null,
): IgSnapshot {
  const status = profile.insights_status as { ok?: boolean } | undefined;
  return {
    insights_ok: typeof status?.ok === "boolean" ? status.ok : null,
    ig_user_id: igUserId,
    username: (profile.username as string) ?? null,
    name: (profile.name as string) ?? null,
    followers_count: (profile.followers_count as number) ?? null,
    media_count: (profile.media_count as number) ?? null,
    biography: (profile.biography as string) ?? null,
    profile_picture_url: (profile.profile_picture_url as string) ?? null,
    media,
    last_synced_at: syncedAt,
  };
}

/** Daily history rows for ONE account. With multi-account, filtering by
 *  ig_user_id is what keeps two accounts' histories from blending into one
 *  chart; pre-migration (no column, single account) the filter falls away. */
export async function readDailySnapshots<T>(
  supabase: Supa,
  userId: string,
  igUserId: string | null,
  columns: string,
): Promise<T[]> {
  if (igUserId) {
    try {
      const { data, error } = await supabase
        .from("account_snapshots")
        .select(columns)
        .eq("user_id", userId)
        .eq("ig_user_id", igUserId)
        .order("day", { ascending: true })
        .limit(400);
      if (!error) return (data ?? []) as T[];
    } catch {
      // column may not exist yet
    }
  }
  const { data, error } = await supabase
    .from("account_snapshots")
    .select(columns)
    .eq("user_id", userId)
    .order("day", { ascending: true })
    .limit(400);
  if (error) throw error;
  return (data ?? []) as T[];
}

/** The connection every read and write goes through: the active account.
 *  Tolerant of the pre-migration world where is_active doesn't exist and a
 *  user has exactly one row. Multiple rows only appear post-migration, where
 *  exactly one is active. */
export async function getActiveConnection(
  supabase: Supa,
  userId: string,
  fields: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("instagram_connections")
      .select(fields)
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1);
    if (!error && data?.length) return data[0];
    if (error) throw error;
  } catch {
    // is_active may not exist yet — fall through to the single-row world
  }
  const { data } = await supabase
    .from("instagram_connections")
    .select(fields)
    .eq("user_id", userId)
    .limit(1);
  return data?.[0] ?? null;
}

/** Fetch fresh data from Instagram and cache it. Returns the snapshot, or null
 *  if there's no usable connection. Cache write is best-effort. */
export async function syncInstagram(supabase: Supa, userId: string): Promise<IgSnapshot | null> {
  const conn = (await getActiveConnection(
    supabase,
    userId,
    "access_token, username, ig_user_id",
  )) as { access_token?: string; username?: string; ig_user_id?: string } | null;
  if (!conn?.access_token) return null;
  const token = conn.access_token;
  const igId = conn.ig_user_id ?? null;

  const fresh = await fetchFromInstagram(token);
  if (!fresh) return null;

  const now = new Date().toISOString();

  // Per-media insights (views/reach/saved/shares) — tolerant per metric, and
  // a key exists only when Meta returned it (absence ≠ zero).
  let permissionError: string | null = null;
  await Promise.all(
    fresh.media.map(async (m) => {
      if (!m.id) return;
      const r = await fetchInsights(
        `/${m.id}/insights`,
        ["views", "reach", "saved", "shares", "total_interactions"],
        {},
        token,
      );
      if (r.permissionError) permissionError = r.permissionError;
      if (Object.keys(r.values).length) m.insights = r.values as IgMediaInsights;
    }),
  );

  // Stored with the cached profile so the UI can distinguish "token lacks the
  // insights permission — reconnect" from "metric not provided".
  (fresh.profile as Record<string, unknown>).insights_status = {
    ok: permissionError == null,
    error: permissionError,
    checked_at: now,
  };

  const snap = toSnapshot(fresh.profile, fresh.media, now, igId);

  // Persist (best-effort — works once the cache columns exist).
  try {
    let upd = supabase
      .from("instagram_connections")
      .update({
        username: snap.username ?? conn.username,
        profile: fresh.profile,
        media: fresh.media,
        followers_count: snap.followers_count,
        media_count: snap.media_count,
        last_synced_at: now,
      })
      .eq("user_id", userId);
    // Post-migration a user can hold several rows; target this account's.
    if (igId) upd = upd.eq("ig_user_id", igId);
    await upd;
  } catch {
    // cache columns may not exist yet; the in-memory snapshot still serves
  }

  // Backfill Meta's own daily series first, then today's exact snapshot, so
  // the observed follower total (socia_snapshot) always wins for today.
  //
  // Meta's series is the ONLY source of truth for per-day activity, so each
  // backfilled day writes every activity column explicitly — a metric Meta
  // did not return is written as null rather than left alone. That clears
  // values an earlier build recorded from sync-time counter reads, which were
  // never comparable daily totals.
  try {
    const series = await fetchDailySeries(token, 90);
    if (series.size) {
      const rows = [...series.entries()].map(([day, vals]) => ({
        user_id: userId,
        day,
        views: vals.views ?? null,
        reach: vals.reach ?? null,
        followers_gained: vals.followers_gained ?? null,
        total_interactions: null,
        likes: null,
        comments: null,
        saves: null,
        shares: null,
        profile_views: null,
        accounts_engaged: null,
        source: "instagram_api",
        retrieved_at: now,
      }));
      // Per-account history first; pre-migration falls back to per-user.
      let error = null;
      if (igId) {
        ({ error } = await supabase
          .from("account_snapshots")
          .upsert(rows.map((r) => ({ ...r, ig_user_id: igId })), {
            onConflict: "user_id,ig_user_id,day",
          }));
      }
      if (!igId || error) {
        ({ error } = await supabase
          .from("account_snapshots")
          .upsert(rows, { onConflict: "user_id,day" }));
      }
      if (error) {
        // extended columns may be missing — try the bare shape
        await supabase
          .from("account_snapshots")
          .upsert(
            rows.map((r) => ({ user_id: r.user_id, day: r.day })),
            { onConflict: "user_id,day" },
          );
      }
    }
  } catch {
    // history simply stays as far back as previous syncs recorded
  }

  await recordSnapshot(supabase, userId, igId, snap.followers_count);

  return snap;
}

/** Read the cached snapshot of the ACTIVE account, auto-syncing when stale
 *  or never synced. */
export async function getIgSnapshot(supabase: Supa, userId: string): Promise<IgSnapshot | null> {
  // Try the full row first (cache columns may not exist yet).
  const row = (await getActiveConnection(
    supabase,
    userId,
    "ig_user_id, username, access_token, profile, media, followers_count, media_count, last_synced_at",
  )) as {
    ig_user_id?: string;
    username?: string;
    access_token?: string;
    profile?: Record<string, unknown> | null;
    media?: unknown;
    followers_count?: number | null;
    media_count?: number | null;
    last_synced_at?: string | null;
  } | null;

  if (row && row.access_token && row.profile === undefined && row.followers_count === undefined) {
    // Cache columns missing entirely — live sync every load.
    return syncInstagram(supabase, userId);
  }
  if (!row?.access_token) {
    // The select may have failed on missing cache columns; last resort.
    const base = await getActiveConnection(supabase, userId, "access_token");
    if (!base?.access_token) return null;
    return syncInstagram(supabase, userId);
  }

  const stale =
    !row.last_synced_at || Date.now() - new Date(row.last_synced_at).getTime() > STALE_MS;
  if (stale) {
    const fresh = await syncInstagram(supabase, userId);
    if (fresh) return fresh;
  }

  if (!row.profile && row.followers_count == null) return null; // never synced successfully

  await recordSnapshot(supabase, userId, row.ig_user_id ?? null, row.followers_count ?? null);

  const cachedStatus = (row.profile as Record<string, unknown> | null)?.insights_status as
    | { ok?: boolean }
    | undefined;

  return {
    insights_ok: typeof cachedStatus?.ok === "boolean" ? cachedStatus.ok : null,
    ig_user_id: row.ig_user_id ?? null,
    username: row.username ?? null,
    name: (row.profile as Record<string, unknown> | null)?.name as string | null ?? null,
    followers_count: row.followers_count ?? null,
    media_count: row.media_count ?? null,
    biography: (row.profile as Record<string, unknown> | null)?.biography as string | null ?? null,
    profile_picture_url:
      ((row.profile as Record<string, unknown> | null)?.profile_picture_url as string | null) ??
      null,
    media: Array.isArray(row.media) ? (row.media as IgMediaItem[]) : [],
    last_synced_at: row.last_synced_at ?? null,
  };
}
