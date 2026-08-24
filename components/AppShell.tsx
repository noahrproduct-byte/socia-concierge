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
  Flame,
  Camera,
  Music2,
  Play,
  Plus,
  Gem,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";
import BrandMark from "@/components/BrandMark";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import { fbConfigured } from "@/lib/facebook";

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
  { href: "/niche", label: "Niche Trends", Icon: Flame, key: "niche" },
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
  dark = false,
  children,
}: {
  active: string;
  userEmail?: string | null;
  /** Full dark application shell (edge-to-edge), for immersive pages. */
  dark?: boolean;
  children: React.ReactNode;
}) {
  // Channel state for the sidebar (best effort; the shell renders fine without it).
  let igUsername: string | null = null;
  let fbPageName: string | null = null;
  let platforms: string[] = [];
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [connRes, fbRes, profRes] = await Promise.all([
        supabase
          .from("instagram_connections")
          .select("username")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("facebook_connections")
          .select("page_name, connection_status")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("profiles").select("platforms").eq("user_id", user.id).maybeSingle(),
      ]);
      igUsername = connRes.data?.username ?? null;
      fbPageName =
        fbRes.data?.connection_status === "connected" ? (fbRes.data.page_name ?? "Facebook") : null;
      platforms = profRes.data?.platforms ?? [];
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
    <div className={`app${dark ? " app-dark" : ""}`}>
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
          <Link href="/settings" className="side-upgrade">
            <Gem size={14} /> Upgrade to Pro
          </Link>
          <AccountMenu email={userEmail} />
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
