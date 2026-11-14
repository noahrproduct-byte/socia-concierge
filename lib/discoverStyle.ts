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

export type StyleMemory = { own: AccountStyle | null; accounts: Record<string, AccountStyle>; tried: Record<string, Tried> };

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
  return { own: sanitizeStyle(o.own), accounts, tried };
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
