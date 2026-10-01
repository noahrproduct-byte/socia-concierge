// Shared platform brand marks + tints, so the switcher, the All-Platforms cards
// and anywhere else render recognizable platform glyphs consistently. lucide-react
// ships no brand icons, so these are small inline SVGs (the same marks the
// connect screen uses). Colour is passed in so a mark can be tinted or drawn
// white on a coloured chip.

import type { ReactNode } from "react";

export type PlatformKey = "instagram" | "youtube" | "facebook" | "tiktok";

/** Brand tints, used only as small accents — SOCIA's own colours stay dominant. */
export const PLATFORM_TINT: Record<PlatformKey, string> = {
  instagram: "#d6357a",
  youtube: "#e0332a",
  facebook: "#1877f2",
  tiktok: "#0ea5b7",
};

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function platformMark(key: PlatformKey, color: string, size = 16): ReactNode {
  switch (key) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" fill={color} stroke="none" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden>
          <path d="M12 6c-3 0-6 .2-6 .2-.7.1-1.3.7-1.4 1.4C4.4 8.5 4.3 10 4.3 12s.1 3.5.3 4.4c.1.7.7 1.3 1.4 1.4 0 0 3 .2 6 .2s6-.2 6-.2c.7-.1 1.3-.7 1.4-1.4.2-.9.3-2.4.3-4.4s-.1-3.5-.3-4.4a1.9 1.9 0 0 0-1.4-1.4S15 6 12 6Zm-1.5 3.3 4 2.7-4 2.7V9.3Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden>
          <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden>
          <path d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3 0-2.5-.4-3.5-1v5.9a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 2 2.7V3h2.6Z" />
        </svg>
      );
  }
}
