// Make and schedule: spread a batch of finished videos over the coming days,
// a set number a day. A day's existing Calendar posts count toward its number
// and keep their distance. A time is "from your history" only when the
// account's own posting history backs that weekday (lib/postingTimes.ts:
// MIN_POSTS, sample sizes in the sentence); other slots use a fixed default
// time that says so. Similar posts (same footage or subject) are kept apart
// where there is a choice. Pure, zone-explicit, tested.
import { BLOCK_STARTS, DOW_LONG, MIN_POSTS, buildWindows, relText, type TimedPost } from "@/lib/postingTimes";
import { betweenPhrase, MINUTES_INTO_BLOCK, zonedParts, zonedToUtc } from "@/lib/publishing/timing";
import { similar, type CalendarPost, type PlanOpportunity } from "./distribute";

export type BatchItem = { key: string; title: string; strength: "strong" | "possible" | "clip"; clipIds: string[]; tags: string[] };
export type BatchSlot = {
  key: string;
  /** ISO instant */
  at: string;
  /** the day in the viewer's zone, "2026-11-02" */
  date: string;
  /** true when the time comes from this account's posting history */
  timeChosen: boolean;
  reason: string;
};
export type BatchPlan = { slots: BatchSlot[]; unplaced: { key: string; reason: string }[]; timing: string };

export const MAX_PER_DAY = 3;
export const BATCH_HORIZON_DAYS = 60;
/** Default local hours by posts a day, when the history doesn't pick one. */
export const DEFAULT_HOURS: Record<number, number[]> = { 1: [12], 2: [11, 18], 3: [9, 13, 19] };
/** Two posts on one day are at least this far apart. */
export const MIN_GAP_MIN = 120;
/** Nothing is scheduled sooner than this from now. */
export const LEAD_MIN = 30;
const LAST_HOUR = 21;

type Day = { date: string; y: number; m: number; d: number; weekday: number };

export function dayFrom(date: string, plus: number): Day {
  const [y0, m0, d0] = date.split("-").map(Number);
  const cal = new Date(Date.UTC(y0, m0 - 1, d0 + plus));
  const y = cal.getUTCFullYear(), m = cal.getUTCMonth() + 1, d = cal.getUTCDate();
  return { y, m, d, weekday: (cal.getUTCDay() + 6) % 7, date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/** Tomorrow in the viewer's zone, "YYYY-MM-DD". */
export function tomorrowIn(now: Date, tz: string): string {
  const p = zonedParts(now, tz);
  return dayFrom(`${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`, 1).date;
}

const dateOf = (iso: string, tz: string) => { const p = zonedParts(new Date(iso), tz); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const asOpp = (i: BatchItem): PlanOpportunity => ({ idx: 0, title: i.title, strength: i.strength === "clip" ? "possible" : i.strength, clipIds: i.clipIds, tags: i.tags });

export function scheduleBatch(input: {
  items: BatchItem[];
  perDay: number;
  /** first day, "YYYY-MM-DD" in tz */
  startDate: string;
  existing: CalendarPost[];
  /** the account's dated Instagram posts; null = SOCIA holds no history */
  history: TimedPost[] | null;
  now: Date;
  tz: string;
  horizonDays?: number;
}): BatchPlan {
  const { items, existing, history, now, tz } = input;
  const perDay = Math.max(1, Math.min(MAX_PER_DAY, Math.round(input.perDay)));
  const horizon = input.horizonDays ?? BATCH_HORIZON_DAYS;

  const w = history ? buildWindows(history, (d) => { const p = zonedParts(d, tz); return { day: (p.weekday + 6) % 7, hour: p.hour }; }) : null;
  const bestByWeekday = new Map<number, NonNullable<typeof w>["best"][number]>();
  if (w?.enough) for (const b of w.best) if (!bestByWeekday.has(b.day)) bestByWeekday.set(b.day, b);
  const defaults = DEFAULT_HOURS[perDay].map((h) => `${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`).join(" and ");
  const timing = !history
    ? `SOCIA hasn't read this account's posting history, so every post uses a default time (${defaults}). Change any of them below.`
    : !w?.enough
      ? `Not enough posting history to pick times (${w?.posts ?? 0} posts; SOCIA needs ${MIN_POSTS}), so every post uses a default time (${defaults}). Change any of them below.`
      : bestByWeekday.size
        ? `Where your ${w.posts} Instagram posts show a stronger window for that weekday, the first post of the day goes there; the others use a default time (${defaults}).`
        : `Your ${w.posts} Instagram posts don't show a window with clearly higher engagement yet, so every post uses a default time (${defaults}).`;

  // Existing posts by day, as minutes since local midnight.
  const busy = new Map<string, number[]>();
  for (const p of existing) {
    const d = dateOf(p.at, tz);
    const z = zonedParts(new Date(p.at), tz);
    busy.set(d, [...(busy.get(d) ?? []), z.hour * 60 + z.minute]);
  }

  const queue = [...items];
  const slots: BatchSlot[] = [];
  let prev: BatchItem | null = null;
  const earliest = now.getTime() + LEAD_MIN * 60_000;

  for (let k = 0; k < horizon && queue.length; k++) {
    const day = dayFrom(input.startDate, k);
    const taken = [...(busy.get(day.date) ?? [])];
    let room = perDay - taken.length;
    if (room <= 0) continue;
    const win = bestByWeekday.get(day.weekday);
    const wanted: { min: number; chosen: boolean }[] = DEFAULT_HOURS[perDay].map((h) => ({ min: h * 60, chosen: false }));
    // The history's window for this weekday takes the place of the nearest default slot.
    if (win) {
      const wmin = BLOCK_STARTS[win.block] * 60 + MINUTES_INTO_BLOCK;
      const near = wanted.reduce((bi, x, i) => (Math.abs(x.min - wmin) < Math.abs(wanted[bi].min - wmin) ? i : bi), 0);
      wanted[near] = { min: wmin, chosen: true };
      wanted.sort((a, b) => a.min - b.min);
    }
    // Default slots that are clear of the day's posts come first; a clashing one is nudged
    // forward an hour at a time only if the day still has room after that.
    const clash = (min: number) => taken.some((t) => Math.abs(t - min) < MIN_GAP_MIN);
    const order = [...wanted.filter((x) => !clash(x.min)), ...wanted.filter((x) => clash(x.min))];
    for (const want of order) {
      if (room <= 0 || !queue.length) break;
      let min = want.min;
      while (min <= LAST_HOUR * 60 && clash(min)) min += 60;
      if (min > LAST_HOUR * 60) continue;
      const at = zonedToUtc(day.y, day.m, day.d, Math.floor(min / 60), min % 60, tz);
      if (at.getTime() < earliest) continue;
      // The next item that isn't like the one before it, when there is one.
      const pick = queue.findIndex((i) => !prev || !similar(asOpp(i), asOpp(prev)));
      const item = queue.splice(pick < 0 ? 0 : pick, 1)[0];
      const chosen = want.chosen && min === want.min;
      const reason = chosen && win
        ? `Your Instagram posts on ${DOW_LONG[win.day]}s ${betweenPhrase(win.block)} have done ${relText(win.rel)} (${win.n} post${win.n === 1 ? "" : "s"}${win.confidence === "early" ? ", an early signal" : ""}).`
        : min !== want.min
          ? "Default time, moved to keep two hours from another post that day."
          : "Default time.";
      slots.push({ key: item.key, at: at.toISOString(), date: day.date, timeChosen: chosen, reason });
      taken.push(min);
      room--;
      prev = item;
    }
  }
  const unplaced = queue.map((i) => ({ key: i.key, reason: `No free slot in the next ${horizon} days at ${perDay} a day.` }));
  slots.sort((a, b) => a.at.localeCompare(b.at));
  return { slots, unplaced, timing };
}

/** Strongest ideas first, then possible ones, then single clips; stable otherwise. */
export function batchOrder<T extends { strength: BatchItem["strength"] }>(items: T[]): T[] {
  const rank = { strong: 0, possible: 1, clip: 2 } as const;
  return items.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.strength] - rank[b.x.strength] || a.i - b.i).map((o) => o.x);
}
