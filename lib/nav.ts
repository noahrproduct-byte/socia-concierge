// The app's main sections, shared by the headbar (a client component that
// highlights the current group), the phone sheet and the command menu.
// Pages are user jobs, not technologies, grouped by what the person is doing:
// reviewing how things went, reading the market, planning, making, and
// running the account. SOCIA AI is not a destination: it lives inside each of
// these pages (Ask SOCIA in the headbar and in context).
export type NavGroup = "overview" | "intelligence" | "plan" | "create" | "manage";
export type NavEntry = { href: string; label: string; key: string; group: NavGroup };

export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "intelligence", label: "Intelligence" },
  { key: "plan", label: "Plan" },
  { key: "create", label: "Create" },
  { key: "manage", label: "Manage" },
];

export const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard", group: "overview" },
  { href: "/roundup", label: "Weekly roundup", key: "roundup", group: "overview" },
  { href: "/reports", label: "Reports", key: "reports", group: "overview" },
  { href: "/analytics", label: "Analytics", key: "analytics", group: "intelligence" },
  { href: "/competitors", label: "Competitors", key: "competitors", group: "intelligence" },
  { href: "/tool", label: "Content Plan", key: "tool", group: "plan" },
  { href: "/calendar", label: "Calendar", key: "calendar", group: "plan" },
  // The multi-platform composer.
  { href: "/create", label: "Create post", key: "create", group: "create" },
  { href: "/studio", label: "Content Studio", key: "studio", group: "create" },
  // AI comment replies (Growth+): drafts a reply to every new comment for approval.
  { href: "/comments", label: "Comments", key: "comments", group: "manage" },
  { href: "/settings", label: "Settings", key: "settings", group: "manage" },
];

/** Help is a link in the Manage group, not a section: it opens the FAQ on the public site. */
export const HELP = { href: "/#faq", label: "Help" } as const;

/** Which section a path belongs to ("/analytics", "/analytics/x" → "analytics"). */
export function activeNavKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const hit = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return hit?.key ?? null;
}

/** Which group a path belongs to, for the headbar's indicator. */
export function activeNavGroup(pathname: string | null): NavGroup | null {
  const key = activeNavKey(pathname);
  return NAV.find((n) => n.key === key)?.group ?? null;
}

/** A section's place in the menu order (-1 off the menu), so page transitions know which way to move. */
export function navIndex(pathname: string | null): number {
  const key = activeNavKey(pathname);
  return NAV.findIndex((n) => n.key === key);
}

/** The section's label for the phone headbar. */
export function activeNavLabel(pathname: string | null): string {
  const key = activeNavKey(pathname);
  return NAV.find((n) => n.key === key)?.label ?? "SOCIA";
}
