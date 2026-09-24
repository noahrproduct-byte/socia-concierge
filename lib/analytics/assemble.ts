// Server-side assembly for the universal Analytics shell. Fetches each
// connected platform's raw data through the existing sync/data modules, runs
// the matching adapter, and returns one normalized bundle per connected
// platform. The page stays thin; all platform-specific fetching lives here.
//
// Fetching is unavoidably network-bound (YouTube is live), so platform reads
// run in parallel and every one degrades to "not connected" on error rather
// than failing the page.

import type { createClient } from "../supabase/server";
import { getActiveConnection, getIgSnapshot, readDailySnapshots } from "../instagramSync";
import type { DailySnapshot } from "../dashboardMetrics";
import { fetchDemographics, type Demographics } from "../igDemographics";
import { getFbSnapshot } from "../facebookSync";
import { getYouTubeAnalytics } from "../youtubeData";
import { adaptFacebook, adaptInstagram, adaptYouTube } from "./adapters";
import type { NormalizedAccountAnalytics, Platform } from "./types";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AssembledAnalytics = {
  /** Platforms with a usable connection, in display order. */
  connected: Platform[];
  /** One normalized bundle per connected platform, same order as `connected`. */
  accounts: NormalizedAccountAnalytics[];
};

const NO_DEMO: Demographics = { status: "unavailable", reason: null, age: [], gender: [], city: [] };

export async function assembleAnalytics(
  supabase: Supa,
  userId: string,
  days: number,
  now: Date = new Date(),
): Promise<AssembledAnalytics> {
  const [snap, fb, yt] = await Promise.all([
    getIgSnapshot(supabase, userId).catch(() => null),
    getFbSnapshot(supabase, userId).catch(() => null),
    getYouTubeAnalytics(supabase, userId, days).catch(() => null),
  ]);

  const accounts: NormalizedAccountAnalytics[] = [];
  const connected: Platform[] = [];

  // Instagram — needs its daily snapshot rows and (for demographics) the token.
  if (snap && snap.followers_count != null) {
    type Row = DailySnapshot & { followers_gained: number | null };
    const [daily, tokenRow] = await Promise.all([
      readDailySnapshots<Row>(supabase, userId, snap.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as Row[]),
      (getActiveConnection(supabase, userId, "access_token") as Promise<{ access_token?: string } | null>).catch(() => null),
    ]);
    const demographics = await fetchDemographics(tokenRow?.access_token ?? null).catch(() => NO_DEMO);
    accounts.push(adaptInstagram({ snap, daily, demographics, days, now }));
    connected.push("instagram");
  }

  // YouTube — the analytics reader already returns the live bundle or null.
  if (yt) {
    accounts.push(adaptYouTube({ data: yt, days }));
    connected.push("youtube");
  }

  // Facebook — only when a Page is actually connected (not choosing/expired).
  if (fb && fb.status === "connected") {
    accounts.push(adaptFacebook({ snap: fb, days, now }));
    connected.push("facebook");
  }

  return { connected, accounts };
}
