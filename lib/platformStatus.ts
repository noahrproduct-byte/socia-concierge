// Platforms SOCIA isn't taking new connections for yet, and what to say about
// them. Wherever a Connect would be, these show "Offline for now" with the
// reason and no button; an account that is already connected keeps working.
// Admins can still connect (Settings), since SOCIA's own Facebook connection
// powers competitor research. Remove a platform here when it opens. Client-safe.

export type OfflinePlatform = "facebook" | "tiktok";

export const OFFLINE_PLATFORMS: Record<OfflinePlatform, string> = {
  facebook: "Facebook connections aren't open yet. Instagram and YouTube work now.",
  tiktok: "TikTok connections aren't open yet. Instagram and YouTube work now.",
};

export const OFFLINE_LABEL = "Offline for now";

const NAMES = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube" } as const;

/** The platforms a customer can connect today, in the order the site names them. */
export const OPEN_PLATFORMS = (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter((p) => !(p in OFFLINE_PLATFORMS));

/** Those platforms as words: "Instagram and YouTube", or "Instagram, Facebook and YouTube" once Facebook opens. */
export function openPlatformsText(join: "and" | "or" = "and"): string {
  const names = OPEN_PLATFORMS.map((p) => NAMES[p]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ${join} ${names[names.length - 1]}` : names.join("");
}

/** Why this platform can't be connected right now, or null when it can. Accepts "facebook" or "Facebook". */
export function offlineReason(platform: string): string | null {
  return OFFLINE_PLATFORMS[platform.toLowerCase() as OfflinePlatform] ?? null;
}
