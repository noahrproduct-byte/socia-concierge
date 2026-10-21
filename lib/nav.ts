// The app's main sections, shared by the sidebar (a client component that
// highlights the current one), the phone sheet and the command menu.
// Pages are user jobs, not technologies, grouped by what the person is doing:
// understanding their numbers, or making the next post. SOCIA AI is not a
// destination: it lives inside each of these pages (Ask SOCIA in the top bar
// and in context).
export type NavGroup = "understand" | "make";
export type NavEntry = { href: string; label: string; key: string; group: NavGroup };

export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: "understand", label: "Understand" },
  { key: "make", label: "Make" },
];

export const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard", group: "understand" },
  { href: "/analytics", label: "Analytics", key: "analytics", group: "understand" },
  { href: "/competitors", label: "Competitors", key: "competitors", group: "understand" },
  { href: "/roundup", label: "Weekly roundup", key: "roundup", group: "understand" },
  { href: "/reports", label: "Reports", key: "reports", group: "understand" },
  { href: "/tool", label: "Content Plan", key: "tool", group: "make" },
  // The multi-platform composer.
  { href: "/create", label: "Create post", key: "create", group: "make" },
  { href: "/calendar", label: "Calendar", key: "calendar", group: "make" },
  { href: "/studio", label: "Content Studio", key: "studio", group: "make" },
  // AI comment replies (Growth+): drafts a reply to every new comment for approval.
  { href: "/comments", label: "Comments", key: "comments", group: "make" },
];

/** Which section a path belongs to ("/analytics", "/analytics/x" → "analytics"). */
export function activeNavKey(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  const hit = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return hit?.key ?? null;
}

/** The section's label for the phone top bar ("Settings" is not in NAV). */
export function activeNavLabel(pathname: string | null): string {
  const key = activeNavKey(pathname);
  if (key === "settings") return "Settings";
  return NAV.find((n) => n.key === key)?.label ?? "SOCIA";
}
