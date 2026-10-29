import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import WorkspaceSwitcher, { type ShellAccount } from "@/components/WorkspaceSwitcher";
import TopBar, { type SearchItem, type AlertItem } from "@/components/TopBar";
import AccountMenu from "@/components/AccountMenu";
import { ThemeSync } from "@/components/ThemeProvider";
import { SideNav } from "@/components/SideNav";
import PageTransition from "@/components/PageTransition";
import { ToastProvider, TooltipProvider } from "@/components/system";
import { isAppearance, type Appearance } from "@/lib/appearance";
import { getViewer } from "@/lib/supabase/server";
import { NAV } from "@/lib/nav";
import { resolveContext } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";
import { igConfigured } from "@/lib/instagram";
import { fbConfigured } from "@/lib/facebook";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { getActiveConnection } from "@/lib/instagramSync";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS, nextPlan, pricingHref, type PlanId } from "@/lib/plans";
import { buildActivity, displayTitle, type Activity } from "@/lib/overview";
import { getAlerts, unreadAlertCount } from "@/lib/alerts";
import type { ScheduledPost } from "@/lib/scheduling";

// One quiet line per step up, read from the plan config so the numbers never
// drift from what the plan actually includes. Only built features are named.
function nextPlanLine(p: PlanId): string {
  const L = PLANS[p].limits;
  const M = PLANS[p].meters;
  const ws = `${L.workspaces} Brand ${L.workspaces === 1 ? "Workspace" : "Workspaces"}`;
  switch (p) {
    case "starter":
      return `${ws}, deeper analytics, the full weekly Content Plan and ${M.ask_socia} Ask SOCIA questions a month.`;
    case "growth":
      return `${ws}, cross-platform analytics, ${L.competitors} competitors and ${M.ask_socia} Ask SOCIA questions a month.`;
    case "pro":
      return `${ws}, ${L.competitors} competitors, ${L.team_members} team members and ${M.ask_socia} Ask SOCIA questions a month.`;
    default:
      return "";
  }
}

const PAGES: SearchItem[] = [
  ...NAV.map((n) => ({ kind: "page" as const, label: n.label, href: n.href })),
  { kind: "page", label: "Appearance", hint: "Settings", href: "/settings#appearance" },
  { kind: "page", label: "Connected accounts", hint: "Settings", href: "/settings#accounts" },
  { kind: "page", label: "Brand Workspaces", hint: "Settings", href: "/settings#workspaces" },
];

// Rendered once by app/(app)/layout.tsx and kept mounted while the person moves
// between sections, so its reads run on a full page load (or router.refresh()),
// not on every click.
export default async function AppShell({ children }: { children: React.ReactNode }) {
  // Shell state (best effort; the shell renders fine without any of it).
  let igUsername: string | null = null;
  let fbPageName: string | null = null;
  let ytTitle: string | null = null;
  let ttName: string | null = null;
  let plan: PlanId = "free";
  let ownsWorkspace = true;
  /** The signed-in person's own plan, for the account row (a Member's differs from the workspace's). */
  let viewerPlan: PlanId = "free";
  let appearance: Appearance | null = null;
  let searchIndex: SearchItem[] = PAGES;
  let activity: Activity[] = [];
  let alerts: AlertItem[] = [];
  let unreadAlerts = 0;
  let userEmail: string | null = null;
  let activeWs: { id: string; name: string } | null = null;
  try {
    const { supabase, user } = await getViewer();
    if (user) {
      userEmail = user.email ?? null;
      // The shell describes the ACTIVE Brand Workspace (the owner's accounts,
      // activity and posts when the viewer is an invited team member). Theme and
      // the plan on the account row are the viewer's own.
      const ctx = await resolveContext(supabase, user.id);
      activeWs = ctx.workspace ? { id: ctx.workspace.id, name: ctx.workspace.name } : null;
      const [conn, fbRes, appRes, entRes, schedRes, plansRes, ytRes, ttRes] = await Promise.all([
        getActiveConnection(ctx.client, ctx.ownerId, "username, media, last_synced_at", ctx.workspace?.id ?? null),
        // Connections are one per workspace: read the active workspace's row, not "the" row for the owner.
        scopeToWorkspace(ctx.client.from("facebook_connections").select("page_name, connection_status").eq("user_id", ctx.ownerId), ctx.workspace?.id).limit(1).maybeSingle(),
        // Viewer's theme. The appearance column may not exist yet: a failed read is simply "no preference".
        supabase.from("profiles").select("appearance").eq("user_id", user.id).maybeSingle().then((r) => r, () => ({ data: null })),
        // The active workspace's plan (its owner's): what the features here follow.
        getEntitlements(ctx.client, ctx.ownerId).catch(() => null),
        // Activity is the active brand's only: a guest of one brand never sees another brand's posts or plans.
        scopeToWorkspace(ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).neq("status", "cancelled"), ctx.workspace?.id).order("updated_at", { ascending: false }).limit(12),
        scopeToWorkspace(ctx.client.from("plans").select("id, created_at, client_handle").eq("user_id", ctx.ownerId), ctx.workspace?.id).order("created_at", { ascending: false }).limit(3),
        // Their own catches so a not-yet-created table never blanks the whole shell.
        scopeToWorkspace(ctx.client.from("youtube_connections").select("title").eq("user_id", ctx.ownerId), ctx.workspace?.id).limit(1).maybeSingle().then((r) => r, () => ({ data: null })),
        scopeToWorkspace(ctx.client.from("tiktok_connections").select("username, display_name").eq("user_id", ctx.ownerId), ctx.workspace?.id).limit(1).maybeSingle().then((r) => r, () => ({ data: null })),
      ]);
      const c = conn as { username?: string; media?: { id?: string; caption?: string; timestamp?: string; permalink?: string }[]; last_synced_at?: string } | null;
      igUsername = c?.username ?? null;
      fbPageName = fbRes.data?.connection_status === "connected" ? (fbRes.data.page_name ?? "Facebook") : null;
      ytTitle = (ytRes.data as { title?: string } | null)?.title ?? null;
      const tt = ttRes.data as { username?: string | null; display_name?: string | null } | null;
      ttName = tt ? (tt.username ? `@${tt.username}` : tt.display_name ?? "TikTok") : null;
      const appRaw = (appRes.data as { appearance?: string } | null)?.appearance;
      appearance = isAppearance(appRaw) ? appRaw : null;
      plan = entRes?.plan ?? "free";
      ownsWorkspace = ctx.isOwner;
      viewerPlan = ctx.isOwner ? plan : ((await getEntitlements(supabase, user.id).catch(() => null))?.plan ?? "free");
      const posts: SearchItem[] = (c?.media ?? [])
        .filter((m) => m.caption)
        .slice(0, 60)
        .map((m) => ({
          kind: "post" as const,
          label: displayTitle(m.caption ?? ""),
          hint: m.timestamp ? new Date(m.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined,
          href: m.permalink ?? "/analytics#posts",
        }));
      searchIndex = [...PAGES, ...posts];
      activity = buildActivity({
        scheduled: (schedRes.data ?? []) as ScheduledPost[],
        plans: (plansRes.data ?? []) as { id: string; created_at: string; client_handle: string | null }[],
        syncedAt: c?.last_synced_at ?? null,
        handle: igUsername,
      });
      // Alerts of the active workspace (verified events; the bell inbox).
      const [alertRows, unread] = await Promise.all([
        getAlerts(ctx.client, ctx.ownerId, 15, ctx.workspace?.id, ctx.viewerId),
        unreadAlertCount(ctx.client, ctx.ownerId, ctx.workspace?.id, ctx.viewerId),
      ]);
      alerts = alertRows.map((a) => ({ id: a.id, type: a.type, severity: a.severity, title: a.title, body: a.body, detectedAt: a.detectedAt, readAt: a.readAt, entityRef: a.entityRef }));
      unreadAlerts = unread ?? 0;
    }
  } catch {
    // the shell still renders with default rows
  }

  // Only the owner can change the plan, so only the owner sees the upgrade row.
  const next = ownsWorkspace ? nextPlan(plan) : null;
  // Connected means a real connection row for this workspace; a platform
  // without one shows Connect (an OAuth start route, or Settings when the
  // platform is not configured on this deployment).
  const accounts: ShellAccount[] = [
    { platform: "instagram", label: igUsername ? `@${igUsername}` : "Instagram", connected: Boolean(igUsername), href: igUsername ? "/settings#accounts" : igConfigured() ? "/api/auth/instagram/start" : "/settings#accounts" },
    { platform: "facebook", label: fbPageName ?? "Facebook", connected: Boolean(fbPageName), href: fbPageName ? "/settings#accounts" : fbConfigured() ? "/api/auth/facebook/start" : "/settings#accounts" },
    { platform: "youtube", label: ytTitle ?? "YouTube", connected: Boolean(ytTitle), href: ytTitle ? "/settings#accounts" : ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings#accounts" },
    { platform: "tiktok", label: ttName ?? "TikTok", connected: Boolean(ttName), href: "/settings#accounts" },
  ];

  // The All sections panel: the Brand Workspace, every section, the plan and the account.
  const sheetBody = (
    <>
      <WorkspaceSwitcher initial={activeWs} accounts={accounts} />
      <SideNav />
      <div className="s-sheet-foot">
        {next && (
          <Link href={pricingHref(next)} className="s-upgrade">
            <b>Upgrade to {PLANS[next].name}</b>
            <span>{nextPlanLine(next)}</span>
            <span className="s-link">
              See plans <ArrowUpRight size={12} aria-hidden style={{ verticalAlign: "-1px" }} />
            </span>
          </Link>
        )}
        <AccountMenu email={userEmail} plan={viewerPlan} />
      </div>
    </>
  );

  return (
    // Keyed by the active Brand Workspace: when a switch refreshes the tree,
    // every client component below remounts and reads the new workspace
    // instead of keeping the old one's state. The key only changes on a
    // switch, so ordinary navigation keeps the shell mounted.
    <TooltipProvider>
      <ToastProvider>
        <div className="s-shell" key={activeWs?.id ?? "default"}>
          <ThemeSync appearance={appearance} />
          <TopBar
            index={searchIndex}
            activity={activity}
            alerts={alerts}
            unread={unreadAlerts}
            account={<AccountMenu email={userEmail} plan={viewerPlan} compact upgrade={next ? { href: pricingHref(next), name: PLANS[next].name } : null} />}
            sheet={sheetBody}
          />
          <PageTransition>{children}</PageTransition>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}
