// Instagram data sync: pull the connected account's real profile + recent
// posts and cache them on the user's instagram_connections row. Runs
// automatically right after OAuth connects, and re-runs when the cache
// goes stale. If the cache columns don't exist yet, the fetched snapshot
// is still returned in-memory so pages render real data either way.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

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
};

export type IgSnapshot = {
  username: string | null;
  name: string | null;
  followers_count: number | null;
  media_count: number | null;
  biography: string | null;
  media: IgMediaItem[];
  last_synced_at: string | null;
};

const STALE_MS = 6 * 60 * 60 * 1000; // re-sync after 6 hours

async function fetchFromInstagram(token: string): Promise<{
  profile: Record<string, unknown>;
  media: IgMediaItem[];
} | null> {
  try {
    const profUrl = new URL("https://graph.instagram.com/v21.0/me");
    profUrl.searchParams.set(
      "fields",
      "username,name,biography,account_type,media_count,followers_count,follows_count",
    );
    profUrl.searchParams.set("access_token", token);

    const mediaUrl = new URL("https://graph.instagram.com/v21.0/me/media");
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
): IgSnapshot {
  return {
    username: (profile.username as string) ?? null,
    name: (profile.name as string) ?? null,
    followers_count: (profile.followers_count as number) ?? null,
    media_count: (profile.media_count as number) ?? null,
    biography: (profile.biography as string) ?? null,
    media,
    last_synced_at: syncedAt,
  };
}

/** Fetch fresh data from Instagram and cache it. Returns the snapshot, or null
 *  if there's no usable connection. Cache write is best-effort. */
export async function syncInstagram(supabase: Supa, userId: string): Promise<IgSnapshot | null> {
  const { data: conn } = await supabase
    .from("instagram_connections")
    .select("access_token, username")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn?.access_token) return null;

  const fresh = await fetchFromInstagram(conn.access_token);
  if (!fresh) return null;

  const now = new Date().toISOString();
  const snap = toSnapshot(fresh.profile, fresh.media, now);

  // Persist (best-effort — works once the cache columns exist).
  try {
    await supabase
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
  } catch {
    // cache columns may not exist yet; the in-memory snapshot still serves
  }

  return snap;
}

/** Read the cached snapshot, auto-syncing when stale or never synced. */
export async function getIgSnapshot(supabase: Supa, userId: string): Promise<IgSnapshot | null> {
  // Try the full row first (cache columns may not exist yet).
  const { data: row, error } = await supabase
    .from("instagram_connections")
    .select("username, access_token, profile, media, followers_count, media_count, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Cache columns missing — fall back to a live sync every load.
    const { data: base } = await supabase
      .from("instagram_connections")
      .select("access_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!base?.access_token) return null;
    return syncInstagram(supabase, userId);
  }

  if (!row?.access_token) return null;

  const stale =
    !row.last_synced_at || Date.now() - new Date(row.last_synced_at).getTime() > STALE_MS;
  if (stale) {
    const fresh = await syncInstagram(supabase, userId);
    if (fresh) return fresh;
  }

  if (!row.profile && row.followers_count == null) return null; // never synced successfully

  return {
    username: row.username ?? null,
    name: (row.profile as Record<string, unknown> | null)?.name as string | null ?? null,
    followers_count: row.followers_count ?? null,
    media_count: row.media_count ?? null,
    biography: (row.profile as Record<string, unknown> | null)?.biography as string | null ?? null,
    media: Array.isArray(row.media) ? (row.media as IgMediaItem[]) : [],
    last_synced_at: row.last_synced_at ?? null,
  };
}
