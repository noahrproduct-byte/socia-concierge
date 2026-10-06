import Link from "next/link";
import { Camera, Music2, Play, Plus, Gem, LifeBuoy } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import TopBar, { type SearchItem, type AlertItem } from "@/components/TopBar";
import { ThemeSync } from "@/components/ThemeProvider";
import { isAppearance, type Appearance } from "@/lib/appearance";
import { getViewer } from "@/lib/supabase/server";
import { NAV } from "@/lib/nav";
import { SideNav, SideSettingsLink } from "@/components/SideNav";
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

const FB_MARK = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
    <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
  </svg>
);

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
  { kind: "page", label: "Settings", href: "/settings" },
  { kind: "page", label: "Appearance", hint: "Settings", href: "/settings#appearance" },
  { kind: "page", label: "Connected accounts", hint: "Settings", href: "/settings#accounts" },
];

// Rendered once by app/(app)/layout.tsx and kept mounted while the person moves
// between sections, so its reads run on a full page load (or router.refresh()),
// not on every click.
export default async function AppShell({ children }: { children: React.ReactNode }) {
  // Shell state (best effort; the shell renders fine without any of it).
  let igUsername: string | null = null;
  let fbPageName: string | null = null;
  let ytTitle: string | null = null;
  let platforms: string[] = [];
  let plan: PlanId = "free";
  let appearance: Appearance | null = null;
  let searchIndex: SearchItem[] = PAGES;
  let activity: Activity[] = [];
  let alerts: AlertItem[] = [];
  let unreadAlerts = 0;
  let userEmail: string | null = null;
  try {
    const { supabase, user } = await getViewer();
    if (user) {
      userEmail = user.email ?? null;
      // The sidebar describes the ACTIVE Brand Workspace (the owner's accounts,
      // activity and posts when the viewer is an invited team member). Theme and
      // the plan behind the "Upgrade to …" card are the viewer's own.
      const ctx = await resolveContext(supabase, user.id);
      const [conn, fbRes, platRes, appRes, entRes, schedRes, plansRes, ytRes] = await Promise.all([
        getActiveConnection(ctx.client, ctx.ownerId, "username, media, last_synced_at", ctx.workspace?.id ?? null),
        // Connections are one per workspace: read the active workspace's row, not "the" row for the owner.
        scopeToWorkspace(ctx.client.from("facebook_connections").select("page_name, connection_status").eq("user_id", ctx.ownerId), ctx.workspace?.id).limit(1).maybeSingle(),
        ctx.client.from("profiles").select("platforms").eq("user_id", ctx.ownerId).maybeSingle(),
        // Viewer's theme. The appearance column may not exist yet: a failed read is simply "no preference".
        supabase.from("profiles").select("appearance").eq("user_id", user.id).maybeSingle().then((r) => r, () => ({ data: null })),
        // Viewer's plan. Already defensive inside; the catch keeps an unexpected throw from blanking the shell.
        getEntitlements(supabase, user.id).catch(() => null),
        ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).neq("status", "cancelled").order("updated_at", { ascending: false }).limit(12),
        ctx.client.from("plans").select("id, created_at, client_handle").eq("user_id", ctx.ownerId).order("created_at", { ascending: false }).limit(3),
        // Its own catch so a not-yet-created table never blanks the whole shell.
        scopeToWorkspace(ctx.client.from("youtube_connections").select("title").eq("user_id", ctx.ownerId), ctx.workspace?.id).limit(1).maybeSingle().then((r) => r, () => ({ data: null })),
      ]);
      const c = conn as { username?: string; media?: { id?: string; caption?: string; timestamp?: string; permalink?: string }[]; last_synced_at?: string } | null;
      igUsername = c?.username ?? null;
      fbPageName = fbRes.data?.connection_status === "connected" ? (fbRes.data.page_name ?? "Facebook") : null;
      ytTitle = (ytRes.data as { title?: string } | null)?.title ?? null;
      platforms = (platRes.data as { platforms?: string[] } | null)?.platforms ?? [];
      const appRaw = (appRes.data as { appearance?: string } | null)?.appearance;
      appearance = isAppearance(appRaw) ? appRaw : null;
      plan = entRes?.plan ?? "free";
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
        scheduled: ((schedRes.data ?? []) as ScheduledPost[]),
        plans: (plansRes.data ?? []) as { id: string; created_at: string; client_handle: string | null }[],
        syncedAt: c?.last_synced_at ?? null,
        handle: igUsername,
      });
      // Alerts of the active workspace (verified events; the bell inbox).
      const [alertRows, unread] = await Promise.all([
        getAlerts(ctx.client, ctx.ownerId, 15, ctx.workspace?.id),
        unreadAlertCount(ctx.client, ctx.ownerId, ctx.workspace?.id),
      ]);
      alerts = alertRows.map((a) => ({ id: a.id, type: a.type, severity: a.severity, title: a.title, body: a.body, detectedAt: a.detectedAt, readAt: a.readAt, entityRef: a.entityRef }));
      unreadAlerts = unread ?? 0;
    }
  } catch {
    // sidebar still renders with default rows
  }

  const next = nextPlan(plan);
  const igConnect = igConfigured() ? "/api/auth/instagram/start" : "/settings";
  const accounts = [
    { id: "ig", label: igUsername ? `@${igUsername}` : "Instagram", on: Boolean(igUsername) || platforms.includes("Instagram"), href: igUsername ? "/settings#accounts" : igConnect, icon: <Camera size={14} /> },
    { id: "fb", label: fbPageName ?? "Facebook", on: Boolean(fbPageName) || platforms.includes("Facebook"), href: fbPageName ? "/settings#accounts" : fbConfigured() ? "/api/auth/facebook/start" : "/settings#accounts", icon: FB_MARK },
    { id: "tt", label: "TikTok", on: platforms.includes("TikTok"), href: "/settings#accounts", icon: <Music2 size={14} /> },
    { id: "yt", label: ytTitle ?? "YouTube", on: Boolean(ytTitle) || platforms.includes("YouTube"), href: ytTitle ? "/settings#accounts" : ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings#accounts", icon: <Play size={14} fill="currentColor" /> },
  ];

  return (
    <div className="app">
      <ThemeSync appearance={appearance} />
      <aside className="side">
        <Link href="/dashboard" className="side-logo">
          <BrandMark size={30} />
          <span className="side-word">SOCIA</span>
        </Link>

        <WorkspaceSwitcher />

        <SideNav />

        <div className="side-sec">Social Accounts</div>
        <div className="side-channels">
          {accounts.map((c) => {
            // OAuth start routes are API endpoints, not pages: a Next <Link>
            // tries to prefetch them as RSC and logs a fetch error on every
            // page load. A plain anchor navigates cleanly.
            const El = c.href.startsWith("/api/") ? "a" : Link;
            return (
            <El key={c.id} href={c.href} className="chan-row" title={c.on ? "Manage in settings" : "Connect"}>
              <span className={`chan-ico ${c.id}`}>{c.icon}</span>
              <span className="chan-label">{c.label}</span>
              {c.on ? <span className="chan-dot" aria-label="connected" /> : <span className="chan-add"><Plus size={12} /></span>}
            </El>
            );
          })}
          <Link href="/settings#accounts" className="side-add"><Plus size={13} /> Add Account</Link>
        </div>

        <div className="side-bottom">
          {next && (
            <Link href={pricingHref(next)} className="side-upcard">
              <span className="side-upcard-head"><Gem size={14} /> Upgrade to {PLANS[next].name}</span>
              <small>{nextPlanLine(next)}</small>
              <span className="side-upcard-btn">See plans</span>
            </Link>
          )}
          <SideSettingsLink />
          <Link href="/#faq" className="side-link">
            <LifeBuoy size={17} strokeWidth={2} className="side-ico" />
            <span>Help &amp; Support</span>
          </Link>
        </div>
      </aside>

      <main className="app-main">
        <TopBar email={userEmail} plan={plan} index={searchIndex} activity={activity} alerts={alerts} unread={unreadAlerts} />
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
