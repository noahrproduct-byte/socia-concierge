// How much of an account's own history SOCIA can learn from. Not the
// account's age or follower count: the posts it can actually measure (a
// number the platform publishes, a couple of days settled, in the last six
// months) and whether there are enough of one format to compare.
//
//   starting     too little to read: the strategy rests on the person's goals,
//                their niche and a set of experiments
//   learning     some history: experiments keep running and the account's own
//                results count for more with each measured post
//   established  enough to rely on the account's own results first
//
// ownWeight (0 to 1) is the share the account's own results get against goals
// and niche research. It rises gradually with every measured post, so the
// starter strategy is never swapped out in one go. Thresholds are in
// READINESS (overridable from the environment, see readinessThresholds).
// Pure and browser-safe.

export type ReadinessPost = { date: string | null; format: string; metric: { value: number } | null };

export type Thresholds = {
  /** Measured posts below which the account is "starting". */
  startUnder: number;
  /** Measured posts at which the account's own results lead ("established"), with formatsAt. */
  fullAt: number;
  /** Posts of one format needed to compare it. */
  perFormat: number;
  /** Formats with perFormat posts needed to be "established". */
  formatsAt: number;
  /** Days a post needs before its numbers count. */
  settleDays: number;
  /** How far back posts count. */
  windowDays: number;
};

export const READINESS: Thresholds = { startUnder: 8, fullAt: 30, perFormat: 3, formatsAt: 2, settleDays: 2, windowDays: 180 };

/** The thresholds, with any set in the environment (READINESS_START_UNDER, READINESS_FULL_AT) taking their place. */
export function readinessThresholds(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): Thresholds {
  const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : d; };
  const startUnder = num(env.READINESS_START_UNDER, READINESS.startUnder);
  return { ...READINESS, startUnder, fullAt: Math.max(startUnder + 1, num(env.READINESS_FULL_AT, READINESS.fullAt)) };
}

export type Stage = "starting" | "learning" | "established";

export type Readiness = {
  stage: Stage;
  /** Posts with a settled number SOCIA can read, in the window. */
  measured: number;
  /** Formats with enough posts to compare. */
  comparableFormats: string[];
  /** Share of the strategy that rests on the account's own results, 0 to 1 in steps of 0.05. */
  ownWeight: number;
  /** Measured posts still needed to reach the next stage; 0 when established. */
  toNext: number;
  /** Why, in plain lines. */
  reasons: string[];
  thresholds: Thresholds;
};

const step = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 20) / 20;

export function readinessOf(posts: ReadinessPost[], now: Date, t: Thresholds = READINESS): Readiness {
  const lo = now.getTime() - t.windowDays * 86_400_000;
  const hi = now.getTime() - t.settleDays * 86_400_000;
  const measuredPosts = posts.filter((p) => {
    if (!p.metric || !Number.isFinite(p.metric.value)) return false;
    const d = p.date ? Date.parse(p.date) : NaN;
    return Number.isFinite(d) && d >= lo && d <= hi;
  });
  const measured = measuredPosts.length;
  const byFormat = new Map<string, number>();
  for (const p of measuredPosts) byFormat.set(p.format, (byFormat.get(p.format) ?? 0) + 1);
  const comparableFormats = [...byFormat].filter(([, n]) => n >= t.perFormat).map(([f]) => f).sort();

  let stage: Stage;
  if (measured < t.startUnder || comparableFormats.length < 1) stage = "starting";
  else if (measured >= t.fullAt && comparableFormats.length >= t.formatsAt) stage = "established";
  else stage = "learning";

  // Rises with each measured post: up to 0.2 while starting, 0.2 to 0.8 while learning, 0.8 to 1 once established.
  const span = t.fullAt - t.startUnder;
  const ownWeight = stage === "starting"
    ? step((Math.min(measured, t.startUnder) / t.startUnder) * 0.2)
    : stage === "learning"
      ? step(0.2 + 0.6 * Math.min(1, (measured - t.startUnder) / span))
      : step(0.8 + 0.2 * Math.min(1, (measured - t.fullAt) / span));

  const toNext = stage === "starting" ? Math.max(0, t.startUnder - measured) : stage === "learning" ? Math.max(0, t.fullAt - measured) : 0;
  const reasons = [
    `${measured} ${measured === 1 ? "post" : "posts"} with numbers SOCIA can read from the last ${Math.round(t.windowDays / 30)} months (posts count after ${t.settleDays} days).`,
    comparableFormats.length
      ? `Enough posts to compare: ${comparableFormats.join(", ")}.`
      : `No format has ${t.perFormat} measured posts yet, so formats can't be compared.`,
    stage === "starting" ? `${toNext} more measured ${toNext === 1 ? "post" : "posts"} before SOCIA starts learning from your own results.`
      : stage === "learning" ? `Your own results count for ${Math.round(ownWeight * 100)}% of the strategy and rise with every post; ${toNext} more to lead with them.`
      : "Your own results lead the strategy.",
  ];
  return { stage, measured, comparableFormats, ownWeight, toNext, reasons, thresholds: t };
}

/** For the plan writer, the strategist and Ask SOCIA: how much to lean on the account's own results. */
export function readinessLines(r: Readiness): string {
  const own = Math.round(r.ownWeight * 100);
  const head = r.stage === "starting"
    ? `The account is still building its history (${r.measured} measured posts). Its own results are too few to show what works: build on the person's goals, their niche and the experiments, and treat any pattern in their own posts as a hint, not evidence.`
    : r.stage === "learning"
      ? `The account has some history (${r.measured} measured posts). Weigh its own results at about ${own}% against the niche and the goals, keep the experiments running, and say how many posts a pattern rests on.`
      : `The account has enough history (${r.measured} measured posts): lead with its own results, then competitors and the niche.`;
  return `${head}\n${r.reasons.map((x) => `- ${x}`).join("\n")}`;
}

/** The SIO line for a starting account (Noah's words, without the dash). */
export const STARTER_MESSAGE = "Your account is still building its history. That's okay. We can create a strategy around your goals and learn what works as you grow.";
