// Server side of the intelligence layer: turns an AskContext into verified
// evidence text for the model. Every number here is computed from the same
// rows the pages render (lib/overview, lib/gaps, lib/engagement); the model
// is told to cite only what appears in this block and to keep observation,
// derivation, interpretation and recommendation apart.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AskContext, AskPage } from "./ask";
import { getProfile, type Profile } from "./profile";
import { brandContext } from "./prompt";
import { getIgSnapshot, readDailySnapshots, type IgMediaItem } from "./instagramSync";
import type { DailySnapshot } from "./dashboardMetrics";
import { median, postsPerWeek } from "./metrics";
import { interactionsTotal, engagementRateOf } from "./engagement";
import { followerPoints, summarizeFollowers } from "./followers";
import { buildGaps } from "./gaps";
import { postCards, buildKpis, buildSeries, buildInsights, bucketize, bucketTitle, detectOutliers, displayTitle, formatOf, rangeDays, fmtNum, type PostCard } from "./overview";
import { competitorsBlock } from "./planEvidence";
import type { SavedPlan } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type AskEvidence = {
  system: string;
  evidence: string;
  posts: PostCard[];
  plan: SavedPlan | null;
  handle: string | null;
};

const n = (x: number | null | undefined) => (x == null ? "not available" : x.toLocaleString("en-US"));
const day = (iso: string) => iso.slice(0, 10);
const postLine = (p: PostCard) =>
  `[${p.id}] ${day(p.published)} · ${p.format} · "${p.title.slice(0, 70)}" · views ${n(p.views)}, reach ${n(p.reach)}, likes ${n(p.likes)}, comments ${n(p.comments)}, saves ${n(p.saves)}, shares ${n(p.shares)}, interactions ${n(p.engagements)}${p.multiplier != null ? ` (${p.multiplier.toFixed(1)}× median post)` : ""}`;

const PAGE_RULES: Record<AskPage, string> = {
  global: "The user asked from the top bar. Answer from the account evidence and point them to the right area with actions.",
  dashboard: "The user is on the Dashboard. Say what matters most right now, backed by the evidence.",
  analytics: "The user is on Analytics with the range and metric shown. Explain what happened and why, using the series, KPIs, insights and gaps given.",
  post: "The user is looking at one of their posts. Explain its performance against the account's own medians.",
  competitors: "The user is on Competitors looking at a selected account. Compare only with the measured numbers given; never invent competitor metrics.",
  plan: "The user is on their Content Plan. When asked to change a day, return a plan_day proposal (index from the plan) with a rewritten concept, a written hook, a short format label and a rationale; the user applies it, you never assume it is applied.",
  studio: "The user is in Content Studio with a piece of content analysed. When asked for hooks, captions, CTAs or on-screen text, return a text proposal with 3 options; never rewrite their content silently.",
};

function systemPrompt(page: AskPage, profile: Profile | null): string {
  const acct = profile?.niche
    ? `The user's account: niche ${profile.niche}${profile.brand_name ? `, brand ${profile.brand_name}` : ""}${profile.goals ? `, goal "${profile.goals}"` : ""}${profile.platforms?.length ? `, platforms ${profile.platforms.join(", ")}` : ""}.`
    : "The user has not set a niche yet; reason from the evidence and say when something is missing.";
  return `You are SOCIA, the intelligence layer inside a social-media operating system. You answer inside the page the user is on, from verified evidence assembled by SOCIA, and you keep four things apart:
- observed: facts from the evidence block, each with its number or source (max 4 short lines)
- derived: comparisons SOCIA computed (medians, multipliers, shares), only when they appear in the evidence (max 3 lines)
- interpretation: your reading of why, in careful language. Correlation is never presented as cause ("posts mentioning X had lower median engagement in this sample", never "mentioning X lowers engagement").
- recommendation: one concrete next step the user can do this week.
Rules:
- Cite only numbers that appear in the evidence. If something isn't there, say it isn't available; never estimate views, reach, growth, virality odds or competitor metrics.
- Never claim platform algorithm rules as facts.
- "text" is a 1-3 sentence direct answer in plain English. Short. No headings, no markdown, no em dashes (use commas or full stops), and never quote a post's id; refer to posts by their title in quotes.
- actions: 1-3 real next steps from the allowed types; "note" carries the text that action needs (a plan note, a caption seed, an analytics tab id like "times" or "content", or nothing).
- postId: the id (in square brackets in the evidence) of the single post most relevant to the answer, or "" when none.
- proposals: only when the page allows them and the user asked for a change; otherwise an empty array. Use kind "none" never; omit instead.
${PAGE_RULES[page]}
${acct}${brandContext(profile?.brand_detail)}`;
}

async function accountBlock(supabase: Supa, userId: string): Promise<{ text: string; posts: PostCard[]; media: IgMediaItem[]; handle: string | null; followers: number | null; daily: DailySnapshot[] }> {
  const snap = await getIgSnapshot(supabase, userId).catch(() => null);
  const media: IgMediaItem[] = snap?.media ?? [];
  const followers = snap?.followers_count ?? null;
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  const daily = await readDailySnapshots<DailySnapshot>(supabase, userId, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as DailySnapshot[]);
  if (!posts.length) return { text: "No connected account data: nothing has been synced from Instagram yet.", posts, media, handle: snap?.username ?? null, followers, daily };
  const er = engagementRateOf(media, followers);
  const ppw = postsPerWeek(media.map((m) => m.timestamp), 30);
  const byViews = [...posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 5);
  const fs = summarizeFollowers(followerPoints(daily));
  const lines = [
    `Account @${snap?.username ?? "unknown"}: ${n(followers)} followers, ${posts.length} posts synced (${day(posts[posts.length - 1].published)} to ${day(posts[0].published)}).`,
    `Median post: ${n(baseline != null ? Math.round(baseline) : null)} interactions (likes + comments + saves + shares). Engagement rate ${er.value != null ? `${er.value.toFixed(2)}% ${er.suffix}` : "not available"} (${er.formula}).`,
    `Cadence: ${ppw != null ? `${ppw.toFixed(1)} posts/week over the last 30 days` : "no posts in the last 30 days"}.`,
    `Follower history: ${fs.statusLine} ${fs.net != null ? `Net ${fs.net >= 0 ? "+" : ""}${fs.net} over ${fs.spanDays} days.` : ""}`,
    `Top posts by views:`, ...byViews.map(postLine),
    `Most recent posts:`, ...posts.slice(0, 5).map(postLine),
  ];
  return { text: lines.join("\n"), posts, media, handle: snap?.username ?? null, followers, daily };
}

export async function buildAskEvidence(supabase: Supa, userId: string, ctx: AskContext): Promise<AskEvidence> {
  const profile = await getProfile(supabase, userId).catch(() => null);
  const acct = await accountBlock(supabase, userId);
  const parts: string[] = [`# Account evidence (assembled by SOCIA from the connected account)`, acct.text];
  let plan: SavedPlan | null = null;
  const now = new Date();

  // Insights and gaps: the same deterministic detectors the pages show.
  if (acct.media.length >= 5) {
    const baseline = median(acct.media.map(interactionsTotal));
    const insights = buildInsights({ media: acct.media, baseline, location: profile?.brand_detail?.location ?? null, handle: acct.handle });
    if (insights.length) parts.push(`# Insights SOCIA computed`, ...insights.map((i) => `- ${i.tag}: ${i.title}. ${i.observed.join(" | ")}`));
    const freq = profile?.brand_detail?.strategist?.frequency ?? null;
    const target = freq ? parseInt(freq.match(/\d+/)?.[0] ?? "", 10) : NaN;
    const gaps = buildGaps({ media: acct.media, followers: acct.followers, goals: profile?.goals ?? null, location: profile?.brand_detail?.location ?? null, frequencyTarget: Number.isFinite(target) ? target : null, now });
    if (gaps.length) parts.push(`# What's Missing (SOCIA's ranked gaps)`, ...gaps.map((g) => `- ${g.title} [${g.impact}]: ${g.headline} Observed: ${g.observed.join(" | ")}`));
  }

  if (ctx.page === "analytics" || ctx.page === "dashboard" || ctx.page === "global") {
    const days = rangeDays(ctx.range);
    const kpis = buildKpis({ media: acct.media, daily: acct.daily, followers: acct.followers, days, now });
    parts.push(`# KPIs, last ${days} days`, ...kpis.map((k) => `- ${k.label}: ${k.value}${k.deltaText ? ` (${k.deltaText} ${k.note})` : ` (${k.note})`}`));
    for (const m of ["views", "reach", "engagement"] as const) {
      const s = buildSeries(m, acct.media, acct.daily, days, now);
      if (s.provenance === "unavailable") { parts.push(`- ${s.label} series: not available (${s.note})`); continue; }
      const wk = bucketize(s.current, "week", "sum", now.toISOString().slice(0, 10));
      const out = detectOutliers(wk.map((b) => b.value));
      parts.push(`- ${s.label} by week (${s.note}): ${wk.map((b, i) => `${bucketTitle(b, "week")} ${b.value == null ? "no data" : fmtNum(b.value)}${out.has(i) ? " BREAKOUT" : ""}${b.partial ? " (so far)" : ""}`).join("; ")}`);
      if (m === "views") {
        const dayPts = bucketize(s.current, "day", "sum", now.toISOString().slice(0, 10));
        const dOut = detectOutliers(dayPts.map((b) => b.value));
        for (const i of dOut) {
          const b = dayPts[i];
          const driver = b.postIds.map((id) => acct.posts.find((p) => p.id === id)).filter(Boolean).sort((a, b2) => (b2!.views ?? 0) - (a!.views ?? 0))[0];
          parts.push(`- Breakout day ${bucketTitle(b, "day")}: ${fmtNum(b.value)} ${s.label.toLowerCase()}${driver ? `, driven by ${postLine(driver!)} (${b.value && driver!.views ? Math.round((driver!.views / b.value) * 100) : "?"}% of the day)` : ""}`);
        }
      }
    }
  }

  if (ctx.day) {
    const ps = acct.posts.filter((p) => day(p.published) === ctx.day);
    parts.push(`# The day the user clicked: ${ctx.day}`, ps.length ? ps.map(postLine).join("\n") : "No post was published that day.");
  }
  if (ctx.postId) {
    const p = acct.posts.find((x) => x.id === ctx.postId);
    if (p) parts.push(`# The post the user is looking at`, postLine(p), `Caption: """${p.caption.slice(0, 600)}"""`);
  }

  if (ctx.page === "competitors") {
    let accounts: { platform: string; handle: string | null; display_name: string | null; followers: number | null; location: string | null; category: string | null; classification: string; relevance_score: number | null; platform_account_id?: string }[] = [];
    let tracked: { platform: string; handle: string }[] = [];
    let winning: { platform: string; account_name: string | null; title: string | null; views: number | null; likes: number | null; comments: number | null; multiplier: number | null; trend_tags: string[] | null; why_recommended: string | null; published_at: string | null }[] = [];
    try { const { data } = await supabase.from("discovered_accounts").select("platform, platform_account_id, handle, display_name, followers, location, category, classification, relevance_score").eq("user_id", userId).order("relevance_score", { ascending: false, nullsFirst: false }).limit(12); accounts = data ?? []; } catch { /* none */ }
    try { const { data } = await supabase.from("tracked_competitors").select("platform, handle").eq("user_id", userId).limit(20); tracked = data ?? []; } catch { /* none */ }
    try { const { data } = await supabase.from("discovered_content").select("platform, account_name, title, views, likes, comments, multiplier, trend_tags, why_recommended, published_at").eq("user_id", userId).order("multiplier", { ascending: false, nullsFirst: false }).limit(30); winning = data ?? []; } catch { /* none */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const block = competitorsBlock(accounts as any, tracked as any, winning as any);
    if (block) parts.push(`# Competitors and winning content SOCIA holds (YouTube figures from the YouTube Data API; Instagram/Facebook accounts from web research carry no metrics)`, block);
    if (ctx.competitorId || ctx.competitorName) {
      const key = (ctx.competitorId ?? ctx.competitorName ?? "").toLowerCase();
      const sel = accounts.find((a) => [a.platform_account_id, a.handle, a.display_name].some((v) => (v ?? "").toLowerCase() === key || (v ?? "").toLowerCase().includes(key)));
      const selName = (sel?.display_name ?? sel?.handle ?? ctx.competitorName ?? "").toLowerCase();
      const theirs = winning.filter((w) => selName && (w.account_name ?? "").toLowerCase().includes(selName.replace(/^@/, "")));
      parts.push(`# The competitor the user selected: ${ctx.competitorName ?? ctx.competitorId ?? "unknown"} (${ctx.competitorPlatform ?? sel?.platform ?? "platform unknown"})`,
        sel ? `Followers/subscribers: ${n(sel.followers)}; location ${sel.location ?? "unknown"}; category ${sel.category ?? "unknown"}; classification ${sel.classification}.` : "No stored profile row for this account beyond the name.",
        ...(ctx.comparisons?.length ? [`Measured comparison (you vs them): ${ctx.comparisons.join("; ")}`] : ["No measured comparison lines were provided."]),
        theirs.length ? `Their analysed content:\n${theirs.slice(0, 8).map((w) => `- "${w.title ?? "(untitled)"}" · views ${n(w.views)}, likes ${n(w.likes)}, comments ${n(w.comments)}${w.multiplier != null ? `, ${Number(w.multiplier).toFixed(1)}× their median` : ""}${w.trend_tags?.length ? ` · features: ${w.trend_tags.join(", ")}` : ""}${w.why_recommended ? ` · web-research note: ${w.why_recommended}` : ""}`).join("\n")}` : "No analysed posts stored for this account.");
    }
  }

  if (ctx.page === "plan") {
    try {
      let q = supabase.from("plans").select("id, client_handle, niche, platform, data, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      if (ctx.planId) q = supabase.from("plans").select("id, client_handle, niche, platform, data, created_at").eq("user_id", userId).eq("id", ctx.planId).limit(1);
      const { data } = await q;
      plan = (data?.[0] as SavedPlan | undefined) ?? null;
    } catch { plan = null; }
    if (plan) {
      const d = plan.data;
      parts.push(`# The Content Plan on screen (plan id ${plan.id}, created ${day(plan.created_at)})`, `Headline: ${d.headline}`, `Top fixes: ${(d.topFixes ?? []).map((f) => f.fix).join(" | ")}`,
        `Weekly plan (index · day · format · concept · hook):`, ...(d.weeklyPlan ?? []).map((p, i) => `${i} · ${p.day} · ${p.format} · ${p.concept} · hook "${p.hook}" · rationale: ${p.rationale}`));
      if (ctx.planDay) parts.push(`The user is focused on: ${ctx.planDay}.`);
    } else {
      parts.push(`# Content Plan`, `No generated plan is on screen yet; suggest generating one.`);
    }
  }

  if (ctx.page === "studio" && ctx.studio) {
    const s = ctx.studio;
    parts.push(`# The content in Content Studio (${s.kind}${s.durationSec ? `, ${Math.round(s.durationSec)}s` : ""}${s.goal ? `, goal: ${s.goal}` : ""})`,
      s.summary ? `SOCIA's analysis of it:\n${s.summary}` : "Not analysed yet.",
      s.transcript ? `Transcript / on-screen text provided by the user: """${s.transcript.slice(0, 1200)}"""` : "No transcript was provided.",
      s.caption ? `Draft caption: """${s.caption.slice(0, 600)}"""` : "No caption yet.");
  }

  return { system: systemPrompt(ctx.page, profile), evidence: parts.join("\n\n"), posts: acct.posts, plan, handle: acct.handle };
}
