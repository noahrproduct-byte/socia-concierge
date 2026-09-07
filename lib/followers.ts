// Follower history from SOCIA's own daily snapshots. Followers are a stock,
// not a flow: buckets carry the count at the END of the period and the net
// change, never a sum. Nothing before the first snapshot is ever filled in.
//
// Pure and browser-safe.

export type FollowerPoint = { day: string; followers: number };
export type FollowerBucket = {
  key: string;
  /** First day of the bucket (ISO). */
  start: string;
  /** Last snapshot day inside the bucket (ISO). */
  end: string;
  followers: number;
  /** vs the previous bucket's ending count; null for the first bucket. */
  net: number | null;
  days: number;
  partial: boolean;
};
export type FollowerGranularity = "day" | "week" | "month" | "year";

const DAY_MS = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monday = (day: string) => { const d = new Date(day + "T00:00:00Z"); return iso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS)); };
const bucketKey = (day: string, g: FollowerGranularity): string =>
  g === "day" ? day : g === "week" ? monday(day) : g === "month" ? day.slice(0, 7) : day.slice(0, 4);

export function followerPoints(rows: { day: string; followers: number | null }[]): FollowerPoint[] {
  return rows.filter((r): r is { day: string; followers: number } => r.followers != null).sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, followers: r.followers }));
}

/** Points within [from, to] (ISO days, inclusive). */
export const inRange = (pts: FollowerPoint[], from: string, to: string) => pts.filter((p) => p.day >= from && p.day <= to);

export function bucketFollowers(pts: FollowerPoint[], g: FollowerGranularity, today: string): FollowerBucket[] {
  const out: FollowerBucket[] = [];
  for (const p of pts) {
    const key = bucketKey(p.day, g);
    const last = out[out.length - 1];
    if (last && last.key === key) { last.end = p.day; last.followers = p.followers; last.days++; }
    else out.push({ key, start: g === "day" ? p.day : g === "week" ? monday(p.day) : g === "month" ? `${key}-01` : `${key}-01-01`, end: p.day, followers: p.followers, net: null, days: 1, partial: false });
  }
  for (let i = 1; i < out.length; i++) out[i].net = out[i].followers - out[i - 1].followers;
  if (out.length) out[out.length - 1].partial = g !== "day" && bucketKey(today, g) === out[out.length - 1].key;
  return out;
}

export type FollowerSummary = {
  latest: number | null;
  firstDay: string | null;
  lastDay: string | null;
  /** Distinct days with a recorded count. */
  daysCollected: number;
  /** Calendar span from first to last snapshot, in days (1 when only one). */
  spanDays: number;
  net: number | null;
  growthPct: number | null;
  avgDailyNet: number | null;
  /** Plain-language state of the history, for the UI. */
  statusLine: string;
  detailLine: string;
};

const fmtDate = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Summary over the points given (already filtered to the wanted range). */
export function summarizeFollowers(pts: FollowerPoint[], allPts: FollowerPoint[] = pts): FollowerSummary {
  const firstEver = allPts[0]?.day ?? null;
  const daysAll = allPts.length;
  if (!pts.length) {
    return { latest: null, firstDay: null, lastDay: null, daysCollected: 0, spanDays: 0, net: null, growthPct: null, avgDailyNet: null,
      statusLine: firstEver ? `No snapshots in this range. Tracking started ${fmtDate(firstEver)}.` : "Follower tracking starts the moment an account is connected.",
      detailLine: "Historical follower counts before connection are not available from Instagram." };
  }
  const first = pts[0], last = pts[pts.length - 1];
  const spanDays = Math.max(1, Math.round((new Date(last.day + "T00:00:00Z").getTime() - new Date(first.day + "T00:00:00Z").getTime()) / DAY_MS));
  const net = pts.length >= 2 ? last.followers - first.followers : null;
  const growthPct = net != null && first.followers > 0 ? (net / first.followers) * 100 : null;
  const avgDailyNet = net != null && spanDays > 0 ? net / spanDays : null;
  const statusLine = daysAll === 1
    ? "Follower tracking started today."
    : `${daysAll} day${daysAll === 1 ? "" : "s"} of follower history collected${firstEver ? ` since ${fmtDate(firstEver)}` : ""}.`;
  return {
    latest: last.followers, firstDay: first.day, lastDay: last.day, daysCollected: pts.length, spanDays, net, growthPct, avgDailyNet,
    statusLine,
    detailLine: daysAll === 1 ? "Historical follower counts before connection are not available from Instagram. SOCIA records one snapshot per day from here on." : "Recorded by SOCIA once a day. Counts before the first snapshot are not available from Instagram and are never estimated.",
  };
}
