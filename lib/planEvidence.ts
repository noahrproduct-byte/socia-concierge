// Evidence for the Content Plan strategist, assembled from what SOCIA already
// holds about the account: every recent post with its real numbers, the
// competitors it tracks or discovered, and the winning content it found. The
// model reasons over these facts; it is told to cite nothing else.

import { STYLE_LABEL, sanitizeMemory, styleKey, type Style } from "./discoverStyle";
import type { IgMediaItem, IgSnapshot } from "./instagramSync";
import { engagementOf, median, postsPerWeek } from "./metrics";
import type { EvidenceUsed } from "./schema";
import { listTracked } from "./trackedCompetitors";
import { scopeToWorkspace } from "./workspaces";
import type { PlanOutcome, ItemOutcome } from "./planOutcomes";
import { activeFindings } from "./intel/insightStore";
import { FORMATS_PRODUCER, formatsEvidence } from "./nicheFormats";
import { reasonLabel } from "./planItems";
import { experimentResults } from "./experimentsLoad";
import { experimentsEvidence } from "./experiments";
import type { GrowthStrategy } from "./strategy";
import type { Deliverable } from "./schema";
import { intelFor } from "./intel/profileLoad";
import { playbookTextFor } from "./nicheScan/run";
import { provenEvidence, trendsEvidence, type ProvenReel } from "./trendSignals";
import { isOwnAccount, ownAccounts } from "./ownAccounts";
import { createServiceClient } from "./supabase/service";
import { dismissedHandles } from "./competitorAutoPick";
import { ownPostNumbers, type OwnPostRef } from "./planEvidenceFormat";
export { ownPostNumbers, type OwnPostRef };
import { goalMetric, type Goal } from "./growth";
import { interactionsTotal } from "./engagement";
import { readinessLines, readinessOf, readinessThresholds } from "./starter/readiness";

export type Evidence = {
  postsBlock: string;
  competitorsBlock: string;
  /** What became of the previous plans: posted or not, and each post's result against the median. */
  outcomesBlock: string;
  /** Formats that lead across other accounts' posts in the niche (lib/nicheFormats.ts, from the insights store). */
  formatsBlock: string;
  /** What goes viral in the niche, from the Reels the niche scan studied (lib/nicheScan/playbook.ts playbookPrompt); "" without one. */
  playbookBlock?: string;
  /** What the person approved, turned down (and why) and added themselves in their recent plans. */
  decisionsBlock: string;
  /** How the strategy's experiments are going: their test posts' results and verdicts. */
  experimentsBlock: string;
  /** Hook structures, topics and opening lines leading in the niche's recent Reels (lib/trendSignals.ts). */
  trendsBlock: string;
  /** The niche's Reels that took off, each with the id a post cites (lib/trendSignals.ts provenEvidence), and the Reels behind those ids. */
  provenBlock?: string;
  /** How each listed Reel's account makes its videos (null when SOCIA hasn't read it), by the Reel's id. */
  provenStyles?: Record<string, Style | null>;
  proven?: ProvenReel[];
  /** The account's own posts behind the P# ids in postsBlock, so a post's cited ids can be turned into links. */
  ownPosts?: OwnPostRef[];
  /** Drafts and scheduled posts already on the Calendar for the next two weeks (calendarBlock); "" when none. */
  calendarBlock?: string;
  /** The brand's measurable goals with where they stand (goalsBlock); "" when none. */
  goalsBlock?: string;
  /** How much of the account's own history there is to build on (lib/starter/readiness.ts). */
  readinessBlock?: string;
  /** "starting" | "learning" | "established", from the same read. */
  stage?: "starting" | "learning" | "established";
  used: EvidenceUsed;
};

const FMT: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Static" };
const fmtOf = (m: { media_type?: string }) => FMT[m.media_type ?? ""] ?? "Post";
const firstLine = (s?: string | null) =>
  (s ?? "").split("\n").map((x) => x.trim()).find(Boolean)?.slice(0, 70) ?? "(no caption)";
const dayOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : "unknown date");
const n = (x: number | null | undefined) => (typeof x === "number" ? x.toLocaleString("en-US") : null);

/** The posts the plan sees, newest first, each with the id a post may cite (P1 is the newest). */
export function ownPostRefs(media: IgMediaItem[]): OwnPostRef[] {
  return media.filter((m) => m.timestamp || m.caption).slice(0, 25).map((m, i) => ({
    id: `P${i + 1}`,
    url: typeof m.permalink === "string" && /^https:\/\//.test(m.permalink) ? m.permalink : null,
    date: m.timestamp ? m.timestamp.slice(0, 10) : null,
    title: firstLine(m.caption),
    format: fmtOf(m),
    likes: m.like_count ?? 0,
    comments: m.comments_count ?? 0,
    views: m.insights?.views ?? null,
    reach: m.insights?.reach ?? null,
    saved: m.insights?.saved ?? null,
    shares: m.insights?.shares ?? null,
  }));
}

/** The account's own posts as evidence: each post with its id and its real
 *  numbers, then the few aggregates a strategist would compute from them.
 *  Nothing estimated: a number Instagram didn't return is left out, not zero. */
export function ownPostsBlock(media: IgMediaItem[], followers: number | null): string {
  const posts = media.filter((m) => m.timestamp || m.caption).slice(0, 25);
  if (!posts.length) return "";
  const refs = ownPostRefs(media);
  const lines = refs.map((r) => `- [${r.id}] ${r.date ?? "unknown date"} · ${r.format} · "${r.title}" · ${ownPostNumbers(r)}`);
  const byFmt = new Map<string, number[]>();
  for (const m of posts) byFmt.set(fmtOf(m), [...(byFmt.get(fmtOf(m)) ?? []), engagementOf(m)]);
  const fmtLines = [...byFmt.entries()].map(
    ([f, xs]) => `${f}: ${xs.length} post${xs.length === 1 ? "" : "s"}, median ${median(xs)} engagement`,
  );
  const ranked = refs.map((r, i) => ({ r, e: engagementOf(posts[i]) })).sort((a, b) => b.e - a.e);
  const describe = (x: { r: OwnPostRef; e: number }) => `[${x.r.id}] "${x.r.title}" (${x.r.format}, ${x.e})`;
  const top = ranked.slice(0, 3).map(describe);
  const bottom = ranked.length > 3 ? ranked.slice(-3).reverse().map(describe) : [];
  const ppw = postsPerWeek(posts.map((p) => p.timestamp));
  const allMed = median(posts.map(engagementOf));
  const rate = followers && allMed != null ? `${((allMed / followers) * 100).toFixed(2)}% of followers` : null;
  const views = refs.map((r) => r.views).filter((v): v is number => v != null);
  const medViews = views.length >= 3 ? median(views) : null;

  return [
    `${posts.length} most recent posts, newest first. Each has an id (P1 is the newest) that a planned post may cite. Engagement = likes + comments. Views, reach, saves and shares appear only where Instagram's insights returned them; where they are missing they are unknown, never zero, and must not be estimated:`,
    ...lines,
    ``,
    `Aggregates SOCIA computed from the list above:`,
    `- Followers: ${n(followers) ?? "unknown"}`,
    `- Cadence: ${ppw != null ? `${ppw.toFixed(1)} posts/week over the last 30 days` : "no posts in the last 30 days"}`,
    `- Median engagement per post: ${allMed ?? "n/a"}${rate ? ` (${rate})` : ""}`,
    medViews != null ? `- Median views per post: ${n(medViews)} (${views.length} posts with views)` : null,
    `- By format: ${fmtLines.join("; ")}`,
    `- Strongest posts: ${top.join("; ")}`,
    bottom.length ? `- Weakest posts: ${bottom.join("; ")}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** The brand's measurable goals with where they stand, for the plan to aim at. "" when it has none. */
export function goalsBlock(goals: Goal[]): string {
  const live = goals.filter((g) => g.status !== "dropped" && g.status !== "achieved").slice(0, 5);
  if (!live.length) return "";
  return live.map((g) => {
    const m = goalMetric(g.metric);
    const now = g.current_value ?? g.baseline;
    return `- ${g.kind === "primary" ? "Main goal" : "Also"}: ${m?.label ?? g.metric}: ${now != null ? `from ${n(now)} ` : ""}to ${n(g.target)}${g.due_date ? ` by ${g.due_date}` : ""}${m && !m.measuredOn.length ? " (the person reports this number; SOCIA can't see it)" : ""}`;
  }).join("\n");
}

/** One post already on the Calendar in the coming two weeks, as the plan is told about it. */
export type CalendarRow = { scheduled_at: string; caption: string | null; status: string; plan_id?: string | null };

/** What is already on the Calendar for the next two weeks, so a new plan neither double-books a day nor repeats a topic. "" when nothing is. */
export function calendarBlock(rows: CalendarRow[], timeZone: string | null): string {
  const live = rows.filter((r) => r.status === "draft" || r.status === "scheduled").slice(0, 20);
  if (!live.length) return "";
  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) }); } catch { return iso.slice(0, 10); }
  };
  return live.map((r) => `- ${fmt(r.scheduled_at)} · ${r.status === "scheduled" ? "scheduled" : "draft"} · "${firstLine(r.caption) || "(no caption yet)"}"${r.plan_id ? " · from an earlier plan" : ""}`).join("\n");
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

/** An Instagram account's latest public numbers as SOCIA last read them (ig_competitor_snapshots, lib/igCompetitorData.ts). */
export type IgSnapRow = {
  handle: string;
  display_name?: string | null;
  followers: number | null;
  posts_per_week: number | string | null;
  median_engagement: number | string | null;
  media?: unknown;
  fetched_at?: string | null;
};

const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const medianOf = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * What Instagram published for one account, as SOCIA last read it: followers,
 * how often it posts, the median likes plus comments of its recent posts, and
 * median views once three of those posts carry views. Only numbers that were
 * read; "" when the row holds none.
 */
export function igSnapLine(r: IgSnapRow): string {
  const media = Array.isArray(r.media) ? (r.media as { views?: unknown }[]) : [];
  const views = media.map((m) => numOrNull(m?.views)).filter((v): v is number => v != null);
  const perWeek = numOrNull(r.posts_per_week);
  const eng = numOrNull(r.median_engagement);
  const bits = [
    r.followers != null ? `${n(r.followers)} followers` : null,
    perWeek != null ? `${perWeek.toFixed(1)} posts a week` : null,
    eng != null ? `median ${n(Math.round(eng))} likes and comments a post${media.length ? ` (last ${media.length})` : ""}` : null,
    views.length >= 3 ? `median ${n(Math.round(medianOf(views)!))} views (${views.length} posts)` : null,
  ].filter(Boolean);
  if (!bits.length) return "";
  return `${bits.join(", ")}${r.fetched_at ? `; read from Instagram ${dayOf(r.fetched_at)}` : ""}`;
}

const snapKey = (handle: string) => handle.toLowerCase().replace(/^@/, "");

/** The saved Instagram reads for these handles, by handle. Best-effort: none when the table can't be read. */
export async function loadIgSnaps(supabase: Supa, userId: string, handles: string[]): Promise<Map<string, IgSnapRow>> {
  const out = new Map<string, IgSnapRow>();
  const wanted = [...new Set(handles.map(snapKey).filter(Boolean))].slice(0, 30);
  if (!wanted.length) return out;
  try {
    // One customer's saved reads only: the table is keyed by its user_id.
    const { data } = await supabase.from("ig_competitor_snapshots").select("user_id, handle, display_name, followers, posts_per_week, median_engagement, media, fetched_at").eq("user_id", userId).in("handle", wanted);
    for (const r of (data ?? []) as IgSnapRow[]) out.set(snapKey(r.handle), r);
  } catch {
    /* no saved reads */
  }
  return out;
}

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
const outcomeWord = (o: ItemOutcome): string => {
  if (o.state === "unscheduled") return "NOT DONE (never put on the Calendar)";
  if (o.state === "published") {
    const r = o.result;
    if (!r || !r.measured) return "posted; the platform has not reported it yet";
    return `posted; ${r.text}`;
  }
  if (o.state === "failed") return "publishing FAILED";
  if (o.state === "scheduled" || o.state === "publishing") return `scheduled for ${o.scheduledAt ? o.scheduledAt.slice(0, 10) : "later"}, not out yet`;
  return "still a draft on the Calendar (never published)";
};

/** The previous plans as evidence: each planned post, what the plan predicted,
 *  and what actually happened. Only plans that reached the Calendar are
 *  included; a plan nobody acted on teaches nothing about the content. */
export function outcomesBlock(outcomes: PlanOutcome[]): string {
  const acted = outcomes
    .filter((o) => o.summary.onCalendar > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2);
  if (!acted.length) return "";
  const parts: string[] = [];
  const worked: string[] = [];
  const missed: string[] = [];
  const skipped: string[] = [];
  for (const o of acted) {
    parts.push(`Plan of ${o.createdAt.slice(0, 10)}: ${o.summary.published} of ${o.summary.total} posted${o.summary.skipped.length ? `, ${o.summary.skipped.length} never done` : ""}.`);
    for (const it of o.items) {
      parts.push(`- ${it.day} · ${it.format} · "${it.concept.slice(0, 80)}" · predicted: ${it.predicted || "n/a"} · actual: ${outcomeWord(it)}`);
      const m = it.result?.measured && !it.result.early ? it.result.multiplier : null;
      if (m != null && m >= 1.2) worked.push(`"${it.concept.slice(0, 60)}" (${it.format}, ${it.result!.short})`);
      else if (m != null && m < 0.8) missed.push(`"${it.concept.slice(0, 60)}" (${it.format}, ${it.result!.short})`);
      if (it.state === "unscheduled") skipped.push(`${it.day}: "${it.concept.slice(0, 60)}"`);
    }
  }
  const lessons: string[] = [];
  if (worked.length) lessons.push(`Beat the account's median: ${worked.join("; ")}.`);
  if (missed.length) lessons.push(`Fell short of the median: ${missed.join("; ")}.`);
  if (skipped.length) lessons.push(`Planned but never made: ${skipped.join("; ")}.`);
  return [
    `What became of the previous plan${acted.length > 1 ? "s" : ""} (SOCIA matched each planned day to the post made from it and measured the post against the account's own median):`,
    ...parts,
    ...(lessons.length ? ["", "Lessons SOCIA computed from the above:", ...lessons.map((l) => `- ${l}`)] : []),
  ].join("\n");
}

export function competitorsBlock(accounts: CompetitorRow[], tracked: TrackedRow[], winning: WinningRow[], igSnaps: Map<string, IgSnapRow> = new Map()): string {
  const seen = new Set<string>();
  // An Instagram account's saved public numbers, when SOCIA has read them.
  const igLine = (platform: string, handle: string | null) => {
    const snap = platform === "instagram" && handle ? igSnaps.get(snapKey(handle)) : undefined;
    return snap ? igSnapLine(snap) : "";
  };
  const accountLines: string[] = [];
  for (const a of [...accounts].sort((x, y) => (y.relevance_score ?? -1) - (x.relevance_score ?? -1)).slice(0, 10)) {
    const handle = a.handle ? `@${a.handle.replace(/^@/, "")}` : a.display_name ?? "(unnamed)";
    seen.add(`${a.platform}:${(a.handle ?? a.display_name ?? "").toLowerCase().replace(/^@/, "")}`);
    const read = igLine(a.platform, a.handle);
    const bits = [
      PLATFORM[a.platform] ?? a.platform,
      CLASS[a.classification ?? ""] ?? a.classification ?? null,
      read || (a.followers != null ? `${n(a.followers)} ${audienceWord(a.platform)}` : `${audienceWord(a.platform)} not published`),
      a.location,
      a.category,
    ].filter(Boolean);
    accountLines.push(`- ${handle}${a.display_name && a.handle ? ` (${a.display_name})` : ""} · ${bits.join(" · ")}`);
  }
  for (const t of tracked) {
    const key = `${t.platform}:${t.handle.toLowerCase().replace(/^@/, "")}`;
    if (seen.has(key)) continue;
    accountLines.push(
      `- @${t.handle.replace(/^@/, "")} · ${PLATFORM[t.platform] ?? t.platform} · tracked by the user · ${igLine(t.platform, t.handle) || "no public numbers read for this account yet"}`,
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

type PlanRow = { created_at: string; data: { weeklyPlan?: Deliverable["weeklyPlan"] } | null };

/** The person's calls on recent plans: turned down (with their reasons), kept, and their own ideas. Newest plan first. */
export function decisionsBlock(plans: PlanRow[]): string {
  const rejected: string[] = [], kept: string[] = [], own: string[] = [];
  for (const p of plans) {
    for (const it of p.data?.weeklyPlan ?? []) {
      const what = `"${(it.title || it.concept).slice(0, 90)}" (${it.format}${it.platform ? `, ${it.platform}` : ""})`;
      if (it.source === "own") own.push(`- ${what}`);
      else if (it.decision?.status === "rejected") {
        const why = [...(it.decision.reasons ?? []).map(reasonLabel), it.decision.note ? `"${it.decision.note}"` : null].filter(Boolean).join("; ");
        rejected.push(`- ${what}${why ? `: ${why}` : ": no reason given"}`);
      } else if (it.decision?.status === "approved") kept.push(`- ${what}`);
    }
  }
  if (!rejected.length && !kept.length && !own.length) return "";
  return [
    rejected.length ? `Ideas they turned down:\n${rejected.slice(0, 12).join("\n")}` : "",
    kept.length ? `Ideas they approved:\n${kept.slice(0, 12).join("\n")}` : "",
    own.length ? `Ideas they added themselves:\n${own.slice(0, 8).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** A Reel's address without its query or trailing slash, so the same Reel matches however it was linked. */
export const reelKey = (url: string) => url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/** The Reels earlier plans built a post on (each post's reference). Pure. */
export function usedReelUrls(plans: { data: unknown }[]): Set<string> {
  const out = new Set<string>();
  for (const p of plans) {
    const items = (p.data as { weeklyPlan?: { ref?: { url?: unknown } }[] } | null)?.weeklyPlan;
    for (const it of Array.isArray(items) ? items : []) if (typeof it?.ref?.url === "string") out.add(reelKey(it.ref.url));
  }
  return out;
}

/** The Reels not yet used by an earlier plan. Pure. */
export function unusedReels<T extends { url: string }>(reels: T[], used: Set<string>): T[] {
  return used.size ? reels.filter((r) => !used.has(reelKey(r.url))) : reels;
}

/** A handle as one key: no "@", lower case. */
export const handleKey = (h: string | null | undefined) => (h ?? "").trim().replace(/^@/, "").toLowerCase();

/**
 * Leaves out the competitors the person unticked for this plan: their rows,
 * their winning videos and their Reels. Matches on handle or display name. Pure.
 */
export function withoutSkipped<T>(rows: T[], skip: Set<string>, names: (r: T) => (string | null | undefined)[]): T[] {
  if (!skip.size) return rows;
  return rows.filter((r) => !names(r).some((n) => n && skip.has(handleKey(n))));
}

/** A competitor the plan builds on, as the Content Plan form lists it. */
export type PlanCompetitor = { platform: string; handle: string; name: string | null; avatar: string | null; source: "tracked" | "found" };

/**
 * The competitors a plan uses, as the form lists them: exactly the ones on
 * Discover's "Your competitors" (the tracked list, in the order added, never
 * the account's own, up to the plan's limit), so adding or removing one there
 * changes the plan too. Photos come from SOCIA's saved Instagram reads, else
 * the profile picture Discover found.
 */
export async function planCompetitors(supabase: Supa, userId: string, workspaceId?: string | null, limit?: number): Promise<PlanCompetitor[]> {
  const [tracked, mine] = await Promise.all([
    listTracked<TrackedRow>(supabase, userId, "platform, handle", { byAdded: true, workspaceId }).catch(() => [] as TrackedRow[]),
    ownAccounts(supabase, userId).catch(() => null),
  ]);
  const out: PlanCompetitor[] = [];
  const seen = new Set<string>();
  for (const t of tracked) {
    const k = handleKey(t.handle);
    if (!k || seen.has(k) || (mine && isOwnAccount(mine, { handle: t.handle }))) continue;
    seen.add(k);
    out.push({ platform: t.platform, handle: k, name: null, avatar: null, source: "tracked" });
  }
  const list = limit != null ? out.slice(0, Math.max(limit, 1)) : out;
  if (!list.length) return list;
  const handles = list.map((c) => c.handle).slice(0, 30);
  const [snaps, found] = await Promise.all([
    supabase.from("ig_competitor_snapshots").select("handle, display_name, profile_picture").eq("user_id", userId).in("handle", handles).then((r: { data: unknown }) => (r.data ?? []) as { handle: string; display_name: string | null; profile_picture: string | null }[], () => []),
    scopeToWorkspace(supabase.from("discovered_accounts").select("platform, handle, display_name, profile_image").eq("user_id", userId), workspaceId).in("handle", handles)
      .then((r: { data: unknown }) => (r.data ?? []) as { platform: string; handle: string; display_name: string | null; profile_image: string | null }[], () => []),
  ]);
  const snapBy = new Map((snaps as { handle: string; display_name: string | null; profile_picture: string | null }[]).map((r) => [handleKey(r.handle), r]));
  for (const c of list) {
    const sn = c.platform === "instagram" ? snapBy.get(c.handle) : undefined;
    const f = (found as { platform: string; handle: string; display_name: string | null; profile_image: string | null }[]).find((r) => r.platform === c.platform && handleKey(r.handle) === c.handle);
    c.avatar = sn?.profile_picture ?? f?.profile_image ?? null;
    c.name = sn?.display_name ?? f?.display_name ?? null;
  }
  return list;
}

/** Everything the strategist may cite, read from the user's own rows. Each
 *  source is best-effort: a missing table simply contributes nothing. */
export async function loadEvidence(supabase: Supa, userId: string, snap: IgSnapshot | null, workspaceId?: string | null, opts: { outcomes?: PlanOutcome[]; strategy?: GrowthStrategy | null; location?: string | null; skip?: string[]; timeZone?: string | null; now?: Date; brandWorkspaceId?: string | null; discover?: unknown } = {}): Promise<Evidence> {
  // Competitors the person unticked on the form, and accounts they removed on Discover, are left out of this plan entirely.
  const skip = new Set((opts.skip ?? []).map(handleKey).filter(Boolean));
  try {
    const svc = createServiceClient();
    const dismissed = svc ? await dismissedHandles(svc, userId, workspaceId ?? null) : null;
    for (const h of dismissed ?? []) skip.add(handleKey(h));
  } catch { /* none */ }
  const media = snap?.media ?? [];
  const followers = snap?.followers_count ?? null;

  // The brand's intelligence profile (lib/intel/profileLoad.ts): the discovered accounts and posts and the
  // niche read every feature shares, read live at most once a day unless the competitors changed.
  const intel = await intelFor({ client: supabase, ownerId: userId, scopeId: workspaceId ?? null }, { need: "live", location: opts.location ?? null }).catch(() => null);
  // YouTube search results count only once they passed the niche check (lib/nicheCheck.ts); the profile keeps only those.
  const accounts: CompetitorRow[] = withoutSkipped((intel?.accounts ?? []) as unknown as CompetitorRow[], skip, (a) => [a.handle, a.display_name]).slice(0, 12);
  let tracked: TrackedRow[] = [];
  try {
    tracked = withoutSkipped(await listTracked<TrackedRow>(supabase, userId, "platform, handle", { limit: 20, workspaceId }), skip, (t) => [t.handle]);
  } catch { /* none */ }
  // In the ranking's order (lib/intel/rank.ts): the person's priority accounts and the best to learn from first.
  const rankAt = new Map((intel?.roster ?? []).map((r, i) => [r.key, i]));
  if (rankAt.size) tracked.sort((x, y) => (rankAt.get(`${x.platform}:${x.handle.replace(/^@/, "").toLowerCase()}`) ?? 1e9) - (rankAt.get(`${y.platform}:${y.handle.replace(/^@/, "").toLowerCase()}`) ?? 1e9));
  const winning: WinningRow[] = withoutSkipped((intel?.content ?? []) as unknown as WinningRow[], skip, (w) => [w.account_name]).slice(0, 30);

  // Twice as many Reels as a plan shows, so there are still eight once the ones earlier plans used are left out.
  const trendsP = Promise.resolve(intel?.niche ?? null);
  const formats = await activeFindings(supabase, userId, workspaceId, FORMATS_PRODUCER, 5);
  // What goes viral in the niche, from the Reels the niche scan studied (lib/nicheScan).
  const playbook = await playbookTextFor(supabase, userId, workspaceId).catch(() => "");
  let recentPlans: PlanRow[] = [];
  let usedRefs = new Set<string>();
  try {
    // The last twelve plans: the latest three for what the person decided, all twelve for the Reels already used.
    const { data } = await scopeToWorkspace(supabase.from("plans").select("created_at, data").eq("user_id", userId), workspaceId)
      .order("created_at", { ascending: false }).limit(12);
    const rows = (data ?? []) as PlanRow[];
    recentPlans = rows.slice(0, 3);
    usedRefs = usedReelUrls(rows);
  } catch { /* none */ }

  const postsBlock = ownPostsBlock(media, followers);
  // What is already on the Calendar for the next two weeks (drafts and scheduled posts).
  // Read for the brand's own workspace only (the competitor scope above can be broader); a caller that doesn't name it skips both.
  const brandWs = opts.brandWorkspaceId;
  let calendar = "";
  if (brandWs !== undefined) try {
    const now = opts.now ?? new Date();
    const { data } = await scopeToWorkspace(supabase.from("scheduled_posts").select("scheduled_at, caption, status, plan_id").eq("user_id", userId), brandWs)
      .gte("scheduled_at", now.toISOString())
      .lt("scheduled_at", new Date(now.getTime() + 14 * 86_400_000).toISOString())
      .in("status", ["draft", "scheduled"])
      .order("scheduled_at", { ascending: true })
      .limit(20);
    calendar = calendarBlock((data ?? []) as CalendarRow[], opts.timeZone ?? null);
  } catch { /* table or column missing: nothing to tell */ }
  let goals = "";
  if (brandWs !== undefined) try {
    const { data } = await scopeToWorkspace(supabase.from("growth_goals").select("kind, metric, baseline, current_value, target, due_date, status").eq("user_id", userId), brandWs)
      .neq("status", "dropped").order("created_at", { ascending: true }).limit(5);
    goals = goalsBlock((data ?? []) as Goal[]);
  } catch { /* none */ }
  const niche = await trendsP;
  const trends = niche?.signals ?? null;
  // A competitor's Reel goes into one plan only: Reels an earlier plan already built a post on are left out.
  const proven = withoutSkipped(unusedReels(niche?.proven ?? [], usedRefs), skip, (r) => [r.accountHandle, r.accountName]).slice(0, 8);
  const trendsBlock_ = trendsEvidence(trends);
  const igSnaps = await loadIgSnaps(supabase, userId, [...tracked, ...accounts].filter((x) => x.platform === "instagram" && x.handle).map((x) => x.handle!));
  const competitorsBlock_ = competitorsBlock(accounts, tracked, winning, igSnaps);
  const outcomesBlock_ = outcomesBlock(opts.outcomes ?? []);
  const outcomeItems = (opts.outcomes ?? []).filter((o) => o.summary.onCalendar > 0).slice(0, 2).reduce((n, o) => n + o.items.length, 0);
  const trackedKeys = new Set(tracked.map((t) => handleKey(t.handle)));
  // How each Reel's account makes its videos, from the brand's Discover reads (lib/discoverStyle.ts): a
  // filmed post's example to film from has to be made the same way (2026-11-23: an animated Reel was shown
  // as the example for a talking-to-camera post).
  const styles = sanitizeMemory(opts.discover).accounts;
  const styleOfReel = (r: ProvenReel): Style | null => {
    const h = (r.accountHandle ?? "").replace(/^@/, "").toLowerCase();
    const s = h ? styles[styleKey(r.platform, h)]?.style : undefined;
    return s && s !== "mixed" ? s : null;
  };

  return {
    postsBlock,
    competitorsBlock: competitorsBlock_,
    outcomesBlock: outcomesBlock_,
    formatsBlock: formatsEvidence(formats),
    playbookBlock: playbook,
    decisionsBlock: decisionsBlock(recentPlans),
    experimentsBlock: experimentsEvidence(await experimentResults(supabase, userId, workspaceId ?? null, opts.strategy).catch(() => [])),
    trendsBlock: trendsBlock_,
    // Each Reel says whether it's from one of the competitors on Discover or another account in the niche.
    provenBlock: provenEvidence(proven, (r) => trackedKeys.has(handleKey(r.accountHandle ?? r.accountName)), (r) => { const s = styleOfReel(r); return s ? STYLE_LABEL[s] : null; }),
    provenStyles: Object.fromEntries(proven.map((r) => [r.id, styleOfReel(r)])),
    proven,
    ownPosts: postsBlock ? ownPostRefs(media) : [],
    calendarBlock: calendar,
    goalsBlock: goals,
    ...readinessOfMedia(media, opts.now ?? new Date()),
    used: {
      outcomes: outcomesBlock_ ? outcomeItems : 0,
      posts: postsBlock ? Math.min(media.length, 25) : 0,
      // Competitors are the ones on Discover (the tracked list); accounts SOCIA found in the niche count as niche Reels, not competitors.
      competitors: competitorsBlock_ ? trackedKeys.size : 0,
      winning: competitorsBlock_ ? Math.min(winning.length, 12) : 0,
      windows: false,
      followers,
      trends: trendsBlock_ && trends ? trends.reelsRead : 0,
    },
  };
}

/** How much Instagram history the plan can build on, as a prompt block and its stage. */
function readinessOfMedia(media: IgMediaItem[], now: Date): { readinessBlock: string; stage: "starting" | "learning" | "established" } {
  const r = readinessOf(media.map((m) => ({ date: m.timestamp ?? null, format: fmtOf(m), metric: m.insights?.views != null ? { value: m.insights.views } : { value: interactionsTotal(m) } })), now, readinessThresholds());
  return { readinessBlock: readinessLines(r), stage: r.stage };
}
