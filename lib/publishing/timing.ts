// Recommended publish windows for the composer, and the small time-zone
// helpers the right rail needs to show and edit times in the viewer's zone.
//
// Built on lib/postingTimes.ts (weekday x 3-hour blocks, median relative
// engagement, MIN_POSTS gate). Every sentence carries its sample size and is
// null when the sample is too small. The input is the account's own dated
// Instagram posts; nothing is said about platforms without history.
//
// Pure, no I/O, client-safe. Time-zone maths goes through Intl so the same
// code runs in the browser (viewer's zone) and in tests (a named zone).

import { buildWindows, BLOCK_STARTS, DOW_LONG, MIN_POSTS, type TimedPost } from "../postingTimes";

export { MIN_POSTS };

/**
 * The sentences the check and scheduling sections share, so the two never
 * describe the same history differently.
 */
/** timing.instagram is null: SOCIA has no snapshot of this account's posts at all. */
export const NO_HISTORY_SENTENCE = "SOCIA has not read this account's Instagram posting history yet.";
/** Fewer than MIN_POSTS dated posts. */
export const SMALL_SAMPLE_SENTENCE = `Not enough posting history yet (SOCIA needs ${MIN_POSTS} posts).`;
/** Shown when a YouTube destination is on and the recommended window is in use. */
export const YOUTUBE_NO_HISTORY_SENTENCE = "This window comes from Instagram history only; SOCIA has no YouTube posting history yet.";

/** What to say about the Instagram history given what SOCIA holds. */
export function historySentence(rec: Recommendation | null, hasSnapshot: boolean): string {
  if (!hasSnapshot) return NO_HISTORY_SENTENCE;
  if (rec == null) return "Reading your posting history.";
  return rec.sentence ?? SMALL_SAMPLE_SENTENCE;
}

export type RecommendedWindow = {
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  /** index into BLOCK_STARTS */
  block: number;
  /** "Tuesday · 6 PM–9 PM" */
  label: string;
  /** posts in this bucket */
  n: number;
  /** median engagement of the bucket / median of all posts */
  rel: number;
  confidence: "high" | "early";
  /** ISO instant of the next occurrence (15 minutes into the block) in the viewer's zone. */
  nextAt: string;
};

export type Recommendation = {
  /** True only when the sample clears MIN_POSTS AND at least one window stands out. */
  enough: boolean;
  /** Dated posts in the sample. */
  posts: number;
  best: RecommendedWindow[];
  /** Evidence sentence, or null when there is not enough history to say anything. */
  sentence: string | null;
};

/** Minutes into a block the recommended time lands (6:15 PM for a 6 to 9 PM block). */
export const MINUTES_INTO_BLOCK = 15;

export function recommendedWindows(timed: TimedPost[], now: Date, tz: string): Recommendation {
  const w = buildWindows(timed);
  if (!w.enough) return { enough: false, posts: w.posts, best: [], sentence: null };
  const best: RecommendedWindow[] = w.best.map((b) => ({
    day: b.day, block: b.block, label: b.label, n: b.n, rel: b.rel, confidence: b.confidence,
    nextAt: nextOccurrence(b.day, b.block, now, tz),
  }));
  if (!best.length) {
    return {
      enough: false, posts: w.posts, best,
      sentence: `Your ${w.posts} Instagram posts do not show a time window with clearly higher median engagement yet.`,
    };
  }
  const top = best[0];
  const sentence = `Your Instagram posts ${betweenPhrase(top.block)} on ${DOW_LONG[top.day]}s have had higher median engagement in the available sample. Based on ${w.posts} Instagram posts.`;
  return { enough: true, posts: w.posts, best, sentence };
}

/** "between 6 and 9 PM", "between 9 AM and 12 PM", "between 9 PM and 12 AM". */
export function betweenPhrase(block: number): string {
  const start = BLOCK_STARTS[block];
  const end = start + 3;
  const a = clockParts(start);
  const b = clockParts(end);
  return a.period === b.period
    ? `between ${a.hour} and ${b.hour} ${b.period}`
    : `between ${a.hour} ${a.period} and ${b.hour} ${b.period}`;
}

function clockParts(h24: number): { hour: number; period: "AM" | "PM" } {
  const h = h24 % 24;
  if (h === 0) return { hour: 12, period: "AM" };
  if (h < 12) return { hour: h, period: "AM" };
  if (h === 12) return { hour: 12, period: "PM" };
  return { hour: h - 12, period: "PM" };
}

// ---------------------------------------------------------------------------
// Zone maths (Intl only, no library)
// ---------------------------------------------------------------------------

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short",
    });
    partsCache.set(tz, f);
  }
  return f;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of an instant in a zone. weekday is JS style (0 = Sunday). */
export function zonedParts(d: Date, tz: string): Parts {
  const out: Partial<Parts> = {};
  for (const p of formatter(tz).formatToParts(d)) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value) % 24;
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "second") out.second = Number(p.value);
    else if (p.type === "weekday") out.weekday = WD.indexOf(p.value);
  }
  return out as Parts;
}

/** Zone offset in ms (zone wall clock minus UTC) at an instant. */
function offsetAt(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The instant at which a zone's wall clock reads the given parts. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let off = offsetAt(new Date(guess), tz);
  let t = guess - off;
  // One correction pass covers a DST change between the guess and the answer.
  const off2 = offsetAt(new Date(t), tz);
  if (off2 !== off) { off = off2; t = guess - off; }
  return new Date(t);
}

/**
 * The next date-time inside a weekday x block window, MINUTES_INTO_BLOCK past
 * its start, in the given zone, strictly after `now`. day: 0 = Monday.
 */
export function nextOccurrence(day: number, block: number, now: Date, tz: string): string {
  const today = zonedParts(now, tz);
  const startHour = BLOCK_STARTS[block];
  for (let k = 0; k <= 7; k++) {
    // Calendar arithmetic on a UTC-midnight date: safe for adding days.
    const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + k));
    const mondayIndex = (cal.getUTCDay() + 6) % 7;
    if (mondayIndex !== day) continue;
    const at = zonedToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), startHour, MINUTES_INTO_BLOCK, tz);
    if (at.getTime() > now.getTime()) return at.toISOString();
  }
  // Unreachable in practice (k = 7 always lands on the same weekday one week out).
  const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + 7));
  return zonedToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), startHour, MINUTES_INTO_BLOCK, tz).toISOString();
}

// ---------------------------------------------------------------------------
// Display and input helpers, all in a named zone
// ---------------------------------------------------------------------------

/** The browser's zone, or null when it cannot be read (server render, old engine). */
export function viewerTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || null;
  } catch {
    return null;
  }
}

/** "6:15 PM" in a zone. */
export function formatClock(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

/** "Today · 6:15 PM", "Tomorrow · 6:15 PM", "Tue, Sep 23 · 6:15 PM", with the year when it differs. */
export function formatWhen(iso: string, now: Date, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const a = zonedParts(d, tz);
  const b = zonedParts(now, tz);
  const dayNum = (p: Parts) => Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
  const diff = dayNum(a) - dayNum(b);
  const clock = formatClock(iso, tz);
  if (diff === 0) return `Today · ${clock}`;
  if (diff === 1) return `Tomorrow · ${clock}`;
  const date = d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: tz, ...(a.year !== b.year ? { year: "numeric" as const } : {}),
  });
  return `${date} · ${clock}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> "YYYY-MM-DDTHH:mm" for a datetime-local input, in a zone. Empty string when invalid or null. */
export function toLocalInput(iso: string | null, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = zonedParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" from a datetime-local input, read as wall clock in a zone -> ISO instant. null when incomplete. */
export function fromLocalInput(value: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
