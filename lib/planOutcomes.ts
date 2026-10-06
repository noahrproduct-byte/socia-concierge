// What became of a Content Plan: for each planned post, whether it was put on
// the Calendar, scheduled, published, and how it did against the account's own
// median. Pure functions over rows SOCIA already stores, plus one loader that
// gathers those rows. This is the "did it work?" half of the loop; the next
// plan reads these outcomes as evidence.
import type { Deliverable } from "./schema";
import type { ScheduledPost } from "./scheduling";
import { weekdayIndex } from "./scheduling";
import type { Platform } from "./publishing/types";
import { measureDestination, resultLine, type MeasureSources, type ResultLine } from "./postResults";

export type ItemState = "unscheduled" | "draft" | "scheduled" | "publishing" | "published" | "failed";

export type DestinationLite = {
  postId: string;
  platform: Platform;
  status: string;
  externalPostId: string | null;
  publishedAt: string | null;
  permalink: string | null;
};

export type ItemOutcome = {
  index: number;
  day: string;
  concept: string;
  format: string;
  predicted: string;
  state: ItemState;
  postId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  permalink: string | null;
  /** Per published destination, the measurement (empty until something is published). */
  results: Array<ResultLine & { platform: Platform }>;
  /** The headline result: the best measured multiplier, else the first measured line, else null. */
  result: (ResultLine & { platform: Platform }) | null;
};

export type PlanOutcome = {
  planId: string;
  createdAt: string;
  items: ItemOutcome[];
  summary: {
    total: number;
    onCalendar: number;
    published: number;
    measured: number;
    /** Days whose item never made it to the Calendar. */
    skipped: string[];
    best: ItemOutcome | null;
    /** One line for the dashboard / history list, or null when nothing has happened yet. */
    line: string | null;
  };
};

const isLive = (p: Pick<ScheduledPost, "status">) => p.status !== "cancelled";

/** The post created for a plan item: same plan, same day (free-text day matched by weekday, else exact). */
function postForItem(item: { day: string }, posts: ScheduledPost[]): ScheduledPost | null {
  const want = item.day.trim().toLowerCase();
  const wd = weekdayIndex(item.day);
  const matches = posts.filter((p) => {
    const have = (p.plan_day ?? "").trim().toLowerCase();
    if (!have) return false;
    if (have === want) return true;
    const pw = weekdayIndex(p.plan_day);
    return wd != null && pw != null && pw === wd;
  });
  // Newest decision wins: a re-scheduled day replaces the earlier draft.
  return matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

function stateOf(post: ScheduledPost, dests: DestinationLite[]): ItemState {
  const live = dests.filter((d) => d.status !== "cancelled");
  if (live.length) {
    if (live.some((d) => d.status === "uploading" || d.status === "processing")) return "publishing";
    if (live.every((d) => d.status === "published")) return "published";
    if (live.some((d) => d.status === "published")) return "published"; // partly published counts as out
    if (live.some((d) => d.status === "failed")) return "failed";
    if (live.some((d) => d.status === "scheduled" || d.status === "ready")) return "scheduled";
    return "draft";
  }
  if (post.status === "published") return "published";
  if (post.status === "publishing") return "publishing";
  if (post.status === "failed") return "failed";
  if (post.status === "scheduled") return "scheduled";
  return "draft";
}

/** Published destinations of a post; a legacy Instagram row (no destination rows) counts as one. */
function publishedDestinations(post: ScheduledPost, dests: DestinationLite[]): DestinationLite[] {
  const out = dests.filter((d) => d.status === "published" && d.externalPostId);
  if (!out.length && post.status === "published" && post.published_media_id) {
    out.push({ postId: post.id, platform: "instagram", status: "published", externalPostId: post.published_media_id, publishedAt: post.updated_at, permalink: post.permalink });
  }
  return out;
}

export function buildPlanOutcome(
  plan: { id: string; data: Deliverable; created_at: string },
  posts: ScheduledPost[],
  destinations: DestinationLite[],
  sources: MeasureSources,
  now: Date = new Date(),
): PlanOutcome {
  const livePosts = posts.filter((p) => p.plan_id === plan.id && isLive(p));
  const byPost = new Map<string, DestinationLite[]>();
  for (const d of destinations) byPost.set(d.postId, [...(byPost.get(d.postId) ?? []), d]);

  const items: ItemOutcome[] = (plan.data.weeklyPlan ?? []).map((it, index) => {
    const post = postForItem(it, livePosts);
    const base = { index, day: it.day, concept: it.concept, format: it.format, predicted: it.predictedPerformance ?? "" };
    if (!post) return { ...base, state: "unscheduled" as const, postId: null, scheduledAt: null, publishedAt: null, permalink: null, results: [], result: null };
    const dests = byPost.get(post.id) ?? [];
    const state = stateOf(post, dests);
    const published = publishedDestinations(post, dests);
    const results = published.map((d) => ({ platform: d.platform, ...resultLine(measureDestination(d.platform, d.externalPostId!, sources), d.publishedAt, now) }));
    const measured = results.filter((r) => r.measured);
    const best = measured.filter((r) => r.multiplier != null).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0] ?? measured[0] ?? results[0] ?? null;
    const publishedAt = published.map((d) => d.publishedAt).filter((x): x is string => Boolean(x)).sort()[0] ?? (post.status === "published" ? post.updated_at : null);
    return { ...base, state, postId: post.id, scheduledAt: post.scheduled_at, publishedAt, permalink: published.find((d) => d.permalink)?.permalink ?? post.permalink, results, result: best };
  });

  const onCalendar = items.filter((i) => i.state !== "unscheduled").length;
  const publishedItems = items.filter((i) => i.state === "published");
  const measuredItems = publishedItems.filter((i) => i.result?.measured);
  const best = measuredItems.filter((i) => i.result?.multiplier != null).sort((a, b) => (b.result!.multiplier ?? 0) - (a.result!.multiplier ?? 0))[0] ?? null;
  const skipped = items.filter((i) => i.state === "unscheduled").map((i) => i.day);
  const total = items.length;

  let line: string | null = null;
  if (total && onCalendar) {
    const parts = [`${publishedItems.length} of ${total} posted`];
    if (best?.result?.multiplier != null) parts.push(`best: ${best.day} at ${best.result.short.replace(" your median", "")} your median`);
    else if (publishedItems.length && !measuredItems.length) parts.push("results still arriving");
    if (skipped.length && skipped.length < total) parts.push(`${skipped.length} skipped`);
    line = parts.join(" · ");
  }

  return { planId: plan.id, createdAt: plan.created_at, items, summary: { total, onCalendar, published: publishedItems.length, measured: measuredItems.length, skipped, best, line } };
}

/** The compact shape sent with the plans list (history) and the dashboard. */
export type PlanOutcomeSummary = PlanOutcome["summary"] & { planId: string };
export const summaryOf = (o: PlanOutcome): PlanOutcomeSummary => ({ planId: o.planId, ...o.summary });
