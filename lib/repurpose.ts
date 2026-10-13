// Repurposing (Growth and up): the account's best recent posts that aren't on
// its other connected platforms yet, for the Dashboard's "Worth posting again"
// section. A post qualifies when it did at least MIN_LIFT times the account's
// own median on the platform it went out on, SOCIA can get its file back
// (Instagram hands over the file for the account's own posts; anything SOCIA
// published is already in storage), and there is a connected platform that
// takes that kind of media where SOCIA didn't find it already.
//
// "Already there" is known for posts SOCIA sent (their destinations) and
// matched by caption for everything else: the platform's own posts (TikTok
// captions, YouTube titles, Facebook messages) and SOCIA's drafts and
// scheduled posts. A platform whose posts couldn't be read is offered
// without the claim that the post isn't there.
//
// Pure and client-safe.
import { displayTitle } from "./overview";
import type { Platform } from "./publishing/types";

export type RepurposeSourceRef = { kind: "instagram"; id: string } | { kind: "post"; id: string };

/** A post that went out, with its numbers on the platform it went out on. */
export type RepurposePost = {
  ref: RepurposeSourceRef;
  platform: Platform;
  /** Instagram media id / external id on the platform, for matching SOCIA's destinations. */
  externalId: string;
  caption: string;
  kind: "video" | "image";
  format: string;
  thumb: string | null;
  permalink: string | null;
  postedAt: string;
  /** Against the account's own median on that platform (lib/postResults). */
  multiplier: number;
  /** Posts behind that median. */
  sample: number;
  metric: "interactions" | "views";
};

/** A post SOCIA holds (any status but cancelled) and the platforms it is set for or went to. */
export type SociaPost = { id: string; caption: string; platforms: Platform[]; externalIds: string[] };

/** What a platform already carries, as text to match. null when it couldn't be read. */
export type PlatformTexts = Partial<Record<Platform, string[] | null>>;

export type Candidate = {
  key: string;
  ref: RepurposeSourceRef;
  from: Platform;
  title: string;
  format: string;
  kind: "video" | "image";
  thumb: string | null;
  permalink: string | null;
  postedAt: string;
  multiplier: number;
  metric: "interactions" | "views";
  sample: number;
  /** Platforms the draft goes to, in a fixed order. */
  targets: Platform[];
  /** Of those, the ones SOCIA checked and didn't find it on. */
  checked: Platform[];
};

export const MIN_LIFT = 1.5;
export const MIN_SAMPLE = 5;
export const WINDOW_DAYS = 90;
export const MAX_CANDIDATES = 5;

const DAY = 86_400_000;
const ORDER: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];
/** Which media each platform takes through SOCIA. */
const TAKES: Record<Platform, ("video" | "image")[]> = { instagram: ["video", "image"], tiktok: ["video"], youtube: ["video"], facebook: ["video", "image"] };

/** Caption text reduced to words: no links, hashtags, mentions, emoji or punctuation. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Too little text to match on with any confidence. */
const MIN_MATCH = 15;
const PREFIX = 40;

/** Whether two captions (or a caption and a title) are the same post's words. */
export function sameText(a: string, b: string): boolean {
  const x = normalizeText(a), y = normalizeText(b);
  if (x.length < MIN_MATCH || y.length < MIN_MATCH) return false;
  const short = x.length <= y.length ? x : y;
  const long = short === x ? y : x;
  return long.includes(short.slice(0, PREFIX));
}

/** A YouTube title from a caption: its first line, without hashtags, at most 100 characters, no angle brackets. */
export function youtubeTitle(caption: string): string {
  const t = displayTitle(caption).replace(/[<>]/g, "").trim();
  const line = t === "(no caption)" ? "" : t;
  if ([...line].length <= 100) return line;
  const cut = [...line].slice(0, 99).join("");
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 60 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function repurposeCandidates(input: {
  posts: RepurposePost[];
  socia: SociaPost[];
  texts: PlatformTexts;
  /** Platforms with a connected account that can take a draft. */
  connected: Platform[];
  now: number;
}): Candidate[] {
  const { posts, socia, texts, now } = input;
  const connected = ORDER.filter((p) => input.connected.includes(p));
  if (!connected.length) return [];

  const out: Candidate[] = [];
  for (const p of posts) {
    const t = new Date(p.postedAt).getTime();
    if (!Number.isFinite(t) || t < now - WINDOW_DAYS * DAY || t > now) continue;
    if (p.sample < MIN_SAMPLE || !(p.multiplier >= MIN_LIFT)) continue;

    // Where it is already: the platform it went out on, SOCIA's own record of
    // it, and any post on a platform (or in SOCIA) with the same words.
    const already = new Set<Platform>([p.platform]);
    for (const s of socia) {
      const same = (p.ref.kind === "post" && s.id === p.ref.id) || s.externalIds.includes(p.externalId) || sameText(s.caption, p.caption);
      if (same) for (const pl of s.platforms) already.add(pl);
    }
    const checked: Platform[] = [];
    for (const pl of connected) {
      if (already.has(pl)) continue;
      const list = texts[pl];
      if (list === undefined || list === null) continue;
      if (list.some((x) => sameText(x, p.caption))) already.add(pl);
      else if (normalizeText(p.caption).length >= MIN_MATCH) checked.push(pl);
    }
    const to = connected.filter((pl) => !already.has(pl) && TAKES[pl].includes(p.kind));
    if (!to.length) continue;

    const key = p.ref.kind === "post" ? `post:${p.ref.id}` : `ig:${p.ref.id}`;
    const title = displayTitle(p.caption);
    out.push({
      key, ref: p.ref, from: p.platform,
      title: title === "(no caption)" ? `Your ${p.format.toLowerCase()}` : title,
      format: p.format, kind: p.kind, thumb: p.thumb, permalink: p.permalink, postedAt: p.postedAt,
      multiplier: Math.round(p.multiplier * 10) / 10, metric: p.metric, sample: p.sample,
      targets: to, checked: checked.filter((pl) => to.includes(pl)),
    });
  }
  // A post SOCIA sent to several platforms appears once, at its best result.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.multiplier - a.multiplier)
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    .slice(0, MAX_CANDIDATES);
}
