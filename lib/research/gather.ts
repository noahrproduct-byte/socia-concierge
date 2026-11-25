// Runs the research a request's SourcePlan asks for (lib/research/intent.ts)
// and returns it as evidence for the model plus the real examples the answer
// may show. Server only. Each source is best-effort inside a time budget; a
// source that can't run says so in `notes`, which reach both the model and
// the person, so an answer never implies research that didn't happen.

import { channelAverages, researchVideos, videoById, youtubeVideoId, ytConfigured } from "@/lib/youtube";
import { nicheReadFor } from "@/lib/intel/profileLoad";
import { trendsEvidence } from "@/lib/trendSignals";
import { exampleLine, rankExamples, type ResearchExample } from "./examples";
import { linkIn, type ResearchIntent, type SourcePlan } from "./intent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export type ResearchReference = { url: string; platform: string; title: string | null; creator: string | null; views: number | null; durationSec: number | null; readable: boolean; note: string };

export type Research = {
  /** evidence blocks for the answering model */
  evidence: string;
  /** every example the model may cite, by ref */
  examples: ResearchExample[];
  /** what was searched and what couldn't be, in plain words */
  notes: string[];
  reference: ResearchReference | null;
};

const BUDGET_MS = 9000;
const within = <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => { t = setTimeout(() => r(fallback), BUDGET_MS); })]).finally(() => clearTimeout(t));
};

// The same search within a few hours reuses its result: each search costs 100
// of the shared daily YouTube quota.
const CACHE_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; v: ResearchExample[] }>();

/** Long-form when the request says so; short vertical video otherwise (Reels, Shorts, TikTok). */
export const wantsShort = (i: Pick<ResearchIntent, "format" | "platform">): boolean =>
  !/\b(long|youtube video|full video|podcast|vlog|webinar)\b/i.test(`${i.format} ${i.platform}`);

export async function youtubeExamples(query: string, short: boolean, days: number): Promise<ResearchExample[]> {
  const key = `${query}|${short}|${days}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  const vids = await researchVideos(query, { short, days });
  const avg = await channelAverages(vids.map((v) => v.channelId)).catch(() => new Map<string, number>());
  const v: ResearchExample[] = vids.map((x) => {
    const usual = avg.get(x.channelId);
    return {
      ref: "", source: "youtube", platform: "youtube", url: x.url, title: x.title, creator: x.channelTitle, thumb: x.thumb,
      views: x.views, likes: x.likes, comments: x.comments, durationSec: x.durationSec, publishedAt: x.publishedAt || null,
      vsUsual: usual && x.views != null ? Math.round((x.views / usual) * 10) / 10 : null,
      usualBasis: usual ? "this channel's average views per video" : null,
      foundBy: `YouTube search "${query}"`,
    };
  });
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return v;
}

async function reference(url: string): Promise<ResearchReference> {
  const yt = youtubeVideoId(url);
  if (yt && ytConfigured()) {
    const v = await videoById(yt).catch(() => null);
    if (v) return { url, platform: "youtube", title: v.title, creator: v.channelTitle, views: v.views, durationSec: v.durationSec, readable: true, note: `SOCIA read this video's public details from YouTube (title, description, tags, length, numbers). It did not watch the video itself.${v.description ? ` Description: "${v.description.slice(0, 400)}"` : ""}${v.tags.length ? ` Tags: ${v.tags.join(", ")}.` : ""}` };
  }
  const platform = /instagram/i.test(url) ? "instagram" : /tiktok/i.test(url) ? "tiktok" : "youtube";
  return {
    url, platform, title: null, creator: null, views: null, durationSec: null, readable: false,
    note: platform === "youtube"
      ? "SOCIA couldn't read this YouTube link."
      : `SOCIA can't open ${platform === "instagram" ? "Instagram" : "TikTok"} videos from a link, so it hasn't seen this one. To work from the video itself, upload it in Content Studio (Rate) or describe what happens in it.`,
  };
}

export async function gatherResearch(opts: {
  client: Supa; ownerId: string; scopeId: string | null; question: string; intent: ResearchIntent; plan: SourcePlan;
  location?: string | null; now?: Date;
  /** links already shown in this chat's gallery ("show different examples") */
  exclude?: string[];
}): Promise<Research> {
  const { intent, plan } = opts;
  const now = opts.now ?? new Date();
  const notes: string[] = [];
  const blocks: string[] = [];
  const short = wantsShort(intent);
  const days = intent.kind === "niche_research" ? 180 : 365;

  const ytOn = plan.external && intent.queries.length > 0 && ytConfigured();
  const link = plan.reference ? linkIn(opts.question) : null;
  const [yt, niche, ref] = await Promise.all([
    ytOn ? within(Promise.all(intent.queries.slice(0, 2).map((q) => youtubeExamples(q, short, days))).then((r) => r.flat()), [] as ResearchExample[]) : Promise.resolve([] as ResearchExample[]),
    plan.niche ? within(nicheReadFor(opts.client, opts.ownerId, opts.scopeId, { need: "saved", location: opts.location ?? null, now }), null) : Promise.resolve(null),
    link ? within(reference(link), null) : Promise.resolve(null),
  ]);

  if (plan.external) {
    if (!ytConfigured()) notes.push("Public video search isn't set up on this site, so no outside examples were looked up.");
    else if (!intent.queries.length) notes.push("No outside search fitted this request.");
    else notes.push(`Searched YouTube for ${intent.queries.map((q) => `"${q}"`).join(" and ")} (${short ? "short videos" : "videos"} from the last ${days === 365 ? "12" : "6"} months): ${yt.length ? `${yt.length} found` : "nothing came back"}.`);
  }
  const nicheEx: ResearchExample[] = (niche?.proven ?? []).map((r) => ({
    ref: "", source: "niche", platform: (["instagram", "youtube", "tiktok", "facebook"].includes(r.platform) ? r.platform : "instagram") as ResearchExample["platform"],
    url: r.url, title: r.title ?? r.line ?? "(no caption)", creator: r.accountHandle ? `@${r.accountHandle}` : r.accountName, thumb: r.thumb,
    views: r.views, likes: r.likes, comments: r.comments, durationSec: null, publishedAt: r.publishedAt,
    vsUsual: r.multiplier, usualBasis: r.multiplier != null ? `the account's median ${r.basis}` : null, foundBy: "Accounts SOCIA reads in your niche (Discover)",
  }));
  if (plan.niche) notes.push(nicheEx.length ? `Used ${nicheEx.length} recent Reels from accounts SOCIA reads in your niche.` : "SOCIA holds no recent niche Reels for this brand yet (Discover fills them).");
  if (plan.external || plan.niche) notes.push("Instagram and TikTok have no public search, so examples from them come only from accounts SOCIA already reads.");

  const topic = [intent.topic, intent.format, intent.goal].filter(Boolean).join(" ");
  const seen = new Set((opts.exclude ?? []).map((u) => u.replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/$/, "").toLowerCase()));
  const fresh = [...yt, ...nicheEx].filter((x) => !seen.has(x.url.replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/$/, "").toLowerCase()));
  if (seen.size && !fresh.length) notes.push("Every comparable video SOCIA found was already shown.");
  // More candidates than the gallery shows, so the answer can pick four in different styles.
  const examples = rankExamples(fresh, { topic, now, freshDays: days, shortOnly: short, max: 10 });
  if (examples.length) {
    blocks.push(`# Comparable public videos SOCIA found for this request (real videos with the numbers their platform publishes; cite them only by [R#]; SOCIA read their titles and numbers, it did not watch them)\n${examples.map(exampleLine).join("\n")}`);
  } else if (plan.external || plan.niche) {
    blocks.push(`# Comparable public videos\nNone were found for this request. Say so plainly; never describe an example video.`);
  }
  if (niche && plan.niche) {
    const t = trendsEvidence(niche.signals);
    if (t) blocks.push(`# Hooks and topics leading in the brand's niche (SOCIA's grouping of other accounts' recent Reels)\n${t}`);
  }
  if (ref) {
    blocks.push(`# The video the user linked\n${ref.url}\n${ref.readable ? `${ref.platform}: "${ref.title}" by ${ref.creator}, ${ref.durationSec ?? "?"}s, ${ref.views?.toLocaleString("en-US") ?? "views not published"} views.` : "Not readable."} ${ref.note}`);
    notes.push(ref.readable ? "Read the linked video's public details (not the video itself)." : ref.note);
  }
  return { evidence: blocks.join("\n\n"), examples, notes, reference: ref };
}
