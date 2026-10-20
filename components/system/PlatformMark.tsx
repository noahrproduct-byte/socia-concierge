import { cn } from "@/lib/utils";

export type Platform = "instagram" | "youtube" | "facebook" | "tiktok";

export const PLATFORM_NAME: Record<Platform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const PATHS: Record<Platform, React.ReactNode> = {
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </g>
  ),
  youtube: (
    <path
      fill="currentColor"
      d="M12 6c-3 0-6 .2-6 .2-.7.1-1.3.7-1.4 1.4C4.4 8.5 4.3 10 4.3 12s.1 3.5.3 4.4c.1.7.7 1.3 1.4 1.4 0 0 3 .2 6 .2s6-.2 6-.2c.7-.1 1.3-.7 1.4-1.4.2-.9.3-2.4.3-4.4s-.1-3.5-.3-4.4a1.9 1.9 0 0 0-1.4-1.4S15 6 12 6Zm-1.5 3.3 4 2.7-4 2.7V9.3Z"
    />
  ),
  facebook: (
    <path fill="currentColor" d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
  ),
  tiktok: (
    <path fill="currentColor" d="M16.5 3c.3 2 1.6 3.6 3.5 3.9v2.6c-1.3 0-2.5-.4-3.5-1v5.9a5.5 5.5 0 1 1-5.5-5.5c.3 0 .6 0 .9.1v2.7a2.8 2.8 0 1 0 2 2.7V3h2.6Z" />
  ),
};

/**
 * The one set of platform marks. Grey by default (chrome); `brand` paints the
 * platform's hue, which is the only place brand colours appear. Pass `label`
 * when the mark stands alone, so it is announced.
 */
export function PlatformMark({
  platform,
  brand,
  size = "md",
  label,
  className,
}: {
  platform: Platform;
  brand?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("s-mark", brand && "s-mark--brand", platform, size === "sm" && "s-mark--sm", size === "lg" && "s-mark--lg", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[platform]}
    </svg>
  );
}
