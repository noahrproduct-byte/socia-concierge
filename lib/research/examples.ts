// Comparable public videos for one request, with the numbers the platform
// publishes. Every example is a real video an official API returned or one
// SOCIA already holds from Discover; none is written by the model. The model
// picks from them by [R#] and says why each is comparable; the server fills
// the link, the creator and every number from here.
//
// Sources, in order of what they can prove:
//   youtube   YouTube Data API search (views, likes, comments, length, date,
//             and the channel's own average per video to compare against)
//   niche     Reels SOCIA read from competitors and niche accounts on
//             Instagram (Business Discovery) and YouTube, with each one's
//             multiple of its creator's usual (lib/trendSignals.ts)
// Instagram and TikTok have no public search API, so a topic search can't
// reach them; that limit is said in the answer, never papered over.

export type ExampleSource = "youtube" | "niche";

export type ResearchExample = {
  ref: string;
  source: ExampleSource;
  platform: "youtube" | "instagram" | "tiktok" | "facebook";
  url: string;
  title: string;
  creator: string;
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  publishedAt: string | null;
  /** views against the creator's own usual, when SOCIA can work it out */
  vsUsual: number | null;
  /** how that multiple was measured, said next to it */
  usualBasis: string | null;
  /** the search or niche read that found it */
  foundBy: string;
};

const WORD = /[a-z0-9]+/g;
const STOP = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "my", "your", "with", "how", "i", "you", "is", "it", "this", "that", "shorts", "short", "reel", "reels", "video", "videos"]);
export const words = (s: string): string[] => (s.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 2 && !STOP.has(w));

/** Share of the request's words that appear in the example's title (0 to 1). */
export function topicMatch(title: string, topicWords: string[]): number {
  if (!topicWords.length) return 0;
  const t = new Set(words(title));
  const hit = topicWords.filter((w) => t.has(w) || [...t].some((x) => x.startsWith(w.slice(0, 5)) && w.length >= 5)).length;
  return hit / topicWords.length;
}

/** Days since a date; null when unknown. */
const ageDays = (iso: string | null, now: Date): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 86_400_000) : null;
};

/**
 * Rank, filter and de-duplicate examples for a request:
 * - only videos inside the freshness window (unknown dates stay, ranked lower)
 * - short videos only when the request is short-form
 * - one video per creator, no repeated links
 * - ranked by how well the title matches the request, how far it beat its
 *   creator's usual (log scale, so one freak video doesn't win on its own),
 *   and how recent it is.
 */
export function rankExamples(xs: ResearchExample[], opts: { topic: string; now: Date; freshDays: number; shortOnly: boolean; max: number }): ResearchExample[] {
  const topicWords = [...new Set(words(opts.topic))];
  const seenUrl = new Set<string>();
  const seenCreator = new Set<string>();
  const scored = xs
    .filter((x) => x.url && x.title)
    .filter((x) => { const a = ageDays(x.publishedAt, opts.now); return a == null || a <= opts.freshDays; })
    .filter((x) => !opts.shortOnly || x.durationSec == null || x.durationSec <= 180)
    .map((x) => {
      const age = ageDays(x.publishedAt, opts.now);
      const lift = x.vsUsual != null && x.vsUsual > 0 ? Math.log2(Math.max(0.25, Math.min(64, x.vsUsual))) / 6 : 0;
      const fresh = age == null ? 0 : 1 - Math.min(1, age / opts.freshDays);
      const score = topicMatch(x.title, topicWords) * 2 + lift + fresh * 0.5 + (x.views != null ? Math.min(1, Math.log10(Math.max(1, x.views)) / 7) * 0.3 : 0);
      return { x, score };
    })
    .sort((a, b) => b.score - a.score);
  const out: ResearchExample[] = [];
  for (const { x } of scored) {
    const u = x.url.replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/$/, "").toLowerCase();
    const c = `${x.platform}:${x.creator.toLowerCase()}`;
    if (seenUrl.has(u) || seenCreator.has(c)) continue;
    seenUrl.add(u); seenCreator.add(c);
    out.push(x);
    if (out.length >= opts.max) break;
  }
  return out.map((x, i) => ({ ...x, ref: `R${i + 1}` }));
}

const fmt = (v: number | null) => (v == null ? "not published" : v.toLocaleString("en-US"));

/** One example as a line of evidence, numbers exactly as read. */
export function exampleLine(x: ResearchExample): string {
  const len = x.durationSec != null ? `${x.durationSec}s` : "length unknown";
  const usual = x.vsUsual != null ? `, ${x.vsUsual.toFixed(1)}× ${x.usualBasis ?? "the creator's usual"}` : "";
  return `[${x.ref}] ${x.platform} · ${x.creator} · "${x.title.slice(0, 110)}" · ${len} · ${x.publishedAt ? x.publishedAt.slice(0, 10) : "date unknown"} · views ${fmt(x.views)}, likes ${fmt(x.likes)}, comments ${fmt(x.comments)}${usual} · found by: ${x.foundBy}`;
}
