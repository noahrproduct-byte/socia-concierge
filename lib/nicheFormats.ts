// Winning formats: repeatable content structures across real niche examples.
//
// Two halves that never mix:
//   observed   the examples (public posts SOCIA read through YouTube's API or
//              Instagram Business Discovery), their published numbers, and
//              each one's result against its own creator's median
//   grouping   which examples share a structure, and how to make one: written
//              by the model from the titles and captions, then checked here
//              against the examples it cites
// A format is kept only with FORMAT_MIN_EXAMPLES examples from at least
// FORMAT_MIN_ACCOUNTS accounts, and its numbers are recomputed here from the
// examples, never taken from the model. Browser-safe: no SDK imports.

import { confidenceFor, type InsightDraft } from "./intel/insight";

export const FORMAT_MIN_EXAMPLES = 3;
export const FORMAT_MIN_ACCOUNTS = 2;
/** A format "leads" when its examples' median result is at least this many times their creators' own medians. */
export const FORMAT_LEADS_AT = 1.3;
const MAX_EXAMPLES = 60;
const MAX_AGE_DAYS = 180;

export type FormatExample = {
  /** Position in the list sent to the model. */
  id: number;
  url: string;
  platform: "youtube" | "instagram";
  account: string;
  title: string;
  thumb: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  /** The post's result over its creator's own median (views on YouTube, likes plus comments on Instagram); null without a baseline. */
  multiplier: number | null;
};

export type NicheFormat = {
  name: string;
  summary: string;
  steps: string[];
  hooks: string[];
  filming: string[];
  /** The model's suggestion; shown only when the examples' real lengths aren't known. */
  lengthSuggestion: string | null;
  adaptations: string[];
  examples: FormatExample[];
  stats: {
    examples: number;
    accounts: number;
    /** Examples with a creator baseline, and how many of those beat it. */
    withBaseline: number;
    aboveBaseline: number;
    medianMultiplier: number | null;
    /** Real lengths of the YouTube examples, seconds. */
    length: { min: number; median: number; max: number; n: number } | null;
  };
  leads: boolean;
};

export type FormatsDoc = {
  v: 1;
  builtAt: string;
  /** The research run the examples came from; a newer run makes this stale. */
  runAt: string | null;
  examplesRead: number;
  fromYouTube: number;
  fromInstagram: number;
  formats: NicheFormat[];
  /** Examples that fit no kept format. */
  unassigned: number;
};

export const formatsKey = (scopeId: string) => `formats:${scopeId}`;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

type ContentRow = {
  content_url?: unknown; platform?: unknown; account_name?: unknown; account_handle?: unknown; title?: unknown; thumbnail_url?: unknown;
  views?: unknown; likes?: unknown; comments?: unknown; published_at?: unknown; multiplier?: unknown; data_source?: unknown;
};
type IgAccount = { handle: string; found: boolean; media?: { permalink: string | null; caption: string | null; thumbnail: string | null; likes: number | null; comments: number | null; timestamp: string | null }[] };

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The examples worth grouping: YouTube results with published numbers, and
 * Instagram posts read through Business Discovery, from the last six months,
 * never the brand's own accounts. Instagram posts get a baseline only when
 * the account has at least five posts with numbers.
 */
export function examplesFrom(input: {
  content: ContentRow[];
  instagram: IgAccount[];
  durations?: Map<string, number>;
  now: Date;
  isOwn?: (handle: string) => boolean;
}): FormatExample[] {
  const since = input.now.getTime() - MAX_AGE_DAYS * 86_400_000;
  const recent = (iso: string | null) => !iso || Date.parse(iso) >= since;
  const own = input.isOwn ?? (() => false);
  const out: Omit<FormatExample, "id">[] = [];
  const seen = new Set<string>();

  for (const r of input.content) {
    const url = str(r.content_url), title = str(r.title), account = str(r.account_name) ?? str(r.account_handle);
    if (r.platform !== "youtube" || r.data_source !== "youtube_api" || !url || !title || !account) continue;
    const views = num(r.views);
    if (views == null || seen.has(url) || own(account) || !recent(str(r.published_at))) continue;
    seen.add(url);
    const vid = /(?:watch\?v=|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,15})/.exec(url)?.[1];
    out.push({
      url, platform: "youtube", account, title: title.slice(0, 200), thumb: str(r.thumbnail_url), publishedAt: str(r.published_at),
      views, likes: num(r.likes), comments: num(r.comments), durationSec: vid ? input.durations?.get(vid) ?? null : null,
      multiplier: num(r.multiplier) != null ? r1(num(r.multiplier)!) : null,
    });
  }

  for (const a of input.instagram) {
    if (!a.found || own(a.handle)) continue;
    const posts = (a.media ?? []).filter((m) => m.likes != null || m.comments != null);
    const base = posts.length >= 5 ? median(posts.map((m) => (m.likes ?? 0) + (m.comments ?? 0))) : null;
    for (const m of posts) {
      const title = str(m.caption);
      if (!m.permalink || !title || seen.has(m.permalink) || !recent(m.timestamp)) continue;
      seen.add(m.permalink);
      const total = (m.likes ?? 0) + (m.comments ?? 0);
      out.push({
        url: m.permalink, platform: "instagram", account: `@${a.handle}`, title: title.slice(0, 200), thumb: m.thumbnail, publishedAt: m.timestamp,
        views: null, likes: m.likes, comments: m.comments, durationSec: null,
        multiplier: base && base > 0 ? r1(total / base) : null,
      });
    }
  }

  return out
    .sort((x, y) => (Date.parse(y.publishedAt ?? "") || 0) - (Date.parse(x.publishedAt ?? "") || 0))
    .slice(0, MAX_EXAMPLES)
    .map((e, id) => ({ ...e, id }));
}

/** What the model returns for each format (lib/nicheFormatsLoad.ts formatsSchema). */
export type RawFormat = {
  name: string; summary: string; steps: string[]; hooks: string[]; filming: string[]; length: string; adaptations: string[]; example_ids: number[];
};

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\u2014/g, ",").slice(0, n) : "");
const clipList = (xs: unknown, n: number, each: number) => (Array.isArray(xs) ? xs.map((x) => clip(x, each)).filter(Boolean).slice(0, n) : []);

/**
 * Keep the model's groupings that the examples support, with numbers
 * recomputed from the examples. An example counts in one format only (the
 * first that claims it). Leading formats first, then by median result.
 */
export function buildFormats(raw: RawFormat[], examples: FormatExample[]): { formats: NicheFormat[]; unassigned: number } {
  const byId = new Map(examples.map((e) => [e.id, e]));
  const used = new Set<number>();
  const formats: NicheFormat[] = [];
  for (const f of raw) {
    const ex = [...new Set(Array.isArray(f.example_ids) ? f.example_ids : [])]
      .filter((id) => byId.has(id) && !used.has(id))
      .map((id) => byId.get(id)!);
    const accounts = new Set(ex.map((e) => e.account.toLowerCase()));
    const name = clip(f.name, 60);
    if (!name || ex.length < FORMAT_MIN_EXAMPLES || accounts.size < FORMAT_MIN_ACCOUNTS) continue;
    ex.forEach((e) => used.add(e.id));
    const mults = ex.map((e) => e.multiplier).filter((m): m is number => m != null);
    const lengths = ex.map((e) => e.durationSec).filter((d): d is number => d != null);
    const med = median(mults);
    formats.push({
      name,
      summary: clip(f.summary, 300),
      steps: clipList(f.steps, 6, 160),
      hooks: clipList(f.hooks, 4, 160),
      filming: clipList(f.filming, 4, 160),
      lengthSuggestion: lengths.length ? null : clip(f.length, 80) || null,
      adaptations: clipList(f.adaptations, 3, 200),
      examples: [...ex].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1)),
      stats: {
        examples: ex.length,
        accounts: accounts.size,
        withBaseline: mults.length,
        aboveBaseline: mults.filter((m) => m > 1).length,
        medianMultiplier: med != null ? r1(med) : null,
        length: lengths.length ? { min: Math.min(...lengths), median: Math.round(median(lengths)!), max: Math.max(...lengths), n: lengths.length } : null,
      },
      // A lead needs a baseline on at least three of its examples.
      leads: med != null && mults.length >= FORMAT_MIN_EXAMPLES && med >= FORMAT_LEADS_AT,
    });
  }
  formats.sort((a, b) => Number(b.leads) - Number(a.leads) || (b.stats.medianMultiplier ?? -1) - (a.stats.medianMultiplier ?? -1));
  return { formats, unassigned: examples.length - used.size };
}

/** The basis line under a format: every number it states, and what it rests on. */
export function formatBasis(f: NicheFormat): string {
  const s = f.stats;
  const who = `${s.examples} examples from ${s.accounts} accounts`;
  if (s.medianMultiplier == null) return `${who}. None has a creator baseline, so SOCIA can't say how they did against their usual.`;
  return `${who}. Median ${s.medianMultiplier}x their creators' own median, from the ${s.withBaseline} with a baseline; ${s.aboveBaseline} of ${s.withBaseline} beat it.`;
}

/** A plan note for Add to plan / Copy brief: the format, its evidence and the person's own version. */
export function formatBrief(f: NicheFormat): string {
  const lines = [
    `Try the "${f.name}" format: ${f.summary}`,
    `Evidence: ${formatBasis(f)}`,
    f.steps.length ? `Structure: ${f.steps.join(" / ")}` : "",
    f.hooks.length ? `Hook ideas: ${f.hooks.join(" / ")}` : "",
    f.adaptations[0] ? `My version: ${f.adaptations[0]}` : "",
    "Make it original: adapt the structure, don't copy the video.",
  ];
  return lines.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Into the shared intelligence store (lib/intel), so Overview, Analytics,
// Plan and Ask SOCIA can use the formats that lead
// ---------------------------------------------------------------------------

export const FORMATS_PRODUCER = "niche_formats";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * One finding per leading format. Other accounts' results, so the
 * confidence is capped at a signal and the hypothesis says their audiences
 * aren't this account's.
 */
export function formatInsights(doc: FormatsDoc): InsightDraft[] {
  return doc.formats.filter((f) => f.leads).map((f) => ({
    fingerprint: `niche:format:${slug(f.name)}`,
    producer: FORMATS_PRODUCER,
    category: "niche" as const,
    platform: null,
    title: `"${f.name}" leads in your niche`,
    observation: formatBasis(f),
    metrics: [
      { label: "Median result", value: f.stats.medianMultiplier, unit: "multiple" as const, basis: `against each creator's own median, ${f.stats.withBaseline} examples with a baseline` },
      { label: "Examples", value: f.stats.examples, unit: "count" as const, basis: `from ${f.stats.accounts} accounts in your niche` },
    ],
    posts: f.examples.slice(0, 4).map((e) => ({ platform: e.platform, id: e.url, title: `${e.account}: ${e.title.slice(0, 80)}`, permalink: e.url })),
    periodStart: f.examples.map((e) => e.publishedAt).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
    periodEnd: doc.runAt,
    explanations: [
      { type: "interpretation" as const, text: `These posts share one structure: ${f.summary.charAt(0).toLowerCase()}${f.summary.slice(1)}` },
      { type: "hypothesis" as const, text: "It may work for your audience too. These are other accounts' results, and their audiences differ from yours: one post of your own is the test." },
    ],
    confidence: Math.min(60, confidenceFor(f.stats.withBaseline)),
    limitations: [
      "Other accounts' public posts, not yours.",
      "SOCIA grouped them by their titles and captions; it didn't watch the videos.",
      "Per-post numbers are lifetime totals, so older posts have had longer to collect them.",
    ],
    recommendation: {
      action: `Make one "${f.name}" post this week${f.steps.length ? `: ${f.steps.join(", then ").toLowerCase()}` : ""}.`,
      why: formatBasis(f),
      learning: "Whether the format works for your audience, measured against your own median.",
      href: "/discover",
    },
    source: { rule: `niche.format: >=${FORMAT_MIN_EXAMPLES} examples from >=${FORMAT_MIN_ACCOUNTS} accounts, median >=${FORMAT_LEADS_AT}x on >=${FORMAT_MIN_EXAMPLES} baselines`, data: [`${doc.examplesRead} posts from your niche read ${doc.builtAt.slice(0, 10)}`], retrievedAt: doc.builtAt },
  }));
}

/** Leading formats from the store, as evidence lines for the plan writer and Ask SOCIA. */
export function formatsEvidence(insights: { title: string; observation: string; explanations: { text: string }[]; recommendation: { action: string } | null }[]): string {
  if (!insights.length) return "";
  return insights.slice(0, 5).map((i) => `- ${i.title}. ${i.observation} ${i.explanations[0]?.text ?? ""} Suggested: ${i.recommendation?.action ?? ""}`).join("\n");
}
