// The primary platform a plan is written for. It was always "Instagram",
// so a YouTube-only account got Reels, an "Instagram (goals are measured on
// YouTube)" label and a "your primary platform is Instagram" problem it never
// had (a real new account, 2026-11-19). Now: the platforms the person chose,
// in their order, with Instagram first only when they chose it or when it is
// the one connected and nothing else is known. Pure.

const NAMES: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok" };

export function primaryPlatform(chosen: readonly string[] | null | undefined, opts: { instagramConnected: boolean; connected?: readonly string[] }): string {
  const named = (chosen ?? []).map((p) => NAMES[String(p).trim().toLowerCase()]).filter((p): p is string => Boolean(p));
  if (named.length) return named[0];
  if (opts.instagramConnected) return "Instagram";
  const other = (opts.connected ?? []).map((p) => NAMES[String(p).trim().toLowerCase()]).find(Boolean);
  return other ?? "Instagram";
}

/** What the platform calls a short vertical video: a Short on YouTube, a Reel on Instagram and Facebook, a video on TikTok. */
export function shortVideoName(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "youtube") return "Short";
  if (p === "tiktok") return "TikTok video";
  return "Reel";
}
