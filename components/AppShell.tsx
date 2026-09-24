import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  Radar,
  FileText,
  FileBarChart,
  Clapperboard,
  CalendarDays,
  PenSquare,
  Settings,
  Camera,
  Music2,
  Play,
  Plus,
  Gem,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import TopBar, { type SearchItem } from "@/components/TopBar";
import { ThemeSync } from "@/components/ThemeProvider";
import { isAppearance, type Appearance } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import { fbConfigured } from "@/lib/facebook";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { getActiveConnection } from "@/lib/instagramSync";
import { getEntitlements } from "@/lib/entitlements";
import { PLANS, nextPlan, pricingHref, type PlanId } from "@/lib/plans";
import { buildActivity, displayTitle, type Activity } from "@/lib/overview";
import type { ScheduledPost } from "@/lib/scheduling";

const FB_MARK = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
    <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
  </svg>
);

type NavItem = { href: string; label: string; Icon: LucideIcon; key: string };

// One quiet line per step up. Only what the next plan actually adds.
const NEXT_PLAN_LINE: Record<PlanId, string> = {
  free: "",
  starter: "Scheduling, weekly plans and full analytics.",
  growth: "Connect up to 5 accounts, more competitors and more AI usage.",
  pro: "Up to 15 accounts, 25 competitors and higher AI limits.",
};

// Pages are user jobs, not technologies. SOCIA AI is not a destination: it
// lives inside each of these pages (Ask SOCIA in the top bar and in context).
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, key: "dashboard" },
  { href: "/analytics", label: "Analytics", Icon: BarChart3, key: "analytics" },
  { href: "/competitors", label: "Competitors", Icon: Radar, key: "competitors" },
  { href: "/tool", label: "Content Plan", Icon: FileText, key: "tool" },
  { href: "/studio", label: "Content Studio", Icon: Clapperboard, key: "studio" },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays, key: "calendar" },
  // The multi-platform composer (/create and its sub-routes pass active="create").
  { href: "/create", label: "Create post", Icon: PenSquare, key: "create" },
  { href: "/reports", label: "Reports", Icon: FileBarChart, key: "reports" },
];

const PAGES: SearchItem[] = [
  ...NAV.map((n) => ({ kind: "page" as const, label: n.label, href: n.href })),
  { kind: "page", label: "Settings", href: "/settings" },
  { kind: "page", label: "Appearance", hint: "Settings", href: "/settings#appearance" },
  { kind: "page", label: "Connected accounts", hint: "Settings", href: "/settings#accounts" },
];

export default async function AppShell({
  active,
  userEmail,
  children,
}: {
  active: string;
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  // Shell state (best effort; the shell renders fine without any of it).
  let igUsername: string | null = null;
  let fbPageName: string | null = null;
  let ytTitle: string | null = null;
  let platforms: string[] = [];
  let plan: PlanId = "free";
  let appearance: Appearance | null = null;
  let searchIndex: SearchItem[] = PAGES;
  let activity: Activity[] = [];
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [conn, fbRes, profRes, entRes, schedRes, plansRes, ytRes] = await Promise.all([
        getActiveConnection(supabase, user.id, "username, media, last_synced_at"),
        supabase.from("facebook_connections").select("page_name, connection_status").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("platforms, appearance").eq("user_id", user.id).maybeSingle(),
        // Already defensive inside; the catch keeps an unexpected throw from blanking the shell.
        getEntitlements(supabase, user.id).catch(() => null),
        supabase.from("scheduled_posts").select("*").eq("user_id", user.id).neq("status", "cancelled").order("updated_at", { ascending: false }).limit(12),
        supabase.from("plans").select("id, created_at, client_handle").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
        // Its own catch so a not-yet-created table never blanks the whole shell.
        supabase.from("youtube_connections").select("title").eq("user_id", user.id).maybeSingle().then((r) => r, () => ({ data: null })),
      ]);
      const c = conn as { username?: string; media?: { id?: string; caption?: string; timestamp?: string; permalink?: string }[]; last_synced_at?: string } | null;
      igUsername = c?.username ?? null;
      fbPageName = fbRes.data?.connection_status === "connected" ? (fbRes.data.page_name ?? "Facebook") : null;
      ytTitle = (ytRes.data as { title?: string } | null)?.title ?? null;
      let prof = profRes.data as { platforms?: string[]; appearance?: string } | null;
      if (profRes.error) {
        const { data } = await supabase.from("profiles").select("platforms").eq("user_id", user.id).maybeSingle();
        prof = data as { platforms?: string[] } | null;
      }
      platforms = prof?.platforms ?? [];
      appearance = isAppearance(prof?.appearance) ? prof.appearance : null;
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
    }
  } catch {
    // sidebar still renders with default rows
  }

  const next = nextPlan(plan);
  const igConnect = igConfigured() ? "/api/auth/instagram/start" : "/settings";
  const accounts = [
    { id: "ig", label: igUsername ? `@${igUsername}` : "Instagram", on: Boolean(igUsername) || platforms.includes("Instagram"), href: igUsername ? "/analytics?account=instagram" : igConnect, icon: <Camera size={14} /> },
    { id: "fb", label: fbPageName ?? "Facebook", on: Boolean(fbPageName) || platforms.includes("Facebook"), href: fbPageName ? "/analytics?account=facebook" : fbConfigured() ? "/api/auth/facebook/start" : "/settings#accounts", icon: FB_MARK },
    { id: "tt", label: "TikTok", on: platforms.includes("TikTok"), href: "/settings#accounts", icon: <Music2 size={14} /> },
    { id: "yt", label: ytTitle ?? "YouTube", on: Boolean(ytTitle) || platforms.includes("YouTube"), href: ytTitle ? "/analytics?account=youtube" : ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings#accounts", icon: <Play size={14} fill="currentColor" /> },
  ];

  return (
    <div className="app">
      <ThemeSync appearance={appearance} />
      <aside className="side">
        <Link href="/dashboard" className="side-logo">
          <BrandMark size={30} />
          <span className="side-word">SOCIA</span>
        </Link>

        <nav className="side-nav" aria-label="Main">
          {NAV.map(({ href, label, Icon, key }) => (
            <Link key={key} href={href} className={`side-link${active === key ? " active" : ""}`} aria-current={active === key ? "page" : undefined}>
              <Icon size={17} strokeWidth={2} className="side-ico" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

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
              <small>{NEXT_PLAN_LINE[next]}</small>
              <span className="side-upcard-btn">See plans</span>
            </Link>
          )}
          <Link href="/settings" className={`side-link${active === "settings" ? " active" : ""}`} aria-current={active === "settings" ? "page" : undefined}>
            <Settings size={17} strokeWidth={2} className="side-ico" />
            <span>Settings</span>
          </Link>
          <Link href="/#faq" className="side-link">
            <LifeBuoy size={17} strokeWidth={2} className="side-ico" />
            <span>Help &amp; Support</span>
          </Link>
        </div>
      </aside>

      <main className="app-main">
        <TopBar email={userEmail} plan={plan} index={searchIndex} activity={activity} />
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
