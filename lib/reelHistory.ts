// One observation per Reel per day, for its first HISTORY_DAYS (see
// supabase/reel-history.sql). SOCIA otherwise keeps only each Reel's latest
// numbers, so how a Reel's views grew is lost the moment the next sync runs;
// this is what will let the Content Rater's outlook (lib/outlook.ts) compare a
// Reel with others at the same age instead of waiting for it to settle.
//
// Written from the Instagram sync, best effort: the table may not exist yet,
// and a failed write never fails a sync. Only numbers Instagram returned are
// stored; a metric it did not report stays null.

import type { IgMediaItem } from "./instagramSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** A Reel is followed for this long after it is posted; its numbers move little after. */
export const HISTORY_DAYS = 30;
const DAY = 86_400_000;

export type ReelDayRow = {
  user_id: string; ig_user_id: string; media_id: string; day: string; posted_at: string;
  views: number | null; reach: number | null; likes: number | null; comments: number | null; saved: number | null; shares: number | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Today's rows for the account's own Reels still inside their first HISTORY_DAYS. Pure. */
export function reelDayRows(userId: string, igUserId: string, media: IgMediaItem[], now: Date): ReelDayRow[] {
  const day = now.toISOString().slice(0, 10);
  return media.flatMap((m): ReelDayRow[] => {
    if (!m.id || m.collab_owner || !(m.media_product_type === "REELS" || m.media_type === "VIDEO")) return [];
    const at = m.timestamp ? Date.parse(m.timestamp) : NaN;
    if (Number.isNaN(at) || now.getTime() - at > HISTORY_DAYS * DAY || at > now.getTime()) return [];
    const row: ReelDayRow = {
      user_id: userId, ig_user_id: igUserId, media_id: m.id, day, posted_at: new Date(at).toISOString(),
      views: num(m.insights?.views), reach: num(m.insights?.reach), likes: num(m.like_count), comments: num(m.comments_count),
      saved: num(m.insights?.saved), shares: num(m.insights?.shares),
    };
    // A day with nothing reported is not an observation.
    return row.views == null && row.reach == null && row.likes == null ? [] : [row];
  });
}

/** Record today's observation for each recent Reel; the first of the day stands. Never throws. */
export async function recordReelHistory(supabase: Supa, userId: string, igUserId: string | null, media: IgMediaItem[], now: Date = new Date()): Promise<number> {
  if (!igUserId) return 0;
  const rows = reelDayRows(userId, igUserId, media, now);
  if (!rows.length) return 0;
  try {
    const { error } = await supabase.from("reel_history").upsert(rows, { onConflict: "user_id,ig_user_id,media_id,day", ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch {
    return 0; // the table arrives with supabase/reel-history.sql
  }
}
