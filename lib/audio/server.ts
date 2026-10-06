// Server side of "Audio that works": which past posts to look at, what we
// already know about them without touching a file (results, and whether
// Instagram hid the file — its documented signal for licensed/library music),
// and where the browser's measurements land. Competitors come through
// Business Discovery when a Facebook Page is linked; only numbers are stored.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { igConnection } from "@/lib/igCompetitorData";
import { businessDiscovery, IG_DISCOVERY_REASON, type IgDiscoveryAccount } from "@/lib/igBusinessDiscovery";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { buildInsights, type AudioInsights, type AudioMediaRow } from "./insights";
import type { AudioFeatures } from "./features";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

type Row = {
  source: "own" | "competitor"; account_key: string; account_label: string; media_id: string; media_url: string | null;
  permalink: string | null; posted_at: string | null; has_media_url: boolean; interactions: number | null; views: number | null;
  features: AudioFeatures | null; error: string | null; analyzed_at: string | null; updated_at: string;
};
const COLS = "source, account_key, account_label, media_id, media_url, permalink, posted_at, has_media_url, interactions, views, features, error, analyzed_at, updated_at";

/** Competitors are re-read from Meta at most this often (Business Discovery is rate-limited). */
export const COMPETITOR_REFRESH_MS = 6 * 60 * 60 * 1000;
const MAX_COMPETITORS = 5;
const now = () => new Date().toISOString();

export type CompetitorState = { enabled: boolean; reason?: string; refreshed: boolean; accounts: number };

async function loadRows(client: Supa, ownerId: string, wsId: string | null): Promise<Row[]> {
  let q = client.from("audio_media").select(COLS).eq("user_id", ownerId);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data, error } = await q.order("posted_at", { ascending: false }).limit(400);
  if (error) throw error;
  return (data ?? []) as Row[];
}

const toMediaRow = (r: Row): AudioMediaRow => ({
  source: r.source, accountKey: r.account_key, accountLabel: r.account_label, mediaId: r.media_id, permalink: r.permalink, postedAt: r.posted_at,
  hasMediaUrl: r.has_media_url, interactions: r.interactions, views: r.views, features: r.features, error: r.error,
});

/**
 * Bring the candidate list up to date. Own posts come from the stored
 * Instagram snapshot (no API call); competitors from Business Discovery,
 * refreshed when asked or when the stored rows are older than
 * COMPETITOR_REFRESH_MS. Measurements already stored are never overwritten.
 */
export async function syncAudioCandidates(client: Supa, ownerId: string, wsId: string | null, opts: { refreshCompetitors?: boolean } = {}): Promise<CompetitorState> {
  const upserts: Record<string, unknown>[] = [];
  const stamp = now();

  const snap = await getIgSnapshot(client, ownerId, wsId).catch(() => null);
  if (snap?.ig_user_id) {
    for (const m of snap.media ?? []) {
      if (!m.id || m.media_type !== "VIDEO") continue;
      upserts.push({
        user_id: ownerId, workspace_id: wsId, source: "own", account_key: snap.ig_user_id, account_label: snap.username ? `@${snap.username}` : "Your account",
        media_id: m.id, media_url: m.media_url ?? null, permalink: m.permalink ?? null, posted_at: m.timestamp ?? null, media_type: m.media_type,
        has_media_url: Boolean(m.media_url), interactions: interactionsTotal(m), views: m.insights?.views ?? null, updated_at: stamp,
      });
    }
  }

  const existing = await loadRows(client, ownerId, wsId);
  const newestCompetitor = existing.filter((r) => r.source === "competitor").map((r) => new Date(r.updated_at).getTime()).sort((a, b) => b - a)[0] ?? 0;
  const due = opts.refreshCompetitors || Date.now() - newestCompetitor > COMPETITOR_REFRESH_MS;
  let state: CompetitorState = { enabled: true, refreshed: false, accounts: new Set(existing.filter((r) => r.source === "competitor").map((r) => r.account_key)).size };
  if (due) {
    const conn = await igConnection(client, ownerId);
    if (!conn) {
      state = { enabled: false, reason: IG_DISCOVERY_REASON.not_connected, refreshed: false, accounts: state.accounts };
    } else {
      const scope = await competitorScopeId(client, wsId);
      const tracked = await listTracked<{ handle: string }>(client, ownerId, "handle, platform", { platform: "instagram", workspaceId: scope, limit: MAX_COMPETITORS, byAdded: true }).catch(() => []);
      let found = 0;
      for (const t of tracked) {
        const r = await businessDiscovery(conn.igUserId, conn.pageToken, t.handle, 12).catch(() => null);
        const account = r && "account" in r ? (r as { account: IgDiscoveryAccount }).account : null;
        if (!account) continue;
        found++;
        for (const m of account.media) {
          if (!m.id || m.mediaType !== "VIDEO") continue;
          upserts.push({
            user_id: ownerId, workspace_id: wsId, source: "competitor", account_key: account.username, account_label: `@${account.username}`,
            media_id: m.id, media_url: m.mediaUrl, permalink: m.permalink, posted_at: m.timestamp, media_type: m.mediaType,
            has_media_url: Boolean(m.mediaUrl), interactions: (m.likes ?? 0) + (m.comments ?? 0), views: null, updated_at: stamp,
          });
        }
      }
      state = { enabled: true, refreshed: true, accounts: found };
    }
  }

  if (upserts.length) {
    // features / error / analyzed_at are not in the payload, so stored measurements stay.
    const { error } = await client.from("audio_media").upsert(upserts, { onConflict: "user_id,media_id" });
    if (error) throw error;
  }
  return state;
}

export type AudioData = {
  insights: AudioInsights;
  /** posts whose file is available and not yet measured — the browser measures these */
  pending: { mediaId: string; label: string }[];
  competitors: CompetitorState;
};

export async function audioData(client: Supa, ownerId: string, wsId: string | null, competitors: CompetitorState): Promise<AudioData> {
  const rows = await loadRows(client, ownerId, wsId);
  const media = rows.map(toMediaRow);
  return {
    insights: buildInsights(media),
    pending: rows.filter((r) => r.has_media_url && r.media_url && !r.features && !r.error).slice(0, 30).map((r) => ({ mediaId: r.media_id, label: r.account_label })),
    competitors,
  };
}

/** The CDN link for a post the owner is entitled to analyse, or null. */
export async function resolveMediaUrl(client: Supa, ownerId: string, mediaId: string): Promise<string | null> {
  const { data, error } = await client.from("audio_media").select("media_url, has_media_url").eq("user_id", ownerId).eq("media_id", mediaId).limit(1);
  if (error) throw error;
  const r = ((data ?? []) as { media_url: string | null; has_media_url: boolean }[])[0];
  return r?.has_media_url && r.media_url ? r.media_url : null;
}

export async function storeMeasurement(client: Supa, ownerId: string, mediaId: string, result: { features: AudioFeatures } | { error: string }): Promise<void> {
  const patch = "features" in result
    ? { features: result.features, error: null, analyzed_at: now(), updated_at: now() }
    : { error: result.error.slice(0, 300), analyzed_at: now(), updated_at: now() };
  const { error } = await client.from("audio_media").update(patch).eq("user_id", ownerId).eq("media_id", mediaId);
  if (error) throw error;
}

/** One sentence for the EDL pass when the account has a measured answer; null otherwise. Never throws. */
export async function audioLine(client: Supa, ownerId: string, wsId: string | null): Promise<string | null> {
  try {
    const rows = await loadRows(client, ownerId, wsId);
    const ins = buildInsights(rows.map(toMediaRow));
    return ins.own?.baseline ? ins.recommendation : null;
  } catch {
    return null;
  }
}
