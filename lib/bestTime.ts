// Best-time-to-post, computed from real post timestamps.
//
// IMPORTANT: this must run in the BROWSER. On Vercel the server runs in UTC,
// so bucketing timestamps server-side reports the wrong weekday/hour to the
// user (e.g. "Wed 2AM" for a window that is really Tue 9PM local). Every
// caller therefore passes raw timestamps to a client component and formats
// there, in the viewer's own time zone.

export type TimedPost = { t: string; e: number };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function hourLabel(h: number): string {
  return h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;
}
export function hourLabelSpaced(h: number): string {
  return h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
}

export type BestWindow = {
  day: number;      // 0-6, local
  hour: number;     // 0-23, local
  short: string;    // "Tue 9PM"
  long: string;     // "Tuesday around 9 PM"
  sampleSize: number;
};

/** The weekday+hour bucket whose posts earned the most total engagement.
 *  null when there aren't enough dated posts to say anything. */
export function bestWindow(posts: TimedPost[], minPosts = 3): BestWindow | null {
  const buckets = new Map<string, { score: number; day: number; hour: number; n: number }>();
  let dated = 0;
  for (const p of posts) {
    const d = new Date(p.t);
    if (isNaN(d.getTime())) continue;
    dated++;
    const day = d.getDay();
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const cur = buckets.get(key) ?? { score: 0, day, hour, n: 0 };
    cur.score += p.e;
    cur.n += 1;
    buckets.set(key, cur);
  }
  if (dated < minPosts) return null;
  let best: { score: number; day: number; hour: number; n: number } | null = null;
  for (const b of buckets.values()) if (!best || b.score > best.score) best = b;
  if (!best) return null;
  return {
    day: best.day,
    hour: best.hour,
    short: `${DAYS[best.day]} ${hourLabel(best.hour)}`,
    long: `${LONG[best.day]} around ${hourLabelSpaced(best.hour)}`,
    sampleSize: dated,
  };
}

/** Two-hour engagement histogram across the day (12 buckets), local time. */
export function hourHistogram(posts: TimedPost[]): { values: number[]; hot: number } {
  const values = Array(12).fill(0);
  for (const p of posts) {
    const d = new Date(p.t);
    if (isNaN(d.getTime())) continue;
    values[Math.floor(d.getHours() / 2)] += p.e;
  }
  let hot = 0;
  values.forEach((v, i) => {
    if (v > values[hot]) hot = i;
  });
  return { values, hot };
}
