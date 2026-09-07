// "What's Missing": the gaps between what the account does and what its own
// numbers say works. Every item is detected deterministically from real rows,
// carries the observation it rests on, and ranks by evidence: effect size,
// sample size, size of the gap, and relevance to the stated goal. Language
// stays observational; correlation is never presented as cause.
//
// Pure and browser-safe (the timing gap runs client-side, see timingGap).

import type { IgMediaItem } from "./instagramSync";
import { median } from "./metrics";
import { interactionsTotal, postRate } from "./engagement";
import { type Windows, type TimedPost, inBestWindows, relText } from "./postingTimes";

export type GapArea = "frequency" | "format" | "variety" | "prompts" | "engagement" | "goal" | "local" | "consistency" | "timing";
export type Impact = "high" | "medium" | "early";
export type GapAction = { label: string; href?: string; tab?: "content" | "audience" | "times" | "growth" };
export type Gap = {
  id: GapArea;
  impact: Impact;
  score: number;
  /** Short area label, e.g. "Posting consistency". */
  title: string;
  /** One sentence: the gap. */
  headline: string;
  observed: string[];
  performance: string | null;
  gap: string;
  action: string;
  cta: GapAction;
  secondary?: GapAction;
  postIds: string[];
  planNote: string;
};

const DAY_MS = 86400000;
const FORMAT: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Photo" };
const formatOf = (m: IgMediaItem) => FORMAT[m.media_type ?? ""] ?? "Post";
const n = (x: number) => x.toLocaleString("en-US");
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
const mult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
const title = (m: IgMediaItem) => (m.caption ?? "").split("\n").map((l) => l.trim()).find(Boolean)?.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").slice(0, 40) || "(no caption)";

type Evidence = { strength: number; sample: number; gapSize: number; goalRel?: number };
function rank(e: Evidence): { score: number; impact: Impact } {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const score = 0.45 * clamp(e.strength) + 0.25 * clamp(e.gapSize) + 0.2 * clamp(e.sample) + (e.goalRel ?? 0);
  const impact: Impact = e.sample < 0.5 ? "early" : score >= 0.55 ? "high" : score >= 0.35 ? "medium" : "early";
  return { score: Math.round(score * 100) / 100, impact };
}

const PROMPT = /\?|\b(comment|tag (a|your|someone)|tell us|let us know|dm us|send us|share this|save this|which one|what'?s your|who'?s|would you|drop a|vote|name a)\b/i;
const STOP = new Set(["their", "across", "multiple", "drive", "more", "with", "from", "that", "this", "your", "into", "through", "about", "them", "they", "have", "will", "and", "the", "for", "our", "get", "increase", "grow", "build", "reach", "engagement", "followers", "brand", "awareness", "content", "social", "media", "account", "page", "people", "customers", "business"]);
/** Light stemming so "orders" matches "order" and "bookings" matches "booking"; nothing cleverer. */
const stem = (w: string) => w.toLowerCase().replace(/ies$/u, "y").replace(/(?<=[a-z]{3})s$/u, "");

export function goalKeywords(goals: string | null): string[] {
  if (!goals) return [];
  return [...new Set(goals.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem).filter((w) => w.length >= 3))].slice(0, 8);
}

export function buildGaps(input: {
  media: IgMediaItem[];
  followers: number | null;
  goals: string | null;
  location: string | null;
  /** Posts per week the strategist settings ask for, when set. */
  frequencyTarget: number | null;
  now?: Date;
}): Gap[] {
  const now = input.now ?? new Date();
  const T = now.getTime();
  const dated = input.media.filter((m) => m.timestamp && !isNaN(new Date(m.timestamp).getTime())).sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
  const out: Gap[] = [];
  if (dated.length < 5) return out;
  const last10 = dated.slice(0, 10);
  const ids = (ms: IgMediaItem[]) => ms.map((m) => m.id ?? "").filter(Boolean);
  const goalWords = goalKeywords(input.goals);
  const goalMatches = (text: string) => goalWords.some((w) => text.toLowerCase().includes(w));

  // ---- 1. Posting frequency: last 7 days vs the account's own typical week --
  {
    const count = (from: number, to: number) => dated.filter((m) => { const t = new Date(m.timestamp!).getTime(); return t >= from && t < to; }).length;
    const last7 = count(T - 7 * DAY_MS, T + 1);
    const oldest = new Date(dated[dated.length - 1].timestamp!).getTime();
    const windows: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const from = T - (k + 1) * 7 * DAY_MS, to = T - k * 7 * DAY_MS;
      if (from < oldest) break; // only weeks the cached posts fully cover
      windows.push(count(from, to));
    }
    const typical = windows.length >= 3 ? median(windows) : null;
    const target = input.frequencyTarget;
    const ref = target ?? typical;
    const refLabel = target ? `the ${target}/week you set in Settings → AI Strategist` : `${typical} in your typical week (median of the ${windows.length} weeks before)`;
    if (ref != null && ref >= 2 && last7 <= ref - 1) {
      const short = ref - last7;
      const ev = rank({ strength: Math.min(1, short / ref), sample: Math.min(1, (target ? 8 : windows.length) / 6), gapSize: Math.min(1, short / 3), goalRel: 0.05 });
      out.push({
        id: "frequency", ...ev, title: "Posting consistency",
        headline: `You published ${plural(last7, "post")} in the last 7 days against ${refLabel}.`,
        observed: [`Last 7 days: ${plural(last7, "post")}`, target ? `Target: ${target} posts/week (your setting)` : `Typical week: ${typical} posts (median of ${windows.length} prior weeks, from your last ${dated.length} synced posts)`],
        performance: null,
        gap: `${plural(short, "post")} short of your own cadence this week.`,
        action: `Add ${plural(short, "post")} this week; the Calendar places them at your best hour.`,
        cta: { label: "Add to Content Plan", href: `/tool?note=${encodeURIComponent(`Only ${last7} posts in the last 7 days vs ${ref} usual; plan ${short} more this week.`)}` },
        secondary: { label: "Schedule content", href: "/calendar" },
        postIds: [], planNote: `Cadence: ${last7} posts this week vs ${ref} usual.`,
      });
    }
  }

  // ---- 2. Format gap: strongest format underused ---------------------------
  {
    const byFmt = new Map<string, IgMediaItem[]>();
    for (const m of dated) byFmt.set(formatOf(m), [...(byFmt.get(formatOf(m)) ?? []), m]);
    const allViews = dated.every((m) => m.insights?.views != null);
    const val = (m: IgMediaItem) => (allViews ? m.insights!.views! : interactionsTotal(m));
    const metricLabel = allViews ? "views" : "interactions";
    const eligible = [...byFmt.entries()].filter(([, ms]) => ms.length >= 3).map(([f, ms]) => ({ f, ms, med: median(ms.map(val))! }));
    if (eligible.length >= 2) {
      eligible.sort((a, b) => b.med - a.med);
      const best = eligible[0], rest = eligible.slice(1);
      const restMed = median(rest.flatMap((r) => r.ms.map(val)))!;
      const recentShare = last10.filter((m) => formatOf(m) === best.f).length / last10.length;
      const total = dated.reduce((s, m) => s + val(m), 0);
      const bestShare = best.ms.reduce((s, m) => s + val(m), 0) / (total || 1);
      if (restMed > 0 && best.med / restMed >= 1.3 && recentShare <= 0.4) {
        const ratio = best.med / restMed;
        const ev = rank({ strength: Math.min(1, (ratio - 1) / 2), sample: Math.min(1, best.ms.length / 6), gapSize: 1 - recentShare / 0.6 });
        const add = Math.max(1, Math.round((0.6 - recentShare) * 5));
        out.push({
          id: "format", ...ev, title: `${best.f}s`,
          headline: `${best.f}s produced ${Math.round(bestShare * 100)}% of measured ${metricLabel} but were ${Math.round(recentShare * 100)}% of your last ${last10.length} posts.`,
          observed: [`${best.f}s: median ${n(Math.round(best.med))} ${metricLabel} (${plural(best.ms.length, "post")})`, `Other formats: median ${n(Math.round(restMed))} ${metricLabel} (${plural(rest.reduce((s, r) => s + r.ms.length, 0), "post")})`, `${last10.filter((m) => formatOf(m) === best.f).length} of your last ${last10.length} posts were ${best.f.toLowerCase()}s`],
          performance: `${best.f}s earned a median ${mult(ratio)} the ${metricLabel} of your other formats in this sample.`,
          gap: "Your strongest format is underrepresented in recent posts.",
          action: `Publish ${plural(add, `additional ${best.f.toLowerCase()}`)} this week and compare against the ${n(Math.round(restMed))} median.`,
          cta: { label: `Create ${best.f} idea`, href: `/tool?note=${encodeURIComponent(`${best.f}s earn ${mult(ratio)} my other formats but were only ${Math.round(recentShare * 100)}% of recent posts; add ${add} more this week.`)}` },
          secondary: { label: "See posts", tab: "content" },
          postIds: ids(best.ms.slice(0, 3)), planNote: `${best.f}s earn ${mult(ratio)} other formats; weight the week toward them.`,
        });
      }
    } else if (dated.length >= 10 && byFmt.size >= 1) {
      // ---- 2b. Variety: one format only, so nothing can be compared ---------
      const [f, ms] = [...byFmt.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      if (ms.length / dated.length >= 0.9) {
        const others = ["Reel", "Carousel", "Photo"].filter((x) => x !== f);
        const ev = rank({ strength: 0.3, sample: 0.4, gapSize: 0.5 });
        out.push({
          id: "variety", ...ev, title: "Format variety",
          headline: `${ms.length} of your last ${dated.length} posts are ${f.toLowerCase()}s, so SOCIA can't yet compare formats for this account.`,
          observed: [`${f}s: ${ms.length} of ${dated.length} synced posts`, ...others.map((o) => `${o}s: ${dated.filter((m) => formatOf(m) === o).length}`)],
          performance: null,
          gap: "No measured evidence yet on whether another format would earn more; this is a test to run, not a proven gap.",
          action: `Publish one ${others[0].toLowerCase()} this week as a controlled test and compare it with your ${f.toLowerCase()} median.`,
          cta: { label: `Create ${others[0]} idea`, href: `/tool?note=${encodeURIComponent(`Every recent post is a ${f.toLowerCase()}; add one ${others[0].toLowerCase()} this week as a format test.`)}` },
          postIds: [], planNote: `Test one ${others[0].toLowerCase()} against the ${f.toLowerCase()} baseline.`,
        });
      }
    }
  }

  // ---- 3. Engagement prompts in captions ---------------------------------
  {
    const withPrompt = last10.filter((m) => PROMPT.test(m.caption ?? ""));
    const without = last10.filter((m) => !withPrompt.includes(m));
    if (last10.length >= 8 && withPrompt.length <= 3) {
      let performance: string | null = null;
      let strength = 0.35;
      if (withPrompt.length >= 3 && without.length >= 3) {
        const a = median(withPrompt.map(interactionsTotal))!, b = median(without.map(interactionsTotal))!;
        if (b > 0) { performance = `In this sample, captions with a prompt had a median of ${n(Math.round(a))} interactions vs ${n(Math.round(b))} without (${withPrompt.length} vs ${without.length} posts). Small samples; treat as a signal.`; strength = Math.min(1, Math.max(0.2, (a / b - 1))); }
      }
      const ev = rank({ strength, sample: Math.min(1, last10.length / 10) * (performance ? 1 : 0.6), gapSize: 1 - withPrompt.length / 4 });
      out.push({
        id: "prompts", ...ev, title: "Engagement prompts",
        headline: `${withPrompt.length} of your last ${last10.length} captions ask the audience anything (a question, a tag, a save).`,
        observed: [`Captions with a direct prompt: ${withPrompt.length} of ${last10.length}`, ...withPrompt.slice(0, 2).map((m) => `With prompt: "${title(m)}"`)],
        performance,
        gap: "Most captions end without giving people a reason to comment, save or share.",
        action: "Add one clear question or ask to the next 3 captions, then compare comments and saves against these 10.",
        cta: { label: "Generate ideas", href: `/chat?q=${encodeURIComponent(`Only ${withPrompt.length} of my last ${last10.length} captions include a direct prompt. Write 3 caption endings with a specific question or ask that fit my audience and my goal.`)}` },
        secondary: { label: "See posts", tab: "content" },
        postIds: ids(without.slice(0, 3)), planNote: `Captions rarely prompt a response (${withPrompt.length}/${last10.length}); end each post with a question or ask.`,
      });
    }
  }

  // ---- 4. Engagement gap: views up, interaction rate down ------------------
  if (dated.length >= 10) {
    const recent = dated.slice(0, 5), prior = dated.slice(5, 10);
    const views = (ms: IgMediaItem[]) => median(ms.map((m) => m.insights?.views).filter((v): v is number => v != null));
    const rate = (ms: IgMediaItem[]) => median(ms.map((m) => postRate(m, input.followers)?.value).filter((v): v is number => v != null));
    const vr = views(recent), vp = views(prior), rr = rate(recent), rp = rate(prior);
    if (vr != null && vp != null && rr != null && rp != null && vp > 0 && rp > 0) {
      const vUp = (vr - vp) / vp, rDown = (rp - rr) / rp;
      if (vUp >= 0.15 && rDown >= 0.1) {
        const ev = rank({ strength: Math.min(1, rDown * 2), sample: 0.5 + Math.min(0.5, dated.length / 40), gapSize: Math.min(1, rDown * 2) });
        out.push({
          id: "engagement", ...ev, title: "Engagement gap",
          headline: "People are watching, but fewer of them are interacting.",
          observed: [`Median views, last 5 posts: ${n(Math.round(vr))} (↑ ${Math.round(vUp * 100)}% vs the 5 before)`, `Median engagement rate, last 5: ${rr.toFixed(2)}% (↓ ${Math.round(rDown * 100)}% vs ${rp.toFixed(2)}%)`],
          performance: "The recent five reached more people per post, but a smaller share of them liked, commented, saved or shared.",
          gap: "Reach is growing faster than interaction, so the audience these posts find isn't being asked to respond.",
          action: "Test a stronger question or response prompt in the first line and caption of your next 3 posts.",
          cta: { label: "Generate ideas", href: `/chat?q=${encodeURIComponent("My last 5 posts get more views than the 5 before but a lower engagement rate. Suggest 3 concrete hooks and caption prompts to turn views into comments and saves.")}` },
          secondary: { label: "See posts", tab: "content" },
          postIds: ids(recent.slice(0, 3)), planNote: "Views up, engagement rate down on the last 5 posts; add response prompts.",
        });
      }
    }
  }

  // ---- 5. Goal coverage: does recent content talk about the goal? -----------
  if (goalWords.length && last10.length >= 8) {
    const hits = last10.filter((m) => goalMatches(m.caption ?? ""));
    if (hits.length <= 2) {
      const ev = rank({ strength: 0.5, sample: Math.min(1, last10.length / 10), gapSize: 1 - hits.length / 3, goalRel: 0.15 });
      out.push({
        id: "goal", ...ev, title: "Goal coverage",
        headline: `${hits.length} of your last ${last10.length} captions mention what you said you want: ${goalWords.slice(0, 4).join(", ")}.`,
        observed: [`Your goal: "${input.goals!.slice(0, 90)}${input.goals!.length > 90 ? "…" : ""}"`, `Captions mentioning any of it: ${hits.length} of ${last10.length}`],
        performance: null,
        gap: "Content that never names the outcome you want (an order, a booking, a visit) leaves the audience without a next step.",
        action: "Give one post this week a direct line about the goal, in the caption and on screen, and track replies and clicks.",
        cta: { label: "Add to Content Plan", href: `/tool?note=${encodeURIComponent(`Only ${hits.length}/${last10.length} recent captions mention my goal (${goalWords.slice(0, 3).join(", ")}); include one goal-led post this week.`)}` },
        secondary: { label: "Ask SOCIA", href: `/chat?q=${encodeURIComponent(`My goal is "${input.goals}". Only ${hits.length} of my last ${last10.length} captions mention it. Give me 3 post ideas that tie directly to it.`)}` },
        postIds: ids(hits.slice(0, 3)), planNote: `Goal rarely appears in captions (${hits.length}/${last10.length}).`,
      });
    }
  }

  // ---- 6. Local mentions -------------------------------------------------
  if (input.location) {
    const tokens = input.location.split(/[,/]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2 && !/^[a-z]{2}$/.test(t));
    const place = input.location.split(",")[0].trim();
    if (tokens.length) {
      const mentions = last10.filter((m) => tokens.some((t) => (m.caption ?? "").toLowerCase().includes(t)));
      if (mentions.length === 0 && last10.length >= 8) {
        const ev = rank({ strength: 0.45, sample: Math.min(1, last10.length / 10), gapSize: 0.8, goalRel: /local|visit|store|order|book/i.test(input.goals ?? "") ? 0.15 : 0.05 });
        out.push({
          id: "local", ...ev, title: "Local signal",
          headline: `None of your last ${last10.length} captions mention ${place}.`,
          observed: [`Captions naming ${tokens.map((t) => `"${t}"`).join(" or ")}: 0 of ${last10.length}`],
          performance: null,
          gap: "For a business that needs nearby people, captions without the place give Instagram nothing local to work with.",
          action: `Name ${place} in the caption and tag the location on every post this week; compare local follower growth in two weeks.`,
          cta: { label: "Add to Content Plan", href: `/tool?note=${encodeURIComponent(`No recent caption names ${place}; every post this week should mention it and tag the location.`)}` },
          postIds: [], planNote: `Name ${place} in every caption this week.`,
        });
      }
    }
  }

  // ---- 7. Consistency: long gaps between posts -----------------------------
  {
    const recent = dated.filter((m) => new Date(m.timestamp!).getTime() >= T - 60 * DAY_MS);
    if (recent.length >= 5) {
      const times = recent.map((m) => new Date(m.timestamp!).getTime()).sort((a, b) => a - b);
      const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY_MS);
      const longest = Math.max(...gaps), typical = median(gaps)!;
      const sinceLast = (T - times[times.length - 1]) / DAY_MS;
      const worst = Math.max(longest, sinceLast);
      if (typical > 0 && typical <= 5 && worst >= Math.max(10, typical * 2.5)) {
        const ev = rank({ strength: Math.min(1, worst / 21), sample: Math.min(1, recent.length / 10), gapSize: Math.min(1, (worst - typical) / 14) });
        out.push({
          id: "consistency", ...ev, title: "Consistency",
          headline: sinceLast >= longest ? `It has been ${Math.round(sinceLast)} days since your last post; you usually post every ${Math.round(typical)} days.` : `Your longest gap in the last 60 days was ${Math.round(longest)} days, against a usual ${Math.round(typical)} days between posts.`,
          observed: [`Posts in the last 60 days: ${recent.length}`, `Median gap between posts: ${typical.toFixed(1)} days`, `Longest gap: ${Math.round(longest)} days`, `Since last post: ${Math.round(sinceLast)} days`],
          performance: null,
          gap: "Long silences interrupt the cadence Instagram uses to keep testing your content with new people.",
          action: "Schedule the next two posts now so the gap doesn't grow; drafts from your Content Plan can fill them.",
          cta: { label: "Schedule content", href: "/calendar" },
          secondary: { label: "Add to Content Plan", href: `/tool?note=${encodeURIComponent(`A ${Math.round(worst)}-day gap opened between posts; plan a steadier cadence.`)}` },
          postIds: [], planNote: `Posting gaps up to ${Math.round(worst)} days; steady the cadence.`,
        });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Timing gap, from the viewer-time-zone windows: recent posts miss the best
 *  windows. Only when the windows are backed by a reliable sample. */
export function timingGap(w: Windows, posts: TimedPost[]): Gap | null {
  if (!w.enough || !w.best.length) return null;
  const top = w.best[0];
  const { inWindow, total } = inBestWindows(posts, w, 10);
  if (total < 8 || inWindow / total > 0.3) return null;
  const ev = rank({ strength: Math.min(1, (top.rel - 1) / 1.5), sample: top.confidence === "high" ? 0.7 : 0.4, gapSize: 1 - inWindow / total });
  return {
    id: "timing", ...ev, title: "Posting time",
    headline: `Your strongest window so far is ${top.label}, but ${inWindow} of your last ${total} posts landed in a best window.`,
    observed: [`${top.label}: median ${relText(top.rel)} (${plural(top.n, "post")})`, `Recent posts inside a best window: ${inWindow} of ${total}`, top.confidence === "early" ? "Early signal: fewer than 4 posts in that window" : "Backed by 4 or more posts"],
    performance: `Posts in that window earned ${relText(top.rel)} in this sample; that is where they landed, not proof the hour caused it.`,
    gap: "Most recent posts publish outside the windows that have performed best for this account.",
    action: `Schedule this week's most important post for ${top.label} and compare it with your median.`,
    cta: { label: "View evidence", tab: "times" },
    secondary: { label: "Schedule content", href: "/calendar" },
    postIds: top.postIds, planNote: `Best window so far: ${top.label} (${relText(top.rel)}, ${top.n} posts).`,
  };
}
