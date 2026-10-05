// The app's main sections, shared by the sidebar (a client component that
// highlights the current one) and the top bar's search index (server).
// Pages are user jobs, not technologies. SOCIA AI is not a destination: it
// lives inside each of these pages (Ask SOCIA in the top bar and in context).
export type NavEntry = { href: string; label: string; key: string };

export const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
  { href: "/analytics", label: "Analytics", key: "analytics" },
  { href: "/competitors", label: "Competitors", key: "competitors" },
  { href: "/roundup", label: "Weekly roundup", key: "roundup" },
  { href: "/tool", label: "Content Plan", key: "tool" },
  { href: "/studio", label: "Content Studio", key: "studio" },
  { href: "/calendar", label: "Calendar", key: "calendar" },
  // AI comment replies (Growth+): drafts a reply to every new comment for approval.
  { href: "/comments", label: "Comments", key: "comments" },
  // The multi-platform composer.
  { href: "/create", label: "Create post", key: "create" },
  { href: "/reports", label: "Reports", key: "reports" },
];

/** Which section a path belongs to ("/analytics", "/analytics/x" → "analytics"). */
export function activeNavKey(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  const hit = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return hit?.key ?? null;
}
