// Evidence for the Content Plan strategist, assembled from what SOCIA already
// holds about the account: every recent post with its real numbers, the
// competitors it tracks or discovered, and the winning content it found. The
// model reasons over these facts; it is told to cite nothing else.

import type { IgMediaItem, IgSnapshot } from "./instagramSync";
import { engagementOf, median, postsPerWeek } from "./metrics";
import type { EvidenceUsed } from "./schema";

export type Evidence = {
  postsBlock: string;
  competitorsBlock: string;
  used: EvidenceUsed;
};

const FMT: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Static" };
const fmtOf = (m: { media_type?: string }) => FMT[m.media_type ?? ""] ?? "Post";
const firstLine = (s?: string | null) =>
  (s ?? "").split("\n").map((x) => x.trim()).find(Boolean)?.slice(0, 70) ?? "(no caption)";
const dayOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : "unknown date");
const n = (x: number | null | undefined) => (typeof x === "number" ? x.toLocaleString("en-US") : null);

/** The account's own posts as evidence: each post with its real numbers, then
 *  the few aggregates a strategist would compute from them. Nothing estimated. */
export function ownPostsBlock(media: IgMediaItem[], followers: number | null): string {
  const posts = media.filter((m) => m.timestamp || m.caption).slice(0, 25);
  if (!posts.length) return "";
  const lines = posts.map(
    (m) =>
      `- ${dayOf(m.timestamp)} · ${fmtOf(m)} · "${firstLine(m.caption)}" · ${m.like_count ?? 0} likes, ${m.comments_count ?? 0} comments`,
  );
  const byFmt = new Map<string, number[]>();
  for (const m of posts) byFmt.set(fmtOf(m), [...(byFmt.get(fmtOf(m)) ?? []), engagementOf(m)]);
  const fmtLines = [...byFmt.entries()].map(
    ([f, xs]) => `${f}: ${xs.length} post${xs.length === 1 ? "" : "s"}, median ${median(xs)} engagement`,
  );
  const sorted = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a));
  const describe = (m: IgMediaItem) => `"${firstLine(m.caption)}" (${fmtOf(m)}, ${engagementOf(m)})`;
  const top = sorted.slice(0, 3).map(describe);
  const bottom = sorted.length > 3 ? sorted.slice(-3).reverse().map(describe) : [];
  const ppw = postsPerWeek(posts.map((p) => p.timestamp));
  const allMed = median(posts.map(engagementOf));
  const rate = followers && allMed != null ? `${((allMed / followers) * 100).toFixed(2)}% of followers` : null;

  return [
    `${posts.length} most recent posts, newest first (engagement = likes + comments; the Instagram API exposes no views or saves for these):`,
    ...lines,
    ``,
    `Aggregates SOCIA computed from the list above:`,
    `- Followers: ${n(followers) ?? "unknown"}`,
    `- Cadence: ${ppw != null ? `${ppw.toFixed(1)} posts/week over the last 30 days` : "no posts in the last 30 days"}`,
    `- Median engagement per post: ${allMed ?? "n/a"}${rate ? ` (${rate})` : ""}`,
    `- By format: ${fmtLines.join("; ")}`,
    `- Strongest posts: ${top.join("; ")}`,
    bottom.length ? `- Weakest posts: ${bottom.join("; ")}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export type CompetitorRow = {
  platform: string;
  handle: string | null;
  display_name: string | null;
  followers: number | null;
  location: string | null;
  category: string | null;
  classification: string | null;
  relevance_score: number | null;
};

export type TrackedRow = { platform: string; handle: string };

export type WinningRow = {
  platform: string;
  account_name: string | null;
  title: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  multiplier: number | null;
  trend_tags: unknown;
  why_recommended: string | null;
  published_at: string | null;
};

const PLATFORM: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
const CLASS: Record<string, string> = {
  direct_competitor: "direct competitor",
  adjacent_competitor: "adjacent account",
};
const audienceWord = (platform: string) => (platform === "youtube" ? "subscribers" : "followers");

/** Competitors and winning content as evidence. Metrics appear only where a
 *  platform actually published them; everything else says so. */
export function competitorsBlock(accounts: CompetitorRow[], tracked: TrackedRow[], winning: WinningRow[]): string {
  const seen = new Set<string>();
  const accountLines: string[] = [];
  for (const a of [...accounts].sort((x, y) => (y.relevance_score ?? -1) - (x.relevance_score ?? -1)).slice(0, 10)) {
    const handle = a.handle ? `@${a.handle.replace(/^@/, "")}` : a.display_name ?? "(unnamed)";
    seen.add(`${a.platform}:${(a.handle ?? a.display_name ?? "").toLowerCase().replace(/^@/, "")}`);
    const bits = [
      PLATFORM[a.platform] ?? a.platform,
      CLASS[a.classification ?? ""] ?? a.classification ?? null,
      a.followers != null ? `${n(a.followers)} ${audienceWord(a.platform)}` : `${audienceWord(a.platform)} not published`,
      a.location,
      a.category,
    ].filter(Boolean);
    accountLines.push(`- ${handle}${a.display_name && a.handle ? ` (${a.display_name})` : ""} · ${bits.join(" · ")}`);
  }
  for (const t of tracked) {
    const key = `${t.platform}:${t.handle.toLowerCase().replace(/^@/, "")}`;
    if (seen.has(key)) continue;
    accountLines.push(
      `- @${t.handle.replace(/^@/, "")} · ${PLATFORM[t.platform] ?? t.platform} · added by the user · no public metrics available for this account`,
    );
  }

  const ranked = [...winning].sort((x, y) => (y.multiplier ?? -1) - (x.multiplier ?? -1) || (y.views ?? -1) - (x.views ?? -1)).slice(0, 12);
  const winningLines = ranked.map((w) => {
    const nums = [
      w.views != null ? `${n(w.views)} views` : null,
      w.likes != null ? `${n(w.likes)} likes` : null,
      w.comments != null ? `${n(w.comments)} comments` : null,
    ].filter(Boolean);
    const tags = Array.isArray(w.trend_tags) ? (w.trend_tags as unknown[]).filter((t) => typeof t === "string").slice(0, 4).join(", ") : "";
    return [
      `- "${(w.title ?? "(untitled)").slice(0, 90)}" by ${w.account_name ?? "unknown"} (${PLATFORM[w.platform] ?? w.platform}${w.published_at ? `, ${dayOf(w.published_at)}` : ""})`,
      nums.length ? nums.join(", ") : "metrics not published",
      w.multiplier != null ? `${w.multiplier >= 10 ? w.multiplier.toFixed(0) : w.multiplier.toFixed(1)}× that creator's median` : null,
      tags ? `patterns: ${tags}` : null,
      w.why_recommended ? `why it matters: ${w.why_recommended.slice(0, 160)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  });

  if (!accountLines.length && !winningLines.length) return "";
  return [
    accountLines.length ? `Competitor and niche accounts SOCIA has on file (${accountLines.length}):` : null,
    ...accountLines,
    winningLines.length ? `${accountLines.length ? "\n" : ""}Winning content SOCIA found in this niche (${winningLines.length}, best first; "×" is that creator's own median):` : null,
    ...winningLines,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** Everything the strategist may cite, read from the user's own rows. Each
 *  source is best-effort: a missing table simply contributes nothing. */
export async function loadEvidence(supabase: Supa, userId: string, snap: IgSnapshot | null): Promise<Evidence> {
  const media = snap?.media ?? [];
  const followers = snap?.followers_count ?? null;

  let accounts: CompetitorRow[] = [];
  let tracked: TrackedRow[] = [];
  let winning: WinningRow[] = [];
  try {
    const { data } = await supabase
      .from("discovered_accounts")
      .select("platform, handle, display_name, followers, location, category, classification, relevance_score")
      .eq("user_id", userId)
      .order("relevance_score", { ascending: false, nullsFirst: false })
      .limit(12);
    accounts = (data ?? []) as CompetitorRow[];
  } catch { /* none */ }
  try {
    const { data } = await supabase.from("tracked_competitors").select("platform, handle").eq("user_id", userId).limit(20);
    tracked = (data ?? []) as TrackedRow[];
  } catch { /* none */ }
  try {
    const { data } = await supabase
      .from("discovered_content")
      .select("platform, account_name, title, views, likes, comments, multiplier, trend_tags, why_recommended, published_at")
      .eq("user_id", userId)
      .order("multiplier", { ascending: false, nullsFirst: false })
      .limit(30);
    winning = (data ?? []) as WinningRow[];
  } catch { /* none */ }

  const postsBlock = ownPostsBlock(media, followers);
  const competitorsBlock_ = competitorsBlock(accounts, tracked, winning);
  const competitorCount = new Set([
    ...accounts.map((a) => `${a.platform}:${(a.handle ?? a.display_name ?? "").toLowerCase().replace(/^@/, "")}`),
    ...tracked.map((t) => `${t.platform}:${t.handle.toLowerCase().replace(/^@/, "")}`),
  ]).size;

  return {
    postsBlock,
    competitorsBlock: competitorsBlock_,
    used: {
      posts: postsBlock ? Math.min(media.length, 25) : 0,
      competitors: competitorsBlock_ ? Math.min(competitorCount, 10 + tracked.length) : 0,
      winning: competitorsBlock_ ? Math.min(winning.length, 12) : 0,
      windows: false,
      followers,
    },
  };
}
