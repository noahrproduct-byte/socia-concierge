// Server-side assembly of a period Report for a workspace: fetch the stored
// Instagram snapshot and daily rows (and YouTube totals when a channel is
// connected), then hand them to the pure builder in lib/reports.ts. Shared by
// the Reports page, the CSV export and the print/client view so they never
// disagree.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getIgSnapshot, readDailySnapshots } from "./instagramSync";
import { getYouTubeAnalytics } from "./youtubeData";
import { engagementOf, median } from "./metrics";
import { buildReport, type Report, type ReportPeriod, type ReportPlatform } from "./reports";
import type { DailySnapshot } from "./dashboardMetrics";
import type { IgMediaItem } from "./instagramSync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export async function loadReport(
  supabase: Supa,
  ownerId: string,
  workspaceName: string,
  period: ReportPeriod,
  platform: ReportPlatform | "all" = "all",
): Promise<Report> {
  const wantIg = platform === "all" || platform === "instagram";
  const wantYt = platform === "all" || platform === "youtube";

  let instagram: Parameters<typeof buildReport>[0]["instagram"] = null;
  if (wantIg) {
    const snap = await getIgSnapshot(supabase, ownerId).catch(() => null);
    if (snap) {
      let daily: DailySnapshot[] = [];
      try {
        daily = await readDailySnapshots<DailySnapshot>(supabase, ownerId, snap.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source");
      } catch { /* report still builds from posts */ }
      const media = (Array.isArray(snap.media) ? snap.media : []) as IgMediaItem[];
      const baseline = median(media.map(engagementOf).filter((v) => v > 0)) ?? null;
      instagram = { handle: snap.username ?? null, media, daily, followers: snap.followers_count ?? null, baseline };
    }
  }

  let youtube: Parameters<typeof buildReport>[0]["youtube"] = null;
  if (wantYt) {
    const yt = await getYouTubeAnalytics(supabase, ownerId, period.days).catch(() => null);
    if (yt) youtube = { title: yt.channel.title, views: yt.range?.views ?? null, minutes: yt.range?.minutes ?? null, subs: yt.range?.subs ?? null };
  }

  return buildReport({ workspaceName, now: period.now, days: period.days, instagram, youtube, platform });
}
