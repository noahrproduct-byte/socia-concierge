// The niche playbook: what goes viral in a brand's niche, from the Reels the
// niche scan read and studied (lib/nicheScan/plan.ts). Two halves never mix:
//   observed   each Reel's published numbers and what the study saw on its
//              cover and in its caption (on-screen text only when it was
//              readable on the cover; marked seen or inferred)
//   patterns   what repeats: a format, a call to action or an on-screen text
//              is kept only when at least PATTERN_MIN_REELS Reels from at
//              least PATTERN_MIN_ACCOUNTS accounts show it, and its numbers
//              are recomputed here from those Reels, never taken from a model.
// Pure; browser-safe.

import type { InsightDraft } from "../intel/insight";
import { confidenceFor } from "../intel/insight";
import type { ScanReel } from "./plan";

export const PATTERN_MIN_REELS = 2;
export const PATTERN_MIN_ACCOUNTS = 2;

export const REEL_FORMATS = [
  "one_action", "process", "pov", "share_bait", "tag_a_friend", "experiment", "list", "reaction", "before_after",
  "talking", "behind_the_scenes", "taste_test", "comparison", "other",
] as const;
export type ReelFormat = (typeof REEL_FORMATS)[number];

export const FORMAT_LABEL: Record<ReelFormat, string> = {
  one_action: "one satisfying action shown whole",
  process: "the making, step by step",
  pov: "a point-of-view moment",
  share_bait: "a line that asks viewers to send it to someone",
  tag_a_friend: "a tag-a-friend prompt",
  experiment: "an experiment in rounds",
  list: "a list or ranking",
  reaction: "a reaction",
  before_after: "before and after",
  talking: "someone talking to camera",
  behind_the_scenes: "behind the scenes",
  taste_test: "a test or review",
  comparison: "a side-by-side comparison",
  other: "other",
};

export const CTA_KINDS = ["send_to", "tag", "comment_for", "follow", "visit", "save", "none"] as const;
export type CtaKind = (typeof CTA_KINDS)[number];
export const CTA_LABEL: Record<CtaKind, string> = {
  send_to: "send this to someone",
  tag: "tag a friend",
  comment_for: "comment a word for something",
  follow: "follow for more",
  visit: "come visit or order",
  save: "save this",
  none: "no ask",
};

/** What the study of one Reel found. */
export type WatchedReel = ScanReel & {
  format: ReelFormat;
  /** The words on screen, exactly as written on the cover; null when none was readable. */
  onScreenText: string | null;
  /** True when onScreenText was read on the cover; false when it came from the caption. */
  textSeen: boolean;
  hook: string | null;
  cta: { kind: CtaKind; text: string | null };
  /** How the text looks and how the shot is framed, from the cover; null when not visible. */
  textStyle: string | null;
  framing: string | null;
  /** What the study could read: the cover image and the caption, or the caption only. */
  read: "frames" | "cover" | "caption";
};

export type Evidence = { id: string; url: string; account: string; platform: string; multiplier: number | null; views: number | null; basis: string; publishedAt: string | null };

export type Pattern = {
  key: string;
  label: string;
  reels: number;
  accounts: number;
  /** Median of the Reels' results against their own accounts; null when none had a baseline. */
  medianMultiplier: number | null;
  evidence: Evidence[];
};

export type TextTemplate = { template: string; examples: string[]; reels: number; accounts: number; evidence: Evidence[] };

export type Playbook = {
  v: 1;
  niche: string | null;
  builtAt: string;
  scanned: { accounts: number; reels: number; studied: number; from: string | null; to: string | null };
  formats: Pattern[];
  ctas: Pattern[];
  texts: TextTemplate[];
  hooks: TextTemplate[];
  /** Formats that did badly for their own accounts. */
  avoid: Pattern[];
  /** Plain notes on what could not be read (a source that was down, a thin niche). */
  notes: string[];
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const accountKey = (r: { platform: string; handle: string | null; account: string }) => `${r.platform}:${(r.handle ?? r.account).toLowerCase()}`;

export const evidenceOf = (r: WatchedReel | ScanReel): Evidence => ({
  id: r.id, url: r.url, account: r.handle ? `@${r.handle.replace(/^@/, "")}` : r.account, platform: r.platform,
  multiplier: r.multiplier, views: r.views, basis: r.basis, publishedAt: r.publishedAt,
});

/** A group of Reels as a pattern, or null when it doesn't repeat across enough accounts. */
export function patternOf(key: string, label: string, reels: (WatchedReel | ScanReel)[]): Pattern | null {
  const accounts = new Set(reels.map(accountKey)).size;
  if (reels.length < PATTERN_MIN_REELS || accounts < PATTERN_MIN_ACCOUNTS) return null;
  const mult = reels.map((r) => r.multiplier).filter((m): m is number => m != null);
  const med = median(mult);
  return {
    key, label, reels: reels.length, accounts, medianMultiplier: med != null ? r1(med) : null,
    evidence: [...reels].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1)).slice(0, 5).map(evidenceOf),
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!k) continue;
    out.set(k, [...(out.get(k) ?? []), x]);
  }
  return out;
}

const byStrength = (a: Pattern, b: Pattern) => b.accounts - a.accounts || b.reels - a.reels || (b.medianMultiplier ?? 0) - (a.medianMultiplier ?? 0);

/** A model's proposed template with the Reels it says show it. */
export type RawTemplate = { template?: unknown; reel_ids?: unknown };

const EM_DASH = /—/g;
// Words that only carry a number ("161 million"): a template made of these and blanks is not a line anyone can reuse.
const NUMBER_WORDS = new Set(["million", "millions", "billion", "billions", "thousand", "thousands", "hundred", "k", "m", "percent", "x", "times", "dollars", "usd"]);

/** A template someone could write their own words into: at least one real word that isn't a number or a blank (2026-11-12 scan review). */
export function reusable(template: string): boolean {
  const words = template.toLowerCase().replace(/_+/g, " ").match(/\p{L}[\p{L}']*/gu) ?? [];
  return words.some((w) => w.length >= 2 && !NUMBER_WORDS.has(w));
}

/**
 * Keep a proposed text template only when the Reels it cites are real,
 * studied, carry words (on the cover or the caption's first line) and come
 * from at least PATTERN_MIN_ACCOUNTS accounts. Blanks are written "___".
 */
export function keepTemplates(raw: RawTemplate[], watched: WatchedReel[], kind: "text" | "hook", max = 6): TextTemplate[] {
  const byId = new Map(watched.map((w) => [w.id, w]));
  const out: TextTemplate[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t.template !== "string") continue;
    const template = t.template.replace(EM_DASH, ",").replace(/\s+/g, " ").trim().slice(0, 90);
    if (template.length < 4 || seen.has(template.toLowerCase()) || !reusable(template)) continue;
    const ids = Array.isArray(t.reel_ids) ? t.reel_ids.filter((x): x is string => typeof x === "string") : [];
    const reels = [...new Set(ids)].map((id) => byId.get(id)).filter((w): w is WatchedReel => {
      if (!w || w.weak) return false;
      return kind === "text" ? Boolean(w.onScreenText) : Boolean(w.hook);
    });
    const accounts = new Set(reels.map(accountKey)).size;
    if (reels.length < PATTERN_MIN_REELS || accounts < PATTERN_MIN_ACCOUNTS) continue;
    seen.add(template.toLowerCase());
    out.push({
      template,
      examples: reels.map((r) => (kind === "text" ? r.onScreenText! : r.hook!)).slice(0, 3),
      reels: reels.length, accounts, evidence: reels.slice(0, 5).map(evidenceOf),
    });
    if (out.length >= max) break;
  }
  return out.sort((a, b) => b.accounts - a.accounts || b.reels - a.reels);
}

/**
 * The playbook from the studied Reels: formats and calls to action that took
 * off across at least two accounts, the text and hook templates that passed
 * keepTemplates, and the formats that did badly. Pure.
 */
export function buildPlaybook(input: {
  niche: string | null;
  now: Date;
  watched: WatchedReel[];
  read: ScanReel[];
  accountsRead: number;
  texts: TextTemplate[];
  hooks: TextTemplate[];
  notes?: string[];
}): Playbook {
  const good = input.watched.filter((w) => !w.weak);
  const weak = input.watched.filter((w) => w.weak);
  const formats = [...groupBy(good, (w) => (w.format === "other" ? null : w.format))]
    .map(([k, rs]) => patternOf(k, FORMAT_LABEL[k as ReelFormat], rs)).filter((p): p is Pattern => p !== null).sort(byStrength).slice(0, 6);
  const ctas = [...groupBy(good, (w) => (w.cta.kind === "none" ? null : w.cta.kind))]
    .map(([k, rs]) => patternOf(k, CTA_LABEL[k as CtaKind], rs)).filter((p): p is Pattern => p !== null).sort(byStrength).slice(0, 4);
  const goodFormats = new Set(formats.map((f) => f.key));
  const avoid = [...groupBy(weak, (w) => (w.format === "other" ? null : w.format))]
    .filter(([k]) => !goodFormats.has(k))
    .map(([k, rs]) => patternOf(k, FORMAT_LABEL[k as ReelFormat], rs)).filter((p): p is Pattern => p !== null).sort(byStrength).slice(0, 3);
  const dates = input.read.map((r) => r.publishedAt).filter((d): d is string => Boolean(d)).sort();
  return {
    v: 1, niche: input.niche, builtAt: input.now.toISOString(),
    scanned: { accounts: input.accountsRead, reels: input.read.length, studied: input.watched.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    // A template that is the opening line already shows under hooks; it isn't listed twice.
    formats, ctas, texts: input.texts.filter((t) => !input.hooks.some((h) => h.template.toLowerCase() === t.template.toLowerCase())), hooks: input.hooks, avoid, notes: input.notes ?? [],
  };
}

/** How many patterns the playbook holds. */
export const patternCount = (p: Playbook): number => p.formats.length + p.ctas.length + p.texts.length + p.hooks.length;

const times = (m: number | null) => (m != null ? `, median ${m}× their usual` : "");
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/**
 * The playbook as a prompt block for the editor, the idea writer and the
 * planner: only what the Reels support, with counts and dates. Empty when
 * nothing repeated.
 */
export function playbookPrompt(p: Playbook | null): string {
  if (!p || !patternCount(p)) return "";
  const range = p.scanned.from && p.scanned.to ? `, posted ${day(p.scanned.from)} to ${day(p.scanned.to)}` : "";
  const lines = [
    `What goes viral in this niche (SOCIA studied ${p.scanned.studied} real Reels and Shorts from ${p.scanned.accounts} accounts${range}; read ${day(p.builtAt)}):`,
    ...p.formats.slice(0, 4).map((f) => `- Format that took off: ${f.label} (${f.reels} Reels, ${f.accounts} accounts${times(f.medianMultiplier)}).`),
    ...p.texts.slice(0, 4).map((t) => `- Proven on-screen text: "${t.template}" (${t.reels} Reels, ${t.accounts} accounts; for example "${t.examples[0]}").`),
    ...p.hooks.slice(0, 3).map((t) => `- Opening line that worked: "${t.template}" (${t.reels} Reels, ${t.accounts} accounts).`),
    ...p.ctas.slice(0, 3).map((c) => `- Call to action that worked: ${c.label} (${c.reels} Reels, ${c.accounts} accounts).`),
    ...p.avoid.slice(0, 2).map((a) => `- Did badly for its own accounts: ${a.label} (${a.reels} Reels, ${a.accounts} accounts${times(a.medianMultiplier)}).`),
    "Use one of these proven on-screen text formats when it fits the footage, filled in with what the footage really shows; keep text to one or two lines. Never claim the video will go viral.",
  ];
  return lines.join("\n");
}

/** The patterns as findings for the shared intelligence store (category niche). */
export function playbookInsights(p: Playbook): InsightDraft[] {
  const at = p.builtAt;
  const post = (e: Evidence) => ({ platform: (e.platform === "youtube" ? "youtube" : "instagram") as "youtube" | "instagram", id: e.url, title: e.account, permalink: e.url });
  const metric = (n: number, label: string) => ({ label, value: n, unit: "count" as const, basis: "Reels the niche scan studied" });
  const drafts: InsightDraft[] = [];
  for (const f of p.formats.slice(0, 3)) {
    drafts.push({
      fingerprint: `niche_scan:format:${f.key}`, producer: "niche_scan", category: "niche", platform: null,
      title: `In your niche, ${f.label} takes off`,
      observation: `${f.reels} Reels from ${f.accounts} accounts in your niche used ${f.label}${f.medianMultiplier != null ? ` and did a median ${f.medianMultiplier}× their accounts' usual` : ""}.`,
      metrics: [metric(f.reels, "Reels"), metric(f.accounts, "Accounts")], posts: f.evidence.map(post), periodStart: p.scanned.from, periodEnd: p.scanned.to,
      explanations: [], confidence: confidenceFor(f.reels), limitations: ["Read from public Reels through Instagram's and YouTube's official data; Instagram numbers are likes and comments unless views were published."],
      recommendation: { action: `Make one ${f.label} video this week`, why: "It repeats across accounts in your niche.", learning: "Whether your audience responds the same way.", href: "/studio" },
      source: { rule: "≥2 Reels from ≥2 accounts", data: f.evidence.map((e) => e.url), retrievedAt: at },
    });
  }
  for (const t of p.texts.slice(0, 2)) {
    drafts.push({
      fingerprint: `niche_scan:text:${t.template.toLowerCase().slice(0, 60)}`, producer: "niche_scan", category: "niche", platform: null,
      title: `On-screen text that works in your niche: "${t.template}"`,
      observation: `${t.reels} Reels from ${t.accounts} accounts in your niche put this kind of line on screen, for example "${t.examples[0]}".`,
      metrics: [metric(t.reels, "Reels"), metric(t.accounts, "Accounts")], posts: t.evidence.map(post), periodStart: p.scanned.from, periodEnd: p.scanned.to,
      explanations: [], confidence: confidenceFor(t.reels), limitations: ["Text read from the Reels' covers; a line that appears later in a video may be missed."],
      recommendation: { action: "Use this line on your next video when it fits", why: "It repeats across accounts in your niche.", learning: "Whether it gets more shares for you.", href: "/studio" },
      source: { rule: "≥2 Reels from ≥2 accounts", data: t.evidence.map((e) => e.url), retrievedAt: at },
    });
  }
  return drafts;
}

/** The key the playbook is stored under in niche_trends: owner-scoped (the key starts with the owner's id). */
export const playbookKey = (scopeId: string) => `${scopeId}:playbook:v1`;

/** A stored playbook, or null when it isn't one. */
export function readPlaybook(v: unknown): Playbook | null {
  const p = v as Playbook | null;
  return p && p.v === 1 && Array.isArray(p.formats) && Array.isArray(p.texts) ? p : null;
}

/** A playbook is refreshed after this long. */
export const PLAYBOOK_FRESH_DAYS = 7;
export const isFresh = (p: Playbook | null, now: Date): boolean => Boolean(p && now.getTime() - Date.parse(p.builtAt) < PLAYBOOK_FRESH_DAYS * 86_400_000);

/** One studied Reel from a model's answer, checked: only known enums, words trimmed, never a number. */
export function cleanWatched(reel: ScanReel, raw: Record<string, unknown> | null | undefined, read: "frames" | "cover" | "caption"): WatchedReel {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(EM_DASH, ",").replace(/\s+/g, " ").trim().slice(0, max) : null);
  const format = REEL_FORMATS.includes(raw?.format as ReelFormat) ? (raw!.format as ReelFormat) : "other";
  const ctaKind = CTA_KINDS.includes(raw?.cta_kind as CtaKind) ? (raw!.cta_kind as CtaKind) : "none";
  const seen = read !== "caption";
  const onScreen = seen ? str(raw?.on_screen_text, 140) : null;
  return {
    ...reel, format,
    onScreenText: onScreen,
    textSeen: Boolean(onScreen),
    hook: str(raw?.hook, 140),
    cta: { kind: ctaKind, text: str(raw?.cta_text, 120) },
    textStyle: seen ? str(raw?.text_style, 120) : null,
    framing: seen ? str(raw?.framing, 120) : null,
    read,
  };
}
