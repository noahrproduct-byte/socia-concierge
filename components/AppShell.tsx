import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  Radar,
  Sparkles,
  FileText,
  FileBarChart,
  LayoutGrid,
  Video,
  CalendarDays,
  Settings,
  Camera,
  Music2,
  Play,
  Plus,
  Gem,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import BrandMark from "@/components/BrandMark";
import { ThemeSync, isAppearance, type Appearance } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import { fbConfigured } from "@/lib/facebook";
import { getActiveConnection } from "@/lib/instagramSync";
import { getPlan, type Plan } from "@/lib/plan";

const FB_MARK = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
    <path d="M13.5 21v-7h2.3l.4-2.7h-2.7V9.6c0-.8.2-1.3 1.3-1.3h1.4V5.9c-.2 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.9H8.5V14h2.3v7h2.7Z" />
  </svg>
);

type NavItem = { href: string; label: string; Icon: LucideIcon; key: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, key: "dashboard" },
  { href: "/analytics", label: "Analytics", Icon: BarChart3, key: "analytics" },
  { href: "/content", label: "Content", Icon: LayoutGrid, key: "content" },
  { href: "/competitors", label: "Competitors", Icon: Radar, key: "competitors" },
  { href: "/chat", label: "AI Strategist", Icon: Sparkles, key: "chat" },
  { href: "/tool", label: "Content Plan", Icon: FileText, key: "tool" },
  { href: "/scorer", label: "Video Scorer", Icon: Video, key: "scorer" },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays, key: "calendar" },
  { href: "/reports", label: "Reports", Icon: FileBarChart, key: "reports" },
  { href: "/settings", label: "Settings", Icon: Settings, key: "settings" },
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
  // Channel state for the sidebar (best effort; the shell renders fine without it).
  let igUsername: string | null = null;
  let fbPageName: string | null = null;
  let platforms: string[] = [];
  let plan: Plan = "free";
  let appearance: Appearance | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // The ACTIVE connection — with multi-account there can be several rows.
      const [conn, fbRes, profRes, planRes] = await Promise.all([
        getActiveConnection(supabase, user.id, "username"),
        supabase
          .from("facebook_connections")
          .select("page_name, connection_status")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("profiles").select("platforms, appearance").eq("user_id", user.id).maybeSingle(),
        getPlan(supabase, user.id),
      ]);
      igUsername = (conn as { username?: string } | null)?.username ?? null;
      fbPageName =
        fbRes.data?.connection_status === "connected" ? (fbRes.data.page_name ?? "Facebook") : null;
      let prof = profRes.data as { platforms?: string[]; appearance?: string } | null;
      if (profRes.error) {
        // `appearance` column not migrated yet: read the legacy shape.
        const { data } = await supabase.from("profiles").select("platforms").eq("user_id", user.id).maybeSingle();
        prof = data as { platforms?: string[] } | null;
      }
      platforms = prof?.platforms ?? [];
      appearance = isAppearance(prof?.appearance) ? prof.appearance : null;
      plan = planRes;
    }
  } catch {
    // sidebar still renders with default channel rows
  }

  const igConnect = igConfigured() ? "/api/auth/instagram/start" : "/settings";
  const channels = [
    {
      id: "ig",
      label: igUsername ? `@${igUsername}` : "Instagram",
      on: Boolean(igUsername) || platforms.includes("Instagram"),
      href: igUsername ? "/settings" : igConnect,
      icon: <Camera size={15} />,
    },
    {
      id: "fb",
      label: fbPageName ?? "Facebook",
      on: Boolean(fbPageName) || platforms.includes("Facebook"),
      href: fbPageName ? "/settings" : fbConfigured() ? "/api/auth/facebook/start" : "/settings",
      icon: FB_MARK,
    },
    {
      id: "tt",
      label: "TikTok",
      on: platforms.includes("TikTok"),
      href: "/settings",
      icon: <Music2 size={15} />,
    },
    {
      id: "yt",
      label: "YouTube",
      on: platforms.includes("YouTube"),
      href: "/settings",
      icon: <Play size={15} fill="#fff" />,
    },
  ];

  return (
    <div className="app">
      <ThemeSync appearance={appearance} />
      <aside className="side">
        <Link href="/dashboard" className="side-logo">
          <BrandMark size={32} />
          <span className="side-word">SOCIA</span>
        </Link>

        <div className="side-sec">Channels</div>
        <div className="side-channels">
          {channels.map((c) => (
            <Link key={c.id} href={c.href} className="chan-row" title={c.on ? "Manage in settings" : "Connect"}>
              <span className={`chan-ico ${c.id}`}>{c.icon}</span>
              <span className="chan-label">{c.label}</span>
              {c.on ? <span className="chan-dot" aria-label="connected" /> : <span className="chan-add"><Plus size={12} /></span>}
            </Link>
          ))}
        </div>

        <div className="side-sec">Tools</div>
        <nav className="side-nav" aria-label="Main">
          {NAV.map(({ href, label, Icon, key }) => (
            <Link key={key} href={href} className={`side-link${active === key ? " active" : ""}`}>
              <Icon size={18} strokeWidth={2} className="side-ico" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          {plan !== "pro" && (
            <Link href="/settings#plan" className="side-upgrade">
              <Gem size={14} /> Upgrade to Pro
            </Link>
          )}
          <AccountMenu email={userEmail} plan={plan} />
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
