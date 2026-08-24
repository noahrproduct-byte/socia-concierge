// SOCIA Content Score — a CALCULATED score, not an AI guess and not a
// platform metric. Every dimension is measurable from data Instagram
// actually returns; anything unmeasurable (hook strength, watch-through
// retention, originality) is deliberately absent rather than invented.
//
// Dimensions (each 0-100, then weighted):
//   Engagement  35%  engagement rate vs a healthy 1% benchmark, capped
//   Consistency 25%  posting cadence vs a 3/week target
//   Reach       20%  daily reach vs follower base (only when reach exists)
//   Timing      10%  share of posts published inside the best window
//   Captions    10%  share of posts carrying a caption
//
// Weights renormalize over the dimensions that could actually be measured,
// so a missing input never silently scores zero.

import { engagementOf, median, type PostLike } from "./metrics";
import { bestWindow } from "./bestTime";

export type ScoreDim = {
  label: string;
  value: number;
  weight: number;
  method: string;
};

export type ContentScore = {
  score: number;
  verdict: string;
  dims: ScoreDim[];
  sampleSize: number;
  method: string;
};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function computeContentScore(
  posts: PostLike[],
  followers: number | null,
  dailyReach: number[],
  windowDays = 30,
): ContentScore | null {
  const dated = posts.filter((p) => p.timestamp);
  if (dated.length < 5 || !followers || followers <= 0) return null;

  const dims: ScoreDim[] = [];

  // Engagement: median engagement ÷ followers, scored against a 1% benchmark.
  const medEng = median(posts.map(engagementOf));
  if (medEng != null) {
    const rate = (medEng / followers) * 100;
    dims.push({
      label: "Engagement",
      value: clamp((rate / 1) * 70),
      weight: 35,
      method: `median engagement ${Math.round(medEng)} ÷ ${followers} followers = ${rate.toFixed(2)}% (70 pts at the 1% benchmark)`,
    });
  }

  // Consistency: posts per week over the window vs a 3/week target.
  const since = Date.now() - windowDays * 86400000;
  const recent = dated.filter((p) => new Date(p.timestamp!).getTime() >= since).length;
  const perWeek = (recent / windowDays) * 7;
  dims.push({
    label: "Consistency",
    value: clamp((perWeek / 3) * 100),
    weight: 25,
    method: `${recent} posts in ${windowDays} days = ${perWeek.toFixed(1)}/week (100 pts at 3/week)`,
  });

  // Reach efficiency: average daily reach ÷ followers (10% of base = 100).
  if (dailyReach.length >= 3) {
    const avgReach = dailyReach.reduce((a, b) => a + b, 0) / dailyReach.length;
    const ratio = (avgReach / followers) * 100;
    dims.push({
      label: "Reach",
      value: clamp((ratio / 10) * 100),
      weight: 20,
      method: `avg daily reach ${Math.round(avgReach)} ÷ ${followers} followers = ${ratio.toFixed(1)}% (100 pts at 10%)`,
    });
  }

  // Timing: share of posts landing on the best-performing weekday.
  const win = bestWindow(
    dated.map((p) => ({ t: p.timestamp!, e: engagementOf(p) })),
    5,
  );
  if (win) {
    const onDay = dated.filter((p) => new Date(p.timestamp!).getDay() === win.day).length;
    dims.push({
      label: "Timing",
      value: clamp((onDay / dated.length) * 300),
      weight: 10,
      method: `${onDay}/${dated.length} posts on ${win.short.split(" ")[0]}, your strongest weekday`,
    });
  }

  // Captions: share of posts with any caption text.
  const captioned = posts.filter((p) => (p.caption ?? "").trim().length > 0).length;
  dims.push({
    label: "Captions",
    value: clamp((captioned / posts.length) * 100),
    weight: 10,
    method: `${captioned}/${posts.length} posts have captions`,
  });

  const totalWeight = dims.reduce((s, d) => s + d.weight, 0);
  const score = clamp(dims.reduce((s, d) => s + d.value * d.weight, 0) / totalWeight);
  const verdict =
    score >= 85 ? "Excellent" : score >= 70 ? "Strong" : score >= 55 ? "Solid" : score >= 40 ? "Building" : "Early";

  return {
    score,
    verdict,
    dims,
    sampleSize: posts.length,
    method: `weighted average of ${dims.length} measured dimensions (weights renormalized over what your data supports)`,
  };
}
