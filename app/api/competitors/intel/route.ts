import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { aiFailureKind, type AiUnavailable } from "@/lib/anthropic";
import {
  searchChannels, searchVideos, resolveChannel, channelMedianViews, ytConfigured, ytFormat,
} from "@/lib/youtube";
import {
  buildQueries, goalKind, scoreAccount, scoreContent, dedupeAccounts, dedupeContent,
  rollUpTrends, canonicalUrl,
  type AccountCandidate, type ContentCandidate, type DiscoveryProfile,
  type ScoredAccount, type ScoredContent, type TrendRollup,
} from "@/lib/discovery";

export const runtime = "nodejs";
export const maxDuration = 120;

// The discovery pipeline:
//   profile -> queries -> candidates -> normalize -> score -> dedupe -> store
//
// Sources are never blended. YouTube's Data API gives verified public metrics.
// Web research finds Instagram/Facebook accounts and posts that no API exposes,
// and those carry NO metrics at all — a handle and a reason, nothing invented.
// One source failing never fails the request; each reports its own status.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SEARCH_MODEL = process.env.ANTHROPIC_SEARCH_MODEL ?? "claude-opus-5";
// A run is reused for six hours. A manual refresh (Niche intelligence, Starter
// and up) may force a new run at most once an hour; on Free the button is
// honoured only once the run is stale. Each run spends model web searches and
// YouTube quota, so the cache and the cooldown are enforced here, never in the UI.
const FRESH_MS = 6 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export type IntelSources = {
  youtube: "ok" | "not_configured" | "failed";
  web: "ok" | AiUnavailable;
};

export type IntelDoc = {
  accounts: ScoredAccount[];
  content: ScoredContent[];
  trends: TrendRollup[];
  ranAt: string | null;
  sources: IntelSources;
  profileGaps: string[];
};

function parseJsonArray(text: string): unknown[] {
  const m = /\[\s*\{[\s\S]*\}\s*\]/.exec(text);
  if (!m) return [];
  try {
    const v = JSON.parse(m[0]);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const wantsRefresh = new URL(req.url).searchParams.get("refresh") === "1";

  // ---- profile: who the user actually is -------------------------------
  let niche: string | null = null;
  let subNiche: string | null = null;
  let brandName: string | null = null;
  let location: string | null = null;
  let description: string | null = null;
  let goalText: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, niche_detail, brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    niche = prof?.niche ?? null;
    brandName = prof?.brand_name ?? null;
    goalText = prof?.goals ?? null;
    subNiche = (prof?.niche_detail as { sub_niche?: string } | null)?.sub_niche ?? null;
    const bd = prof?.brand_detail as { location?: string; description?: string } | null;
    location = bd?.location ?? null;
    description = bd?.description ?? null;
  } catch {
    /* gaps reported below */
  }

  let ownHandle: string | null = null;
  let ownFollowers: number | null = null;
  let ownFormats: string[] = [];
  try {
    const conn = await getActiveConnection(supabase, user.id, "username, followers_count, media");
    const c = conn as { username?: string; followers_count?: number; media?: unknown } | null;
    ownHandle = c?.username ?? null;
    ownFollowers = c?.followers_count ?? null;
    const media = Array.isArray(c?.media) ? (c!.media as { media_type?: string }[]) : [];
    ownFormats = [...new Set(media.map((m) => m.media_type ?? "IMAGE"))];
  } catch {
    /* discovery still works without a connected account */
  }

  // Never silently assume missing profile information.
  const profileGaps: string[] = [];
  if (!niche) profileGaps.push("niche");
  if (!location) profileGaps.push("location");
  if (!goalText) profileGaps.push("goal");

  const profile: DiscoveryProfile = {
    niche, subNiche, brandName, location, description, goalText,
    goal: goalKind(goalText), ownHandle, ownFollowers, ownFormats,
  };

  // ---- cached results, unless a permitted refresh was asked for ----------
  const cached = await readStored(supabase, user.id);
  const ageMs = cached?.ranAt ? Date.now() - new Date(cached.ranAt).getTime() : Infinity;
  let refresh = false;
  let nextRefreshAt: string | null = null;
  if (wantsRefresh && cached?.ranAt) {
    const ent = await getEntitlements(supabase, user.id);
    if (canUseFeature(ent, "niche_intelligence")) {
      if (ageMs >= REFRESH_COOLDOWN_MS) refresh = true;
      else nextRefreshAt = new Date(new Date(cached.ranAt).getTime() + REFRESH_COOLDOWN_MS).toISOString();
    }
  }
  if (!refresh && cached && ageMs < FRESH_MS) {
    return NextResponse.json({ ...cached, profileGaps, nextRefreshAt });
  }

  if (!niche) {
    return NextResponse.json({
      accounts: [], content: [], trends: [], ranAt: null,
      sources: { youtube: "not_configured", web: "failed" } as IntelSources,
      profileGaps,
    });
  }

  const queries = buildQueries(profile);
  const sources: IntelSources = { youtube: "not_configured", web: "failed" };

  // ---- YouTube: verified public metrics --------------------------------
  const accountCandidates: AccountCandidate[] = [];
  const contentCandidates: ContentCandidate[] = [];

  if (ytConfigured()) {
    try {
      // Two channel searches and three video searches keep quota sane
      // (search costs 100 units each against a 10k/day budget). Video
      // results are what the niche patterns and trend direction are counted
      // over, so they get the larger share.
      const chQueries = queries.slice(0, 2);
      const vidQueries = queries.slice(0, 3);

      const chResults = await Promise.all(
        chQueries.map(async (q) => ({ q, list: await searchChannels(q.q, 5) })),
      );
      for (const { q, list } of chResults) {
        for (const ch of list) {
          accountCandidates.push({
            platform: "youtube",
            platformAccountId: ch.channelId ?? ch.handle,
            handle: ch.handle,
            displayName: ch.title ?? null,
            profileImage: ch.avatar ?? null,
            profileUrl: ch.url ?? null,
            followers: ch.subscribers ?? null,
            location: null,
            category: null,
            dataSource: "youtube_api",
            matchedIntent: q.intent,
          });
        }
      }

      const vidResults = await Promise.all(
        vidQueries.map(async (q) => ({ q, list: await searchVideos(q.q, 10, 90) })),
      );
      // A view count only becomes "N× normal" against that creator's own
      // median, so fetch the median for the channels we actually surface.
      const channelIds = [...new Set(vidResults.flatMap((r) => r.list.map((v) => v.channelId)))].slice(0, 16);
      const medians = new Map<string, number | null>();
      await Promise.all(
        channelIds.map(async (id) => {
          try {
            const ch = await resolveChannel(id);
            medians.set(id, ch?.uploadsPlaylist ? await channelMedianViews(ch.uploadsPlaylist) : null);
          } catch {
            medians.set(id, null);
          }
        }),
      );

      for (const { q, list } of vidResults) {
        for (const v of list) {
          const med = medians.get(v.channelId) ?? null;
          contentCandidates.push({
            platform: "youtube",
            contentUrl: canonicalUrl(v.url),
            accountHandle: v.channelTitle || null,
            accountName: v.channelTitle || null,
            accountImage: null,
            thumbnailUrl: v.thumb,
            title: v.title,
            publishedAt: v.publishedAt || null,
            // From the real duration: YouTube's Shorts limit is three minutes.
            contentType: ytFormat(v.durationSec) === "Video" ? "video" : "short",
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            multiplier: med && med > 0 && v.views != null ? v.views / med : null,
            dataSource: "youtube_api",
            why: null,
            matchedIntent: q.intent,
          });
        }
      }
      sources.youtube = "ok";
    } catch {
      sources.youtube = "failed";
    }
  }

  // ---- Web research: Instagram / Facebook, no metrics -------------------
  if (!process.env.ANTHROPIC_API_KEY) {
    sources.web = "no_key";
  } else {
    const where = location ? ` The business is based in ${location}.` : "";
    const goalLine = goalText ? ` Their stated goal: "${goalText}".` : "";
    const prompt = `A ${niche} business${brandName ? ` called ${brandName}` : ""} wants to know which Instagram and Facebook accounts to watch, and which recent posts are worth studying.${where}${goalLine}

Search the web and return BOTH:
1. Up to 6 real Instagram or Facebook ACCOUNTS relevant to them (direct competitors, local businesses competing for the same customers, or creators in this niche).
2. Up to 5 real recent Instagram Reels or Facebook videos in this niche.

${ownHandle ? `Exclude the account "@${ownHandle}".` : ""}

STRICT HONESTY RULES:
- Only include accounts and URLs you actually found in search results. Never invent a handle or URL.
- Do NOT provide follower counts, view counts, likes, or any metric. You cannot verify them and they will be discarded.
- "why": ONE short sentence on why it is relevant to this specific business.

Output ONLY this JSON, no other text:
[{"kind":"account","platform":"instagram"|"facebook","handle":"...","name":"...","why":"..."},
 {"kind":"content","platform":"instagram"|"facebook","url":"...","creator":"...","title":"...","why":"..."}]`;

    try {
      type MsgParam = { role: "user" | "assistant"; content: unknown };
      const messages: MsgParam[] = [{ role: "user", content: prompt }];
      let text = "";
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await (anthropic.messages.create as any)({
          model: SEARCH_MODEL,
          max_tokens: 4000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages,
        });
        text = res.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("\n");
        if (res.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: res.content });
      }

      for (const raw of parseJsonArray(text)) {
        const r = raw as Record<string, unknown>;
        const platform = r.platform === "facebook" ? "facebook" : "instagram";
        if (r.kind === "account") {
          const handle = typeof r.handle === "string" ? r.handle.trim().replace(/^@/, "") : "";
          if (!/^[a-zA-Z0-9._-]{1,40}$/.test(handle)) continue;
          if (ownHandle && handle.toLowerCase() === ownHandle.toLowerCase()) continue;
          accountCandidates.push({
            platform,
            platformAccountId: handle.toLowerCase(),
            handle: handle.toLowerCase(),
            displayName: typeof r.name === "string" ? r.name : handle,
            profileImage: null,
            profileUrl: platform === "facebook"
              ? `https://facebook.com/${handle}`
              : `https://instagram.com/${handle}`,
            // Neither platform publishes this to third parties.
            followers: null,
            location: null,
            category: null,
            dataSource: "web_research",
            note: typeof r.why === "string" ? r.why : null,
          });
        } else if (r.kind === "content" && typeof r.url === "string") {
          let host = "";
          try {
            host = new URL(r.url).hostname;
          } catch {
            continue;
          }
          if (!/instagram\.com|facebook\.com|fb\.watch/.test(host)) continue;
          contentCandidates.push({
            platform,
            contentUrl: canonicalUrl(r.url),
            accountHandle: typeof r.creator === "string" ? r.creator.replace(/^@/, "") : null,
            accountName: typeof r.creator === "string" ? r.creator.replace(/^@/, "") : null,
            accountImage: null,
            thumbnailUrl: null,
            title: typeof r.title === "string" ? r.title : null,
            publishedAt: null,
            contentType: "reel",
            views: null, likes: null, comments: null, multiplier: null,
            dataSource: "web_research",
            why: typeof r.why === "string" ? r.why : null,
          });
        }
      }
      sources.web = "ok";
    } catch (e) {
      sources.web = aiFailureKind(e);
    }
  }

  // ---- score, classify, dedupe ------------------------------------------
  const accounts = dedupeAccounts(accountCandidates.map((c) => scoreAccount(c, profile))).slice(0, 24);
  const content = dedupeContent(contentCandidates.map((c) => scoreContent(c, profile))).slice(0, 40);
  const trends = rollUpTrends(content);
  const ranAt = new Date().toISOString();

  // ---- persist (best effort; a failure must not fail the response) ------
  if (accounts.length || content.length) {
    try {
      // Upsert, never replace. Web research returns a different slice of the
      // market on every run, so deleting first meant a refresh could destroy
      // the best finds — the four local pizzerias vanished exactly this way.
      // Rows accumulate and last_checked carries their freshness; stale ones
      // are pruned below by age, not by absence from one run.
      if (accounts.length) {
        await supabase.from("discovered_accounts").upsert(
          accounts.map((a) => ({
            user_id: user.id, platform: a.platform, platform_account_id: a.platformAccountId,
            handle: a.handle, display_name: a.displayName, profile_image: a.profileImage,
            profile_url: a.profileUrl, followers: a.followers, location: a.location,
            category: a.category, classification: a.classification,
            relevance_score: a.relevanceScore, relevance_reasons: a.relevanceReasons,
            data_source: a.dataSource, last_checked: ranAt,
          })),
          { onConflict: "user_id,platform,platform_account_id" },
        );
      }
      if (content.length) {
        await supabase.from("discovered_content").upsert(
          content.map((c) => ({
            user_id: user.id, content_url: c.contentUrl, platform: c.platform,
            account_handle: c.accountHandle, account_name: c.accountName,
            account_image: c.accountImage, thumbnail_url: c.thumbnailUrl, title: c.title,
            published_at: c.publishedAt, content_type: c.contentType, views: c.views,
            likes: c.likes, comments: c.comments, multiplier: c.multiplier,
            relevance_score: c.relevanceScore, relevance_reasons: c.relevanceReasons,
            trend_tags: c.trendTags, why_recommended: c.why, data_source: c.dataSource,
            last_checked: ranAt,
          })),
          { onConflict: "user_id,content_url" },
        );
      }

      // Prune by age so the list stays current without a single unlucky run
      // wiping good accounts. 30 days for accounts, 14 for content, since a
      // "winning post" goes stale faster than a competitor does.
      const accountCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const contentCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
      await supabase.from("discovered_accounts").delete()
        .eq("user_id", user.id).lt("last_checked", accountCutoff);
      await supabase.from("discovered_content").delete()
        .eq("user_id", user.id).lt("last_checked", contentCutoff);
      await supabase.from("discovery_runs").upsert(
        {
          user_id: user.id, ran_at: ranAt, accounts_found: accounts.length,
          content_found: content.length, sources,
        },
        { onConflict: "user_id" },
      );
    } catch {
      /* tables may not exist yet — the response below still serves */
    }
  }

  // Return everything SOCIA knows, not just what this run happened to find —
  // otherwise a refresh visibly loses accounts it had already discovered.
  const merged = await readStored(supabase, user.id);
  const doc: IntelDoc = merged
    ? { ...merged, ranAt, sources, profileGaps }
    : { accounts, content, trends, ranAt, sources, profileGaps };
  return NextResponse.json(doc);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readStored(supabase: any, userId: string): Promise<IntelDoc | null> {
  try {
    const [runRes, accRes, conRes] = await Promise.all([
      supabase.from("discovery_runs").select("ran_at, sources").eq("user_id", userId).maybeSingle(),
      supabase.from("discovered_accounts").select("*").eq("user_id", userId).order("relevance_score", { ascending: false }),
      supabase.from("discovered_content").select("*").eq("user_id", userId).order("relevance_score", { ascending: false }),
    ]);
    if (!runRes.data?.ran_at) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts: ScoredAccount[] = (accRes.data ?? []).map((r: any) => ({
      platform: r.platform, platformAccountId: r.platform_account_id, handle: r.handle,
      displayName: r.display_name, profileImage: r.profile_image, profileUrl: r.profile_url,
      followers: r.followers, location: r.location, category: r.category,
      classification: r.classification, relevanceScore: r.relevance_score ?? 0,
      relevanceReasons: r.relevance_reasons ?? [], dataSource: r.data_source,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: ScoredContent[] = (conRes.data ?? []).map((r: any) => ({
      platform: r.platform, contentUrl: r.content_url, accountHandle: r.account_handle,
      accountName: r.account_name, accountImage: r.account_image, thumbnailUrl: r.thumbnail_url,
      title: r.title, publishedAt: r.published_at, contentType: r.content_type,
      views: r.views, likes: r.likes, comments: r.comments,
      multiplier: r.multiplier != null ? Number(r.multiplier) : null,
      relevanceScore: r.relevance_score ?? 0, relevanceReasons: r.relevance_reasons ?? [],
      trendTags: r.trend_tags ?? [], why: r.why_recommended, dataSource: r.data_source,
    }));
    return {
      accounts, content, trends: rollUpTrends(content), ranAt: runRes.data.ran_at,
      sources: runRes.data.sources ?? { youtube: "ok", web: "ok" }, profileGaps: [],
    };
  } catch {
    return null;
  }
}
