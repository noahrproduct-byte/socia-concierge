// Plan These Posts: spread a project's post opportunities over the next two
// weeks of the calendar. Days come from what's already on the calendar (one
// post a day at most), spacing (similar posts never on neighbouring days),
// and order (strongest first). A time is only "chosen" when the account's
// own posting history backs that weekday and hour (lib/postingTimes.ts:
// MIN_POSTS, sample sizes in every sentence); otherwise it is a clearly
// labelled placeholder for the person to set. Pure, zone-explicit, tested.
import { BLOCK_STARTS, DOW_LONG, MIN_POSTS, buildWindows, relText, type TimedPost } from "@/lib/postingTimes";
import { betweenPhrase, MINUTES_INTO_BLOCK, zonedParts, zonedToUtc } from "@/lib/publishing/timing";

export type PlanOpportunity = { idx: number; title: string; strength: "strong" | "possible"; clipIds: string[]; tags: string[] };
/** Something already on the calendar (any status except cancelled/failed). */
export type CalendarPost = { id: string; at: string; label: string };

export type Placement = {
  idx: number;
  /** ISO instant */
  at: string;
  /** the day in the viewer's zone, "2026-10-09" */
  date: string;
  /** true when the time comes from this account's history; false = placeholder */
  timeChosen: boolean;
  reasons: string[];
};

export type DistributionPlan = {
  placements: Placement[];
  unplaced: { idx: number; reason: string }[];
  /** what the history could and couldn't say about times */
  timing: string;
};

export const HORIZON_DAYS = 14;
/**
 * How many days later a history-backed weekday may be than an unsupported
 * one and still win. Small on purpose: a steady spread across the two weeks
 * matters more than landing every post in the best window.
 */
export const UNSUPPORTED_DAY_PENALTY = 3;
/** Placeholder hour when no measured window exists: midday, labelled as a placeholder. */
export const PLACEHOLDER_HOUR = 12;

type Day = { k: number; date: string; y: number; m: number; d: number; weekday: number };

const norm = (s: string) => s.trim().toLowerCase();

/** Same footage, or mostly the same subject. */
export function similar(a: PlanOpportunity, b: PlanOpportunity): boolean {
  if (a.clipIds.some((c) => b.clipIds.includes(c))) return true;
  const ta = new Set(a.tags.map(norm)), tb = new Set(b.tags.map(norm));
  if (!ta.size || !tb.size) return false;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / (ta.size + tb.size - inter) >= 0.5;
}

function daysAhead(now: Date, tz: string, n: number): Day[] {
  const today = zonedParts(now, tz);
  return Array.from({ length: n }, (_, i) => {
    const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + i + 1));
    const y = cal.getUTCFullYear(), m = cal.getUTCMonth() + 1, d = cal.getUTCDate();
    return { k: i, y, m, d, weekday: (cal.getUTCDay() + 6) % 7, date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
  });
}

const dateOf = (iso: string, tz: string) => { const p = zonedParts(new Date(iso), tz); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const dayName = (day: Day) => DOW_LONG[day.weekday];

export function planPosts(input: {
  opportunities: PlanOpportunity[];
  existing: CalendarPost[];
  /** the account's dated Instagram posts; null = SOCIA holds no history */
  history: TimedPost[] | null;
  now: Date;
  tz: string;
  horizonDays?: number;
}): DistributionPlan {
  const { opportunities, existing, history, now, tz } = input;
  const days = daysAhead(now, tz, input.horizonDays ?? HORIZON_DAYS);

  // What the history says about times, in the viewer's zone.
  const w = history ? buildWindows(history, (d) => { const p = zonedParts(d, tz); return { day: (p.weekday + 6) % 7, hour: p.hour }; }) : null;
  const bestByWeekday = new Map<number, (typeof w extends null ? never : NonNullable<typeof w>)["best"][number]>();
  if (w?.enough) for (const b of w.best) if (!bestByWeekday.has(b.day)) bestByWeekday.set(b.day, b);
  const timing = !history
    ? "SOCIA hasn't read this account's posting history, so every time is a placeholder for you to set."
    : !w?.enough
      ? `Not enough posting history to recommend times (${w?.posts ?? 0} posts; SOCIA needs ${MIN_POSTS}), so every time is a placeholder for you to set.`
      : bestByWeekday.size
        ? `Times come from your ${w.posts} Instagram posts; days without a standout window get a placeholder time.`
        : `Your ${w.posts} Instagram posts don't show a time window with clearly higher engagement yet, so every time is a placeholder.`;

  const busy = new Map<string, CalendarPost>();
  for (const p of existing) { const d = dateOf(p.at, tz); if (!busy.has(d)) busy.set(d, p); }

  const order = [...opportunities].sort((a, b) => (a.strength === b.strength ? a.idx - b.idx : a.strength === "strong" ? -1 : 1));
  const gap = Math.max(1, Math.min(3, Math.floor(days.length / (order.length + 1))));
  const taken = new Map<number, PlanOpportunity>();
  const placements: Placement[] = [];
  const unplaced: DistributionPlan["unplaced"] = [];
  let cursor = 0;

  const blockedBySimilar = (o: PlanOpportunity, k: number) => [k - 1, k + 1].map((j) => taken.get(j)).find((t) => t && similar(o, t));

  for (const o of order) {
    let best: Day | null = null, bestScore = Infinity;
    for (const day of days) {
      if (busy.has(day.date) || taken.has(day.k) || blockedBySimilar(o, day.k)) continue;
      // A day the history backs is worth waiting a couple of days for.
      const score = Math.abs(day.k - cursor) + (day.k < cursor ? 0.5 : 0) + (w?.enough && bestByWeekday.size && !bestByWeekday.has(day.weekday) ? UNSUPPORTED_DAY_PENALTY : 0);
      if (score < bestScore) { best = day; bestScore = score; }
    }
    if (!best) {
      unplaced.push({ idx: o.idx, reason: "No free day in the next two weeks without a second post on the same day or a similar post next to it." });
      continue;
    }
    const reasons: string[] = [];
    // Why not the day it would naturally have gone on? Only said when the clash (not the
    // posting-history preference) is what moved it: the chosen day is the first free one after.
    const natural = days[Math.min(cursor, days.length - 1)];
    const firstFree = days.find((d) => d.k >= (natural?.k ?? 0) && !busy.has(d.date) && !taken.has(d.k) && !blockedBySimilar(o, d.k));
    if (natural && natural.k !== best.k && firstFree?.k === best.k) {
      const clash = busy.get(natural.date);
      const sim = blockedBySimilar(o, natural.k);
      if (clash) reasons.push(`${dayName(natural)} already has a post (“${clash.label}”), so this goes on ${dayName(best)}.`);
      else if (sim) reasons.push(`Kept a day away from “${sim.title}”, which ${o.clipIds.some((c) => sim.clipIds.includes(c)) ? "uses the same footage" : "covers the same subject"}.`);
    }
    const win = bestByWeekday.get(best.weekday);
    let at: Date;
    if (win) {
      at = zonedToUtc(best.y, best.m, best.d, BLOCK_STARTS[win.block], MINUTES_INTO_BLOCK, tz);
      reasons.unshift(`Your Instagram posts on ${DOW_LONG[win.day]}s ${betweenPhrase(win.block)} have done ${relText(win.rel)} (${win.n} post${win.n === 1 ? "" : "s"}${win.confidence === "early" ? ", an early signal" : ""}).`);
    } else {
      at = zonedToUtc(best.y, best.m, best.d, PLACEHOLDER_HOUR, 0, tz);
      reasons.unshift("Placeholder time: set it in Create Post.");
    }
    if (o.strength === "strong" && !placements.length) reasons.push("Strongest post first.");
    taken.set(best.k, o);
    placements.push({ idx: o.idx, at: at.toISOString(), date: best.date, timeChosen: Boolean(win), reasons });
    cursor = best.k + gap;
  }

  placements.sort((a, b) => a.at.localeCompare(b.at));
  return { placements, unplaced, timing };
}

/** Days a person may move a placement to: free days in the horizon (its own day included). */
export function freeDays(plan: DistributionPlan, existing: CalendarPost[], now: Date, tz: string, own: string, horizonDays = HORIZON_DAYS): { date: string; label: string }[] {
  const busy = new Set(existing.map((p) => dateOf(p.at, tz)));
  const used = new Set(plan.placements.map((p) => p.date).filter((d) => d !== own));
  return daysAhead(now, tz, horizonDays)
    .filter((d) => !busy.has(d.date) && !used.has(d.date))
    .map((d) => ({ date: d.date, label: `${DOW_LONG[d.weekday].slice(0, 3)} ${d.m}/${d.d}` }));
}

/** Move one placement to another day, keeping the time rule (history-backed or placeholder). */
export function moveTo(p: Placement, date: string, history: TimedPost[] | null, tz: string): Placement {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const w = history ? buildWindows(history, (x) => { const z = zonedParts(x, tz); return { day: (z.weekday + 6) % 7, hour: z.hour }; }) : null;
  const win = w?.enough ? w.best.find((b) => b.day === weekday) : undefined;
  const at = win ? zonedToUtc(y, m, d, BLOCK_STARTS[win.block], MINUTES_INTO_BLOCK, tz) : zonedToUtc(y, m, d, PLACEHOLDER_HOUR, 0, tz);
  const reasons = [win ? `Your Instagram posts on ${DOW_LONG[win.day]}s ${betweenPhrase(win.block)} have done ${relText(win.rel)} (${win.n} post${win.n === 1 ? "" : "s"}).` : "Placeholder time: set it in Create Post.", "Moved by you."];
  return { ...p, date, at: at.toISOString(), timeChosen: Boolean(win), reasons };
}
