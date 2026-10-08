// "Your week" in the weekly roundup: an accountability scorecard from the
// account's own posts and its Content Plan. How often it posted this week and
// last, how many weeks in a row it has posted, its best post of the week
// against its own median, and how the plan is going. Every number comes from
// synced posts; a streak that reaches the oldest synced post says so instead
// of claiming more. Pure, tested.
import { isoWeekKey } from "./alertDetectors";
import { median } from "./metrics";
import { fmtMultiplier } from "./multiplier";

export type ScorePost = { id: string; t: number; interactions: number; caption: string | null; permalink: string | null; format: string };

export type Scorecard = {
  thisWeek: number;
  lastWeek: number;
  /** consecutive ISO weeks with a post, counting this week only once it has one */
  streak: { weeks: number; atLeast: boolean };
  best: { line: string; permalink: string | null } | null;
  plan: string | null;
  lines: string[];
};

const DAY = 86_400_000;
const MIN_SAMPLE = 5;
const SETTLE_MS = 72 * 3_600_000;

const firstLine = (s: string | null) => {
  const l = (s ?? "").split("\n").map((x) => x.replace(/(\s+#[\p{L}\p{N}_]+)+\s*$/u, "").trim()).find((x) => x && !x.startsWith("#")) ?? "";
  return l.length > 70 ? `${l.slice(0, 69)}…` : l;
};
const times = (n: number) => `${n} time${n === 1 ? "" : "s"}`;

export function weeklyScorecard(posts: ScorePost[], now: number, planLine: string | null): Scorecard {
  const dated = posts.filter((p) => Number.isFinite(p.t) && p.t <= now);
  const thisWeek = dated.filter((p) => p.t > now - 7 * DAY);
  const lastWeek = dated.filter((p) => p.t > now - 14 * DAY && p.t <= now - 7 * DAY);

  // Streak by ISO week: a week still in progress doesn't break it.
  const weeks = new Set(dated.map((p) => isoWeekKey(new Date(p.t))));
  const oldest = dated.length ? isoWeekKey(new Date(Math.min(...dated.map((p) => p.t)))) : null;
  let cursor = now;
  if (!weeks.has(isoWeekKey(new Date(cursor)))) cursor -= 7 * DAY;
  let streak = 0, reachedOldest = false;
  while (weeks.has(isoWeekKey(new Date(cursor)))) {
    streak++;
    if (isoWeekKey(new Date(cursor)) === oldest) { reachedOldest = true; break; }
    cursor -= 7 * DAY;
  }

  const base = dated.length >= MIN_SAMPLE ? median(dated.map((p) => p.interactions)) : null;
  const top = [...thisWeek].sort((a, b) => b.interactions - a.interactions)[0] ?? null;
  let best: Scorecard["best"] = null;
  if (top) {
    const title = firstLine(top.caption) || `Your ${top.format.toLowerCase()}`;
    const early = now - top.t < SETTLE_MS;
    best = {
      permalink: top.permalink,
      line: base && base > 0
        ? `Best this week: “${title}” at ${fmtMultiplier(top.interactions / base)} your median${early ? " so far" : ""}.`
        : `Best this week: “${title}” with ${top.interactions.toLocaleString("en-US")} interactions${early ? " so far" : ""}.`,
    };
  }

  const lines = [
    `You posted ${times(thisWeek.length)} on Instagram this week (${lastWeek.length} the week before).`,
    streak
      ? `${streak} week${streak === 1 ? "" : "s"} in a row with at least one post${reachedOldest ? ", as far back as SOCIA's synced posts go" : ""}.`
      : "No post in the last two weeks: one post this week starts a new streak.",
    ...(best ? [best.line] : []),
    ...(planLine ? [`This week's Content Plan: ${planLine}`] : []),
  ];
  return { thisWeek: thisWeek.length, lastWeek: lastWeek.length, streak: { weeks: streak, atLeast: reachedOldest }, best, plan: planLine, lines };
}
