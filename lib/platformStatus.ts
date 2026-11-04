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

/** Why this platform can't be connected right now, or null when it can. Accepts "facebook" or "Facebook". */
export function offlineReason(platform: string): string | null {
  return OFFLINE_PLATFORMS[platform.toLowerCase() as OfflinePlatform] ?? null;
}
