// The visual Overview's own shapes (components/dashboard/Dashboard.tsx):
// the 7-day strip, the competitor comparison with its two measures, and how
// the content score reads. Pure: dates come in, nothing here reads a clock,
// so the strip is built in the viewer's own time zone after mount.
import type { PostStatus } from "@/lib/scheduling";

export const DAY_MS = 86_400_000;

/** What a day on the strip holds: one icon per kind, one dot per status. */
export type WeekKind = "reel" | "photo" | "carousel" | "story" | "post";
export type WeekStatus = "posted" | "scheduled" | "planned" | "draft" | "failed";
export type WeekItem = { kind: WeekKind; status: WeekStatus; title: string };
export type WeekDay = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Mon, Tue... */
  label: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
  items: WeekItem[];
};

/** A calendar post as the strip needs it (lib/scheduling ScheduledPost, trimmed for the browser). */
export type CalendarItem = { id: string; at: string; status: PostStatus; mediaType: "REELS" | "IMAGE" | string; title: string };
/** A line of the latest Content Plan's week (lib/schema Deliverable.weeklyPlan, trimmed). */
export type PlanDayItem = { day: string; format: string; title: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Local YYYY-MM-DD of a date, in the running environment's time zone. */
export const localDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function kindOfFormat(format: string | null | undefined): WeekKind {
  const f = (format ?? "").toLowerCase();
  if (/reel|video|short/.test(f)) return "reel";
  if (/carousel|album/.test(f)) return "carousel";
  if (/story|stories/.test(f)) return "story";
  if (/photo|image|static|picture/.test(f)) return "photo";
  return "post";
}

const kindOfMedia = (mediaType: string): WeekKind => (mediaType === "REELS" ? "reel" : mediaType === "IMAGE" ? "photo" : kindOfFormat(mediaType));

const statusOf = (s: PostStatus): WeekStatus | null => {
  if (s === "published") return "posted";
  if (s === "scheduled" || s === "publishing") return "scheduled";
  if (s === "draft") return "draft";
  if (s === "failed") return "failed";
  return null; // cancelled
};

/** The weekday a plan line names ("Monday", "Mon", "Day 2: Tuesday"), or null. */
export function planWeekday(day: string): number | null {
  const m = day.toLowerCase().match(/\b(sun|mon|tue|wed|thu|fri|sat)/);
  return m ? DAY_INDEX[m[1]] : null;
}

/**
 * Monday to Sunday of the week that holds `now`, in local time. Published
 * posts and calendar posts fill their days; the plan's lines fill the days
 * that have nothing yet, as "planned", only when the plan is this week's.
 */
export function buildWeek(input: {
  now: Date;
  published: { t: string; format: string; title?: string }[];
  calendar: CalendarItem[];
  plan: PlanDayItem[] | null;
}): WeekDay[] {
  const { now } = input;
  const today = localDate(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Monday first: shift Sunday (0) to the end.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = localDate(d);
    return { date, label: WEEKDAYS[d.getDay()], dayNum: d.getDate(), isToday: date === today, isPast: date < today, items: [] };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (const p of input.published) {
    const day = byDate.get(localDate(new Date(p.t)));
    if (day) day.items.push({ kind: kindOfFormat(p.format), status: "posted", title: p.title ?? p.format });
  }
  for (const c of input.calendar) {
    const status = statusOf(c.status);
    const day = byDate.get(localDate(new Date(c.at)));
    if (!status || !day) continue;
    // A Calendar post that went out is already on its day from the platform's own list when there is one.
    if (status === "posted" && day.items.some((i) => i.status === "posted")) continue;
    day.items.push({ kind: kindOfMedia(c.mediaType), status, title: c.title });
  }
  if (input.plan) {
    for (const line of input.plan) {
      const wd = planWeekday(line.day);
      if (wd == null) continue;
      const day = days.find((d) => new Date(`${d.date}T12:00:00`).getDay() === wd);
      if (!day || day.items.length) continue;
      day.items.push({ kind: kindOfFormat(line.format), status: "planned", title: line.title });
    }
  }
  for (const d of days) d.items = d.items.slice(0, 3);
  return days;
}

/** One line for assistive tech: "Mon 3: 1 reel posted". */
export function describeDay(d: WeekDay): string {
  if (!d.items.length) return `${d.label} ${d.dayNum}: nothing ${d.isPast ? "posted" : "planned"}`;
  const parts = d.items.map((i) => `${i.kind} ${i.status}`);
  return `${d.label} ${d.dayNum}: ${parts.join(", ")}`;
}

// ------------------------------------------------------------ competitors ----

export type CompetitorMetric = "engagement" | "followers";
export type CompetitorRow = { handle: string; name: string; avatar: string | null; engagement: number | null; followers: number | null };
export type Competitors = { tracked: number; rows: CompetitorRow[]; you: { engagement: number | null; followers: number | null } };

export const COMPETITOR_METRICS: { id: CompetitorMetric; label: string; source: string }[] = [
  { id: "engagement", label: "Likes + comments per post", source: "Median likes and comments per post, last 12 posts each, Instagram." },
  { id: "followers", label: "Followers", source: "Followers as last read from Instagram." },
];

export type CompareBar = { handle: string; name: string; avatar: string | null; value: number; you: boolean };

/** You and the top three accounts on one measure, largest first; accounts without that number are left out. */
export function compareBars(c: Competitors, metric: CompetitorMetric, top = 3): CompareBar[] {
  const rows: CompareBar[] = [];
  const mine = c.you[metric];
  if (mine != null) rows.push({ handle: "you", name: "You", avatar: null, value: mine, you: true });
  const theirs = c.rows
    .filter((r) => r[metric] != null)
    .map((r) => ({ handle: r.handle, name: r.name, avatar: r.avatar, value: r[metric] as number, you: false }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
  return [...rows, ...theirs].sort((a, b) => b.value - a.value);
}

// ------------------------------------------------------------------ score ----

export type ScoreTone = "low" | "ok" | "good";

/** Colour by range, always paired with its word so colour is never the only signal. */
export function scoreTone(score: number): { tone: ScoreTone; word: string } {
  if (score >= 75) return { tone: "good", word: "Strong" };
  if (score >= 50) return { tone: "ok", word: "Building" };
  return { tone: "low", word: "Needs work" };
}

/** Short figures for stat cards: 1.2K, 3.4M. */
export function shortNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}
