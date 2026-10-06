// The deterministic half of Generate Caption: what past posts say about
// captions and hashtags, how a caption is assembled per platform, and the
// check that nothing in a generated caption claims a fact SOCIA was never
// given (a price, a time, a link, a phone number, an @account). The model
// writes; this decides what is allowed through. Pure, unit-tested.
import { median } from "@/lib/metrics";
import type { Platform } from "./types";

/**
 * How many hashtags SOCIA writes per platform. Instagram enforces at most 5 on
 * posts and Reels (Mosseri, December 2025); the others follow each platform's
 * own guidance that a few relevant tags beat a block of generic ones.
 */
export const HASHTAG_TARGET: Record<Platform, { min: number; max: number }> = {
  instagram: { min: 3, max: 5 },
  tiktok: { min: 3, max: 5 },
  facebook: { min: 0, max: 3 },
  youtube: { min: 0, max: 3 },
};

/** The most hashtags a caption may carry when it goes to all of these platforms. */
export function hashtagMax(platforms: Platform[]): number {
  if (!platforms.length) return HASHTAG_TARGET.instagram.max;
  return Math.min(...platforms.map((p) => HASHTAG_TARGET[p].max));
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_]+)/gu;

export function hashtagsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(TAG_RE), (m) => m[2].toLowerCase());
}

/** Tags as the platforms accept them: no "#", letters/digits/underscore only, not all digits, deduped, capped. */
export function cleanHashtags(tags: string[], max: number, skip: string[] = []): string[] {
  const seen = new Set(skip.map((s) => s.toLowerCase()));
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!t || /^\d+$/.test(t) || t.length > 60) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export type CaptionParts = { hook: string; body: string; cta: string; hashtags: string[] };

/**
 * One caption as it is posted: the hook alone on the first line, the body,
 * the ask, then the hashtags on their own line. Tags the text already uses
 * inline count toward the cap and are not repeated.
 */
export function assembleCaption(p: CaptionParts, maxTags: number): { text: string; hashtags: string[] } {
  const parts = [p.hook, p.body, p.cta].map((s) => s.trim()).filter(Boolean);
  const dedupe = parts.filter((s, i) => parts.indexOf(s) === i);
  const prose = dedupe.join("\n\n");
  const inline = hashtagsIn(prose);
  const tags = cleanHashtags(p.hashtags, Math.max(0, maxTags - inline.length), inline);
  return { text: tags.length ? `${prose}\n\n${tags.map((t) => `#${t}`).join(" ")}` : prose, hashtags: tags };
}

// ---------------------------------------------------------------------------
// Unverified claims

export type Claim = { kind: "mention" | "price" | "percent" | "time" | "date" | "link" | "phone"; value: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
const digits = (s: string) => s.replace(/[^\d]/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** A number appears in the source as a number of its own (12 is in "$12 slice", not in "120"). */
function hasNumber(corpus: string, n: string): boolean {
  if (!n) return true;
  return new RegExp(`(^|[^\\d.])${escapeRe(n)}($|[^\\d])`).test(corpus);
}

/**
 * Every specific claim in `text` that nothing SOCIA was given supports.
 * `corpus` is everything verified for this post (what the person typed, the
 * transcript, the brand settings, the plan, the Studio cut); `handles` are
 * the accounts this post may name. Place names and products can't be
 * checked by pattern; the prompt and the "what SOCIA used" list cover those.
 */
export function unverifiedClaims(text: string, corpus: string, handles: string[]): Claim[] {
  const out: Claim[] = [];
  const c = norm(corpus);
  const cDigits = c.replace(/(\d)[\s,.()-]+(?=\d)/g, "$1");
  const allowed = new Set(handles.map((h) => h.replace(/^@/, "").toLowerCase()));
  const push = (kind: Claim["kind"], value: string) => { if (!out.some((o) => o.kind === kind && o.value === value)) out.push({ kind, value }); };

  for (const m of text.matchAll(/(^|[^\w@.])@([A-Za-z0-9._]{1,30})/g)) {
    const h = m[2].replace(/\.+$/, "").toLowerCase();
    if (h && !allowed.has(h) && !c.includes(`@${h}`)) push("mention", `@${h}`);
  }
  for (const m of text.matchAll(/(?:[$£€]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:dollars|bucks|usd)\b)/gi)) {
    const n = m[0].replace(/[^\d.]/g, "").replace(/\.$/, "").replace(/\.00$/, "");
    if (!hasNumber(c, n) && !hasNumber(c, n.replace(/\.\d+$/, ""))) push("price", m[0].trim());
  }
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?percent\b/gi)) {
    const n = m[0].replace(/[^\d.]/g, "");
    if (!hasNumber(c, n)) push("percent", m[0].trim());
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)/gi)) {
    const h = m[1], min = m[2];
    const re = new RegExp(`(^|[^\\d])${h}${min ? `:${min}` : "(?::00)?"}\\s?(${m[3][0].toLowerCase()}\\.?m\\b|$)`, "i");
    if (!re.test(c) && !(min && c.includes(`${h}:${min}`))) push("time", m[0].trim());
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"))) {
    const mon = m[1].slice(0, 3).toLowerCase();
    if (!new RegExp(`\\b${mon}[a-z]*\\.?\\s+${m[2]}(?:st|nd|rd|th)?\\b`).test(c)) push("date", m[0].trim());
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    if (!c.includes(m[0])) push("date", m[0]);
  }
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|co|io|us|shop|menu|store|restaurant|cafe|biz|info|app|me|tv))(?:\/[^\s]*)?/gi)) {
    const host = m[1].toLowerCase();
    if (!c.includes(host)) push("link", m[0].replace(/[).,!?]+$/, ""));
  }
  for (const m of text.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g)) {
    const d = digits(m[0]).slice(-10);
    if (!cDigits.includes(d)) push("phone", m[0].trim());
  }
  return out;
}

export function describeClaim(c: Claim): string {
  switch (c.kind) {
    case "mention": return `${c.value} isn't one of this post's collaborators, tags or your accounts`;
    case "price": return `the price ${c.value} isn't in anything you've told SOCIA`;
    case "percent": return `${c.value} isn't in anything you've told SOCIA`;
    case "time": return `the time ${c.value} isn't in anything you've told SOCIA`;
    case "date": return `the date ${c.value} isn't in anything you've told SOCIA`;
    case "link": return `${c.value} isn't a link SOCIA knows for this brand`;
    case "phone": return `the number ${c.value} isn't one SOCIA knows for this brand`;
  }
}

// ---------------------------------------------------------------------------
// What past posts say

export type PastPost = { caption: string | null; interactions: number | null; format: string; at: string | null };

export type PerformanceFacts = {
  posts: number;
  /** median interactions; null under MIN_POSTS or when every post has none */
  baseline: number | null;
  top: { hook: string; multiplier: number; format: string; hashtags: string[]; chars: number }[];
  hashtags: { tag: string; uses: number; medianMultiplier: number | null }[];
  /** median caption length of the best quarter vs the rest (≥ 8 posts) */
  length: { top: number; rest: number } | null;
};

export const MIN_POSTS = 5;

const firstLine = (s: string) => (s.split("\n").map((l) => l.trim()).find((l) => l && !/^#/.test(l)) ?? "").slice(0, 140);

export function performanceFacts(posts: PastPost[]): PerformanceFacts {
  const scored = posts.filter((p) => p.interactions != null) as (PastPost & { interactions: number })[];
  const base = scored.length >= MIN_POSTS ? median(scored.map((p) => p.interactions)) : null;
  const baseline = base != null && base > 0 ? base : null;
  const mult = (p: { interactions: number }) => (baseline ? p.interactions / baseline : null);

  const top = baseline
    ? scored
        .filter((p) => (p.caption ?? "").trim() && (mult(p) ?? 0) >= 1.5)
        .sort((a, b) => b.interactions - a.interactions)
        .slice(0, 4)
        .map((p) => ({ hook: firstLine(p.caption!), multiplier: Number((mult(p) as number).toFixed(1)), format: p.format, hashtags: hashtagsIn(p.caption).slice(0, 8), chars: [...(p.caption ?? "")].length }))
        .filter((t) => t.hook)
    : [];

  const byTag = new Map<string, number[]>();
  for (const p of posts) {
    for (const t of new Set(hashtagsIn(p.caption))) {
      const list = byTag.get(t) ?? [];
      const m = p.interactions != null ? mult(p as { interactions: number }) : null;
      list.push(m ?? Number.NaN);
      byTag.set(t, list);
    }
  }
  const hashtags = Array.from(byTag.entries())
    .map(([tag, ms]) => {
      const known = ms.filter((m) => Number.isFinite(m));
      const med = known.length >= 2 ? median(known) : null;
      return { tag, uses: ms.length, medianMultiplier: med == null ? null : Number(med.toFixed(1)) };
    })
    .sort((a, b) => b.uses - a.uses || (b.medianMultiplier ?? 0) - (a.medianMultiplier ?? 0))
    .slice(0, 15);

  let length: PerformanceFacts["length"] = null;
  if (baseline && scored.length >= 8) {
    const sorted = [...scored].sort((a, b) => b.interactions - a.interactions);
    const q = Math.max(2, Math.floor(sorted.length / 4));
    const len = (xs: PastPost[]) => median(xs.map((p) => [...(p.caption ?? "")].length));
    const t = len(sorted.slice(0, q)), r = len(sorted.slice(q));
    if (t != null && r != null) length = { top: Math.round(t), rest: Math.round(r) };
  }
  return { posts: posts.length, baseline, top, hashtags, length };
}

// ---------------------------------------------------------------------------
// Locations a post may name

export type WorkspaceFact = { id: string; name: string; brandName: string | null; location: string | null; igUsername: string | null };
export type LocationFact = { location: string; workspace: string; igUsername: string | null; why: "this_workspace" | "same_brand" | "collaborator" };

const brandKey = (s: string | null) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The business locations this post may mention, each with the reason SOCIA
 * knows it: the active workspace's own saved location; another of the
 * owner's workspaces saved under the same brand name; or another workspace
 * whose Instagram account is a collaborator on this post. Nothing is guessed
 * from names alone.
 */
export function businessLocations(current: WorkspaceFact | null, others: WorkspaceFact[], collaborators: string[]): LocationFact[] {
  const out: LocationFact[] = [];
  const collab = new Set(collaborators.map((c) => c.replace(/^@/, "").toLowerCase()));
  if (current?.location?.trim()) out.push({ location: current.location.trim(), workspace: current.name, igUsername: current.igUsername, why: "this_workspace" });
  const key = brandKey(current?.brandName ?? null);
  for (const w of others) {
    if (current && w.id === current.id) continue;
    const isCollab = w.igUsername ? collab.has(w.igUsername.toLowerCase()) : false;
    const sameBrand = key.length >= 3 && brandKey(w.brandName) === key;
    if (!isCollab && !sameBrand) continue;
    if (!w.location?.trim()) continue;
    out.push({ location: w.location.trim(), workspace: w.name, igUsername: w.igUsername, why: isCollab ? "collaborator" : "same_brand" });
  }
  return out;
}
