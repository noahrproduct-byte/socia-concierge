// Audience timing, computed from the user's own posts in the viewer's time
// zone. Shared by the Calendar (grid, best windows, draft placement) and the
// Content Plan (suggested post times, timing evidence for the strategist).
// Pure and browser-safe: no I/O, no server imports.

export type CalPost = { t: string; e: number };

export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_MS = 86400000;

export const hourLabel = (h: number) =>
  h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

/** Monday 00:00 of the week containing d (local time). */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (m.getDay() + 6) % 7; // Mon=0
  m.setDate(m.getDate() - dow);
  return m;
}

export type Audience = {
  enough: boolean;
  // per weekday (Mon-first): 24 smoothed values normalized 0..1
  days: number[][];
  bestDays: number[]; // weekday indexes worth flagging
  bestHour: (day: number) => number;
  peak: { day: number; hour: number } | null;
  postCount: number;
};

/** Bucket real posts into weekday × hour engagement, smoothed across hours.
 *  Runs client-side so hours land in the viewer's time zone. */
export function buildAudience(posts: CalPost[]): Audience {
  const raw: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dayPosts = Array(7).fill(0);
  for (const p of posts) {
    const d = new Date(p.t);
    if (isNaN(d.getTime())) continue;
    const day = (d.getDay() + 6) % 7;
    raw[day][d.getHours()] += Math.max(1, p.e);
    dayPosts[day]++;
  }
  const days = raw.map((hs) =>
    hs.map((_, h) => 0.5 * (hs[h - 1] ?? 0) + hs[h] + 0.5 * (hs[h + 1] ?? 0))
  );
  let max = 0;
  let peak: { day: number; hour: number } | null = null;
  days.forEach((hs, day) =>
    hs.forEach((v, hour) => {
      if (v > max) {
        max = v;
        peak = { day, hour };
      }
    })
  );
  if (max > 0) days.forEach((hs) => hs.forEach((v, h) => (hs[h] = v / max)));

  const totals = days.map((hs) => hs.reduce((a, b) => a + b, 0));
  const topTotal = Math.max(...totals);
  const bestDays = totals
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => t > 0 && t >= topTotal * 0.8 && dayPosts[i] >= 2)
    .sort((a, b) => b.t - a.t)
    .slice(0, 2)
    .map(({ i }) => i);

  const enough = posts.length >= 5 && max > 0;
  return {
    enough,
    days,
    bestDays: enough ? bestDays : [],
    bestHour: (day) => days[day].indexOf(Math.max(...days[day])),
    peak: enough ? peak : null,
    postCount: posts.length,
  };
}

/** Hour to place a post on a weekday (Mon-first index): that day's own best
 *  hour only when the day is one the grid flags as BEST (enough posts, near the
 *  top total — the same rule that shows its "Best window"); otherwise the
 *  audience's overall peak hour; noon when there is no audience data. A day
 *  with two posts of eight reactions each does not get to name an hour. */
export function suggestedHour(aud: Audience, dayMonFirst: number): number {
  if (aud.enough && aud.bestDays.includes(dayMonFirst)) return aud.bestHour(dayMonFirst);
  if (aud.enough && aud.peak) return aud.peak.hour;
  return 12;
}

/** The audience's timing as one factual sentence for the strategist prompt.
 *  Empty when there aren't enough posts to say anything. */
export function audienceWindowsText(posts: CalPost[]): string {
  const aud = buildAudience(posts);
  if (!aud.enough || !aud.peak) return "";
  const windows = [`${DOW[aud.peak.day]} ${hourLabel(aud.peak.hour)} (peak)`];
  for (const d of aud.bestDays) {
    if (d === aud.peak.day) continue;
    windows.push(`${DOW[d]} ${hourLabel(aud.bestHour(d))}`);
  }
  const bestDays = aud.bestDays.map((d) => DOW[d]).join(", ");
  return `From ${aud.postCount} of the account's own posts (viewer's local time): strongest engagement windows ${windows.join(", ")}. Best days: ${bestDays || "no day stands out yet"}.`;
}
