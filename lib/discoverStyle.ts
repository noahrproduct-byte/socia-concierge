// What kind of videos an account makes (Noah, 2026-11-14: "if an account is
// posting only animated videos, then it should look for animated videos"). SOCIA
// looks at the cover images of an account's recent posts and names the style,
// so Discover can lead with competitors and Reels made the same way, and
// research can look for more accounts like them. A style is SOCIA's read of the
// covers, never stated as more than that. Pure and browser-safe; the model call
// and the saved memory are in lib/discoverStyleLoad.ts.

export const STYLES = ["animated", "talking", "screen", "filmed", "skit", "slides"] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABEL: Record<Style, string> = {
  animated: "Animated",
  talking: "Talking to camera",
  screen: "Screen recording",
  filmed: "Filmed footage",
  skit: "Skits and scenes",
  slides: "Photos and slides",
};

/** What each style means, for the model and for the person reading the label. */
export const STYLE_MEANS: Record<Style, string> = {
  animated: "animation, motion graphics, 3D or illustration, with no real camera footage",
  talking: "a person speaking to the camera",
  screen: "a phone or computer screen recording",
  filmed: "real camera footage of a place, product or process, often with text or a voiceover",
  skit: "an acted scene or sketch with people",
  slides: "still photos, slides or a carousel",
};

export const isStyle = (v: unknown): v is Style => typeof v === "string" && (STYLES as readonly string[]).includes(v);

/** Covers SOCIA looks at per account; more says little more about a style. */
export const COVERS_PER_ACCOUNT = 4;
/** A style counts for an account when at least this share of its covers have it. */
const MAJORITY = 0.5;
/** A saved style is looked at again after a week: accounts change what they make. */
export const STYLE_TTL_MS = 7 * 86_400_000;
/** Accounts remembered per brand. */
const MEMORY_MAX = 120;

export type AccountStyle = { style: Style | "mixed"; share: number; n: number; at: string };

/** One account's style from the styles of its covers: the one most of them share, else mixed. Null with none. */
export function accountStyle(labels: (Style | null)[], at: string): AccountStyle | null {
  const known = labels.filter((l): l is Style => l != null);
  if (!known.length) return null;
  const counts = new Map<Style, number>();
  for (const l of known) counts.set(l, (counts.get(l) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = n / known.length;
  return { style: share >= MAJORITY ? top : "mixed", share: Math.round(share * 100) / 100, n: known.length, at };
}

export const styleWord = (s: AccountStyle | null | undefined): string | null =>
  !s ? null : s.style === "mixed" ? "Mixed formats" : STYLE_LABEL[s.style];

/** Brand memory of styles: the brand's own, and each account SOCIA looked at, by "platform:handle". */
/** Why Instagram shared nothing about an account on the last try. */
export type MissKind = "not_found" | "not_business" | "unavailable";
/** The last time SOCIA tried to read an account (or "own"), and what was missing. */
export type Tried = { at: string; miss?: MissKind };
/** An account is read at most once a day, whatever the outcome, so a lookup that fails is not asked again on every visit. */
export const TRY_TTL_MS = 86_400_000;

/**
 * Whether a suggested account is about the brand's niche or serves its audience
 * (Noah, 2026-11-15: an NFL commentator was suggested to a social media app
 * because his videos were filmed the same way). Judged from its bio and recent
 * captions (lib/discoverStyleLoad.ts judgeFit); only accounts that fit are
 * suggested or give "From your niche" Reels.
 */
/** competitor: suggested and its Reels shown; niche: its Reels shown, never suggested (a creator showing tools like the brand's); off: neither. */
export type FitVerdict = "competitor" | "niche" | "off";
export const FIT_VERDICTS: readonly FitVerdict[] = ["competitor", "niche", "off"];
export type Fit = { verdict: FitVerdict; at: string; v?: number };
/** A fit verdict is looked at again after a month. */
export const FIT_TTL_MS = 30 * 86_400_000;
/**
 * The rule a verdict was made under (lib/discoverRules.ts). Raising it makes
 * every older verdict count as not judged, so a better rule applies at once.
 * 2: a business's competitors are businesses of its own kind (2026-11-16).
 * 3: three answers, competitor / niche / off, from Noah's examples (2026-11-16).
 */
export const FIT_VERSION = 3;

/**
 * An account SOCIA found from one on the copy list (a handle mentioned in its captions), and kept
 * because its Reels are made the brand's way. `from` is the copy-list account it came from.
 */
export type CopyFound = { from: string; at: string };

/** Instagram handles as stored: lower case, no @. */
export const IG_HANDLE_RE = /^[a-z0-9._]{1,30}$/;
/** Handles an account on the copy list mentions most, read as candidates in one background read. */
export const COPY_FIND_PER_READ = 6;
/** Mentioned accounts read per background read, and the most kept per brand (nicheFound). */
export const NICHE_FIND_PER_READ = 10;
export const NICHE_FOUND_MAX = 40;
/** Accounts found from the copy list, kept per brand. */
export const COPY_FOUND_MAX = 24;

/**
 * Whether the brand could make its own version of one Reel (Noah, 2026-11-16: Predis.ai's AI-made product
 * ads and a Planoly event promo were shown for SOCIA, from the right competitors but with nothing to
 * copy). `make` is one line on how, shown as "Make yours".
 */
export type ReelVerdict = { ok: boolean; make: string | null; at: string; v?: number };
/**
 * The rule a Reel verdict was made under. Raising it makes older verdicts count as not judged.
 * 2: the Reel must also look modern and well made (Noah, 2026-11-16: "viral reels ... that is modern and
 * actually good for socia").
 */
export const REEL_RULE_VERSION = 2;
/** Reel verdicts kept per brand, newest first. */
export const REEL_VERDICTS_MAX = 150;
/** Reels judged in one background read (one or two fast-model calls). */
export const REELS_JUDGED_PER_READ = 36;

export type StyleMemory = {
  /** Per Reel, by its link (reelKey): can the brand make its own version, and how. */
  reels: Record<string, ReelVerdict>;
  own: AccountStyle | null;
  accounts: Record<string, AccountStyle>;
  tried: Record<string, Tried>;
  fit: Record<string, Fit>;
  /**
   * "Reels to copy" (Noah, 2026-11-16): Instagram accounts the brand chose to copy Reels from, for
   * their style, not as competitors (moe.dev for SOCIA). Read like competitors; never counted as one.
   */
  copyFrom: string[];
  /** Accounts found from the copy list, by handle. */
  copyFound: Record<string, CopyFound>;
  /**
   * Accounts found from the niche accounts SOCIA read, by handle (Noah, 2026-11-17: "suggest more accounts"):
   * the handles those accounts mention in their captions, read on Instagram, with 1,000+ followers and Reels.
   * Suggested once the fit check calls them competitor or niche. `from` is the account that mentioned them.
   */
  nicheFound: Record<string, CopyFound>;
};

const MISSES: readonly string[] = ["not_found", "not_business", "unavailable"];
const KEY_RE = /^(instagram|youtube|facebook|tiktok):[a-z0-9._-]{1,60}$/;

const sanitizeStyle = (v: unknown): AccountStyle | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const style = o.style === "mixed" || isStyle(o.style) ? (o.style as Style | "mixed") : null;
  const at = typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  const share = typeof o.share === "number" && o.share >= 0 && o.share <= 1 ? o.share : null;
  const n = typeof o.n === "number" && o.n > 0 ? Math.round(o.n) : null;
  return style && at && share != null && n != null ? { style, share, n, at } : null;
};

export function sanitizeMemory(v: unknown): StyleMemory {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const accounts: Record<string, AccountStyle> = {};
  const raw = o.accounts && typeof o.accounts === "object" ? (o.accounts as Record<string, unknown>) : {};
  const entries = Object.entries(raw)
    .map(([k, s]) => [k.toLowerCase(), sanitizeStyle(s)] as const)
    .filter((e): e is readonly [string, AccountStyle] => KEY_RE.test(e[0]) && e[1] != null)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, MEMORY_MAX);
  for (const [k, s] of entries) accounts[k] = s;
  const tried: Record<string, Tried> = {};
  const rawTried = o.tried && typeof o.tried === "object" ? (o.tried as Record<string, unknown>) : {};
  Object.entries(rawTried)
    .map(([k, v]) => {
      const t = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const at = typeof t.at === "string" && !Number.isNaN(Date.parse(t.at)) ? t.at : null;
      const miss = typeof t.miss === "string" && MISSES.includes(t.miss) ? (t.miss as MissKind) : undefined;
      return [k.toLowerCase(), at ? { at, ...(miss ? { miss } : {}) } : null] as const;
    })
    .filter((e): e is readonly [string, Tried] => (e[0] === "own" || KEY_RE.test(e[0])) && e[1] != null)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, MEMORY_MAX)
    .forEach(([k, t]) => { tried[k] = t; });
  const fit: Record<string, Fit> = {};
  const rawFit = o.fit && typeof o.fit === "object" ? (o.fit as Record<string, unknown>) : {};
  Object.entries(rawFit)
    .map(([k, v]) => {
      const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const at = typeof f.at === "string" && !Number.isNaN(Date.parse(f.at)) ? f.at : null;
      const verdict = FIT_VERDICTS.includes(f.verdict as FitVerdict) ? (f.verdict as FitVerdict) : null;
      return [k.toLowerCase(), at && verdict ? { verdict, at, ...(typeof f.v === "number" ? { v: f.v } : {}) } : null] as const;
    })
    .filter((e): e is readonly [string, Fit] => KEY_RE.test(e[0]) && e[1] != null)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, MEMORY_MAX)
    .forEach(([k, f]) => { fit[k] = f; });
  const copyFrom = Array.isArray(o.copyFrom)
    ? [...new Set((o.copyFrom as unknown[]).filter((h): h is string => typeof h === "string").map((h) => h.toLowerCase().replace(/^@/, "")).filter((h) => IG_HANDLE_RE.test(h)))].slice(0, 60)
    : [];
  const foundList = (raw: unknown, max: number): Record<string, CopyFound> => {
    const out: Record<string, CopyFound> = {};
    Object.entries(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {})
      .map(([h, v]) => {
        const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
        const at = typeof f.at === "string" && !Number.isNaN(Date.parse(f.at)) ? f.at : null;
        const from = typeof f.from === "string" && IG_HANDLE_RE.test(f.from) ? f.from : null;
        return [h.toLowerCase(), at && from ? { from, at } : null] as const;
      })
      .filter((e): e is readonly [string, CopyFound] => IG_HANDLE_RE.test(e[0]) && e[1] != null)
      .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
      .slice(0, max)
      .forEach(([h, f]) => { out[h] = f; });
    return out;
  };
  const copyFound = foundList(o.copyFound, COPY_FOUND_MAX);
  const nicheFound = foundList(o.nicheFound, NICHE_FOUND_MAX);
  const reels: Record<string, ReelVerdict> = {};
  const rawReels = o.reels && typeof o.reels === "object" ? (o.reels as Record<string, unknown>) : {};
  Object.entries(rawReels)
    .map(([k, v]) => {
      const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const at = typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? r.at : null;
      const make = typeof r.make === "string" && r.make.trim() ? r.make.trim().slice(0, 240) : null;
      return [k, at && typeof r.ok === "boolean" ? { ok: r.ok, make, at, ...(typeof r.v === "number" ? { v: r.v } : {}) } : null] as const;
    })
    .filter((e): e is readonly [string, ReelVerdict] => /^[a-z0-9_-]{4,40}$/i.test(e[0]) && e[1] != null)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, REEL_VERDICTS_MAX)
    .forEach(([k, r]) => { reels[k] = r; });
  return { own: sanitizeStyle(o.own), accounts, tried, fit, copyFrom, copyFound, nicheFound, reels };
}

/** Tried within the last day: don't ask again yet, and don't say it is being read. */
export const triedRecently = (m: StyleMemory, key: string, now: Date): boolean => {
  const t = m.tried[key];
  return Boolean(t && now.getTime() - Date.parse(t.at) < TRY_TTL_MS);
};

/** The reason SOCIA keeps for an Instagram lookup that returned nothing. */
export const missKind = (reason: string | null | undefined): MissKind =>
  reason === "not_found" ? "not_found" : reason === "not_business" ? "not_business" : "unavailable";

export const styleKey = (platform: string, handle: string): string => `${platform}:${handle.replace(/^@/, "").toLowerCase()}`;

/** Whether a saved style should be looked at again. */
export const styleStale = (s: AccountStyle | null | undefined, now: Date): boolean => !s || now.getTime() - Date.parse(s.at) > STYLE_TTL_MS;

/** Same style, when both are known: what puts a competitor or a Reel first. */
export const sameStyle = (a: AccountStyle | null | undefined, b: AccountStyle | null | undefined): boolean =>
  Boolean(a && b && a.style !== "mixed" && a.style === b.style);

// ------------------------------------------------------------------ platform ----

export type Platform = "instagram" | "youtube" | "facebook" | "tiktok";

/**
 * The platform a brand mostly posts on (Noah: "if they mainly use instagram it
 * should be instagram"): the one with the most posts in the window, Instagram on
 * a tie, null when nothing is connected or posted.
 */
export function mainPlatform(posts: Partial<Record<Platform, number | null>>): Platform | null {
  const order: Platform[] = ["instagram", "youtube", "tiktok", "facebook"];
  let best: Platform | null = null;
  let most = 0;
  for (const p of order) {
    const n = posts[p] ?? 0;
    if (n > most) { best = p; most = n; }
  }
  return best;
}

export const PLATFORM_WORD: Record<Platform, string> = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok" };

/** The saved verdict on an account (competitor, niche or off), or null when not judged, judged under an older rule, or a month old. */
export function fitOf(m: StyleMemory, key: string, now: Date): FitVerdict | null {
  const f = m.fit[key];
  if (!f || f.v !== FIT_VERSION || now.getTime() - Date.parse(f.at) > FIT_TTL_MS) return null;
  return f.verdict;
}

/**
 * Handles an account mentions in its captions, most mentioned first, without itself or the ones given
 * in `skip`. Where SOCIA looks for more accounts like one on the copy list: collaborators and accounts
 * it credits. Pure.
 */
export function mentionedHandles(captions: (string | null | undefined)[], self: string, skip: Set<string> = new Set()): string[] {
  const counts = new Map<string, number>();
  for (const c of captions) {
    for (const m of (c ?? "").matchAll(/(?:^|[^\w@.])@([A-Za-z0-9._]{2,30})/g)) {
      const h = m[1].toLowerCase().replace(/\.+$/, "");
      if (!IG_HANDLE_RE.test(h) || h === self.toLowerCase() || skip.has(h)) continue;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/**
 * Whether an account's Reels travel well past its followers (moe.dev: 2.6K followers, 7.1K median
 * views): its median views at least half its followers, or one Reel past twice its followers. Small
 * accounts with formats that work pass; big accounts coasting on their size don't. Pure.
 */
export function reachesPastFollowers(views: (number | null | undefined)[], followers: number | null): boolean {
  const vs = views.filter((v): v is number => typeof v === "number" && v >= 0).sort((a, b) => a - b);
  if (!vs.length || !followers || followers <= 0) return false;
  const median = vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
  return median >= followers * 0.5 || vs[vs.length - 1] >= followers * 2;
}

/** The id in an Instagram post or Reel link (instagram.com/reel/<id>/), the key a Reel verdict is kept under; null for other links. */
export function reelKey(url: string | null | undefined): string | null {
  const m = /instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]{4,40})/i.exec(url ?? "");
  return m ? m[1] : null;
}

/** A Reel's saved verdict when it was made under the current rule; null otherwise (judged again). */
export function reelVerdictOf(m: StyleMemory, url: string | null | undefined): ReelVerdict | null {
  const k = reelKey(url);
  const v = k ? m.reels[k] : null;
  return v && v.v === REEL_RULE_VERSION ? v : null;
}

/**
 * Suggested accounts need at least this many followers (Noah, 2026-11-16: "hide accounts under 1000
 * followers", after PostEverywhere was suggested with 5). An account whose follower count isn't known
 * yet still shows until it is read. Tracked accounts and Reels to copy from are the person's own
 * choice and never hidden.
 */
export const MIN_SUGGEST_FOLLOWERS = 1_000;
export const tooSmallToSuggest = (followers: number | null | undefined): boolean => followers != null && followers < MIN_SUGGEST_FOLLOWERS;
