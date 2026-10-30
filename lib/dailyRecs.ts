// Daily recommendations: the Dashboard's Today card. Up to five things worth
// doing today, each read off the account's own rows: a post that failed, today's
// post and whether it will actually publish, today's Content Plan item when it
// isn't on the Calendar, comment replies waiting for approval, nothing set to
// publish in the next three days, a posting window the account's own history
// backs, a post that is taking off, and Content Studio posts not started yet.
// A section without the data behind it is left out, never filled in.
//
// Pure and client-safe. "Today" is the viewer's day, so the card computes in
// the browser in the viewer's zone; tests pass a named zone.
import { buildWindows, BLOCK_STARTS, DOW_LONG, type TimedPost, type Window } from "./postingTimes";
import { zonedParts, zonedToUtc, zonedAt, formatClock, betweenPhrase } from "./publishing/timing";
import { weekdayIndex, type PostStatus } from "./scheduling";
import { fmtMultiplier } from "./multiplier";

export type TodayPost = {
  id: string;
  at: string;
  status: PostStatus;
  planId: string | null;
  planDay: string | null;
  title: string;
  hasMedia: boolean;
  image: boolean;
};

export type TodayPlan = { id: string; createdAt: string; items: { day: string; concept: string; format: string }[] };

export type TodayBreakout = {
  platform: "instagram" | "facebook" | "tiktok";
  title: string;
  format: string;
  multiplier: number;
  metric: "interactions" | "views";
  /** peers of the same format the multiplier is measured against */
  sample: number;
  postedAt: string;
  permalink: string | null;
};

export type TodayStudio = { projectId: string; title: string | null; found: number; notStarted: number; next: string };

export type TodayFacts = {
  /** The latest Content Plan. */
  plan: TodayPlan | null;
  /** Calendar posts (not cancelled) from the last 30 days on. */
  posts: TodayPost[];
  /** Dated Instagram posts for posting windows; null without live Instagram. */
  timed: TimedPost[] | null;
  /** Comment replies drafted and waiting; null when comment replies aren't available. */
  comments: { waiting: number; oldestAt: string | null } | null;
  breakout: TodayBreakout | null;
  studio: TodayStudio | null;
};

export type RecKind = "failed" | "today_post" | "plan_item" | "comments" | "gap" | "best_time" | "breakout" | "studio";
export type RecTone = "urgent" | "todo" | "chance" | "ok";

export type Rec = {
  kind: RecKind;
  tone: RecTone;
  title: string;
  detail: string;
  href: string;
  cta: string;
  /** a second link, e.g. the post on its platform */
  external?: { href: string; label: string };
};

export type TodaySummary = {
  recs: Rec[];
  /** The next post set to publish, for the "nothing needs you" state. */
  next: { title: string; when: string } | null;
};

export const MAX_RECS = 5;
/** Hours ahead with nothing set to publish before SOCIA says so. */
export const GAP_HOURS = 72;
/** How far back a failed post still asks for attention. */
export const FAILED_DAYS = 7;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TONE_RANK: Record<RecTone, number> = { urgent: 0, todo: 1, chance: 2, ok: 3 };
const PLATFORM_NAME: Record<TodayBreakout["platform"], string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

const dayNum = (d: Date, tz: string) => {
  const p = zonedParts(d, tz);
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY);
};
const ms = (iso: string) => new Date(iso).getTime();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (s: string) => `“${s.length > 60 ? `${s.slice(0, 59).trimEnd()}…` : s}”`;
const shortRange = (block: number) => betweenPhrase(block).replace(/^between /, "").replace(" and ", "–");

/** "today at 6:15 PM", "yesterday at 9:00 AM", "on Tue, Oct 6 at 6:15 PM". */
function whenPhrase(iso: string, now: Date, tz: string): string {
  const diff = dayNum(new Date(iso), tz) - dayNum(now, tz);
  const clock = formatClock(iso, tz);
  if (diff === 0) return `today at ${clock}`;
  if (diff === -1) return `yesterday at ${clock}`;
  if (diff === 1) return `tomorrow at ${clock}`;
  const date = new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  return `on ${date} at ${clock}`;
}

/** "today", "yesterday", "3 days ago" by the viewer's calendar. */
function agoPhrase(iso: string, now: Date, tz: string): string {
  const d = dayNum(now, tz) - dayNum(new Date(iso), tz);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/** Same plan day as the Content Plan's own matching: exact text, else the same weekday. */
function samePlanDay(a: string | null, b: string): boolean {
  const x = (a ?? "").trim().toLowerCase();
  if (!x) return false;
  if (x === b.trim().toLowerCase()) return true;
  const wa = weekdayIndex(a), wb = weekdayIndex(b);
  return wa != null && wb != null && wa === wb;
}

/**
 * The Monday (as a day number in the zone) of the week a plan is for, by the
 * rule "Put on Calendar" uses: a plan made Thursday through Sunday is next
 * week's plan, Monday through Wednesday this week's.
 */
export function planWeekStart(createdAt: string, tz: string): number {
  const d = new Date(createdAt);
  const wd = zonedParts(d, tz).weekday; // 0 = Sunday
  const monday = dayNum(d, tz) - ((wd + 6) % 7);
  return monday + (wd === 0 || wd >= 4 ? 7 : 0);
}

type OpenWindow = { w: Window; start: number; end: number };

/** The account's best windows that are still open or ahead in the next `days` days, soonest first. */
function windowsAhead(best: Window[], now: Date, tz: string, days: number): OpenWindow[] {
  const today = zonedParts(now, tz);
  const out: OpenWindow[] = [];
  for (let k = 0; k <= days; k++) {
    const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + k));
    const mondayIndex = (cal.getUTCDay() + 6) % 7;
    for (const w of best) {
      if (w.day !== mondayIndex) continue;
      const start = zonedToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), BLOCK_STARTS[w.block], 0, tz).getTime();
      const end = start + 3 * HOUR;
      if (end > now.getTime() && start < now.getTime() + days * DAY) out.push({ w, start, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const lift = (w: Window) => `${Math.round((w.rel - 1) * 100)}%`;
const sample = (w: Window) => `median of ${plural(w.n, "post")}${w.confidence === "early" ? ", an early signal" : ""}`;

export function dailyRecommendations(f: TodayFacts, now: Date, tz: string): TodaySummary {
  const nowMs = now.getTime();
  const today = dayNum(now, tz);
  const recs: Rec[] = [];
  const live = f.posts.filter((p) => p.status !== "cancelled" && Number.isFinite(ms(p.at)));

  // A post that failed to publish.
  const failed = live.filter((p) => p.status === "failed" && ms(p.at) >= nowMs - FAILED_DAYS * DAY).sort((a, b) => ms(b.at) - ms(a.at));
  if (failed.length) {
    const more = failed.length > 1 ? ` ${plural(failed.length - 1, "other post")} also failed.` : "";
    recs.push({
      kind: "failed", tone: "urgent",
      title: failed.length === 1 ? "A post didn't publish" : `${failed.length} posts didn't publish`,
      detail: `${quote(failed[0].title)} was due ${whenPhrase(failed[0].at, now, tz)}.${more} Open it on the Calendar to see what went wrong and try again.`,
      href: "/plan/calendar", cta: "Review",
    });
  }

  // Today's posts: will they actually go out?
  const todays = live.filter((p) => p.status !== "published" && p.status !== "failed" && dayNum(new Date(p.at), tz) === today).sort((a, b) => ms(a.at) - ms(b.at));
  const draft = todays.find((p) => p.status === "draft");
  const fromPlan = (p: TodayPost) => (p.planId ? "From your Content Plan: " : "");
  const others = todays.length > 1 ? ` ${plural(todays.length - 1, "other post")} today.` : "";
  if (draft) {
    const media = draft.image ? "photo" : "video";
    const past = ms(draft.at) <= nowMs;
    const set = past ? `was set for ${formatClock(draft.at, tz)} and hasn't gone out` : `is set for ${formatClock(draft.at, tz)}`;
    recs.push({
      kind: "today_post", tone: "todo",
      title: draft.hasMedia ? "Today's post isn't scheduled yet" : `Today's post has no ${media} yet`,
      detail: draft.hasMedia
        ? `${fromPlan(draft)}${quote(draft.title)} ${set}. It's still a draft, so nothing publishes until you schedule it.${others}`
        : `${fromPlan(draft)}${quote(draft.title)} ${set}. Attach the ${media} and schedule it, or nothing publishes.${others}`,
      href: "/plan/calendar", cta: draft.hasMedia ? "Schedule it" : `Add the ${media}`,
    });
  } else {
    const going = todays.find((p) => (p.status === "scheduled" || p.status === "publishing") && ms(p.at) >= nowMs - HOUR);
    if (going) {
      recs.push({
        kind: "today_post", tone: "ok",
        title: going.status === "publishing" ? "Today's post is publishing now" : `Today's post goes out at ${formatClock(going.at, tz)}`,
        detail: `${fromPlan(going)}${quote(going.title)} is scheduled and ready.${others}`,
        href: "/plan/calendar", cta: "View",
      });
    }
  }

  // Today's Content Plan item, when it isn't on the Calendar.
  if (f.plan && f.plan.items.length) {
    const start = planWeekStart(f.plan.createdAt, tz);
    if (today >= start && today < start + 7) {
      const wd = zonedParts(now, tz).weekday;
      const plan = f.plan;
      const item = plan.items.find((it) => weekdayIndex(it.day) === wd && !live.some((p) => p.planId === plan.id && samePlanDay(p.planDay, it.day)));
      if (item) {
        recs.push({
          kind: "plan_item", tone: "todo",
          title: "Today on your Content Plan",
          detail: `${quote(item.concept)}${item.format ? ` (${item.format})` : ""}. It isn't on your Calendar, so nothing is set to go out for it.`,
          href: "/plan", cta: "Open plan",
        });
      }
    }
  }

  // Comment replies waiting for approval.
  if (f.comments && f.comments.waiting > 0) {
    const n = f.comments.waiting;
    const oldest = f.comments.oldestAt ? ` The oldest comment is from ${agoPhrase(f.comments.oldestAt, now, tz)}.` : "";
    recs.push({
      kind: "comments", tone: "todo",
      title: `${plural(n, "comment")} waiting for a reply`,
      detail: `SOCIA drafted ${n === 1 ? "a reply" : "the replies"}; nothing is sent until you approve ${n === 1 ? "it" : "each one"}.${oldest}`,
      href: "/comments", cta: "Review replies",
    });
  }

  // Posting windows from the account's own history.
  const win = f.timed && f.timed.length ? buildWindows(f.timed, zonedAt(tz)) : null;
  const ahead = win?.enough ? windowsAhead(win.best, now, tz, GAP_HOURS / 24) : [];
  const todayWin = ahead.find((o) => dayNum(new Date(o.start), tz) === today) ?? null;

  // Nothing set to publish in the next three days.
  const soon = live.filter((p) => ms(p.at) >= nowMs && ms(p.at) < nowMs + GAP_HOURS * HOUR);
  if (!soon.some((p) => p.status === "scheduled" || p.status === "publishing")) {
    // Today's draft already has its own line above.
    const drafts = soon.filter((p) => p.status === "draft" && p.id !== draft?.id).length;
    const lastIg = f.timed?.length ? f.timed.map((t) => t.t).filter((t) => ms(t) <= nowMs).sort().at(-1) ?? null : null;
    const next = todayWin ? null : ahead[0] ?? null;
    const parts = [
      drafts ? `${plural(drafts, draft ? "other draft" : "draft")} in that time ${drafts === 1 ? "isn't" : "aren't"} scheduled.` : null,
      lastIg ? `Your last Instagram post went out ${agoPhrase(lastIg, now, tz)}.` : null,
      next ? `Your next strong window is ${DOW_LONG[next.w.day]} ${betweenPhrase(next.w.block)}: ${lift(next.w)} above your typical post (${sample(next.w)}).` : null,
    ].filter(Boolean);
    recs.push({
      kind: "gap", tone: "todo",
      title: "Nothing is set to publish in the next 3 days",
      detail: parts.length ? parts.join(" ") : "Create or schedule a post for the days ahead.",
      href: "/create", cta: "Create a post",
    });
  }

  // The best window today, when one is still open.
  if (todayWin) {
    const w = todayWin.w;
    const inside = todays.find((p) => ms(p.at) >= todayWin.start && ms(p.at) < todayWin.end);
    const outside = !inside ? todays[0] ?? null : null;
    const note = inside
      ? ` Your post at ${formatClock(inside.at, tz)} lands in it.`
      : outside
        ? ` Your post today is set for ${formatClock(outside.at, tz)}, outside it.`
        : "";
    recs.push({
      kind: "best_time", tone: inside ? "ok" : "chance",
      title: `Your best window today: ${shortRange(w.block)}`,
      detail: `Your Instagram posts on ${DOW_LONG[w.day]}s ${betweenPhrase(w.block)} get ${lift(w)} more engagement than your typical post (${sample(w)}).${note}`,
      href: inside ? "/plan/calendar" : "/create", cta: inside ? "View" : "Create a post",
    });
  }

  // A post taking off.
  if (f.breakout) {
    const b = f.breakout;
    const unit = b.metric === "views" ? "views" : "engagement";
    recs.push({
      kind: "breakout", tone: "chance",
      title: `Your ${PLATFORM_NAME[b.platform]} ${b.format.toLowerCase()} is taking off`,
      detail: `${quote(b.title)}, posted ${agoPhrase(b.postedAt, now, tz)}, has ${fmtMultiplier(b.multiplier)} the ${unit} of your typical ${b.format.toLowerCase()} (median of ${plural(b.sample, `other ${b.format.toLowerCase()}`)}). Worth a follow-up on the same idea while people are still finding it.`,
      href: "/create", cta: "Make a follow-up",
      ...(b.permalink ? { external: { href: b.permalink, label: "See post" } } : {}),
    });
  }

  // Content Studio posts not started yet.
  if (f.studio && f.studio.notStarted > 0) {
    const s = f.studio;
    recs.push({
      kind: "studio", tone: "chance",
      title: `${plural(s.notStarted, "video")} ready to make in Content Studio`,
      detail: `${s.title ? `${quote(s.title)}: ` : ""}SOCIA found ${plural(s.found, "post")} in your clips${s.notStarted < s.found ? ` and ${s.notStarted} ${s.notStarted === 1 ? "isn't" : "aren't"} started yet` : ""}. Next up: ${quote(s.next)}.`,
      href: `/studio?mode=clips&project=${encodeURIComponent(s.projectId)}`, cta: "Open project",
    });
  }

  const ranked = recs.map((r, i) => ({ r, i })).sort((a, b) => TONE_RANK[a.r.tone] - TONE_RANK[b.r.tone] || a.i - b.i).map((x) => x.r);
  const nextPost = live
    .filter((p) => (p.status === "scheduled" || p.status === "publishing") && ms(p.at) >= nowMs)
    .sort((a, b) => ms(a.at) - ms(b.at))[0] ?? null;
  return {
    recs: ranked.slice(0, MAX_RECS),
    next: nextPost ? { title: nextPost.title, when: whenPhrase(nextPost.at, now, tz) } : null,
  };
}
