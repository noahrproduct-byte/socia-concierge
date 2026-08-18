import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  Radar,
  Sparkles,
  FileText,
  Video,
  CalendarDays,
  Settings,
  Flame,
  type LucideIcon,
} from "lucide-react";
import AccountMenu from "@/components/AccountMenu";

type NavItem = { href: string; label: string; Icon: LucideIcon; key: string };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, key: "dashboard" },
  { href: "/analytics", label: "Analytics", Icon: BarChart3, key: "analytics" },
  { href: "/competitors", label: "Competitors", Icon: Radar, key: "competitors" },
  { href: "/niche", label: "Niche Trends", Icon: Flame, key: "niche" },
  { href: "/chat", label: "AI Strategist", Icon: Sparkles, key: "chat" },
  { href: "/tool", label: "Content Plan", Icon: FileText, key: "tool" },
  { href: "/scorer", label: "Video Scorer", Icon: Video, key: "scorer" },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays, key: "calendar" },
  { href: "/settings", label: "Settings", Icon: Settings, key: "settings" },
];

export default function AppShell({
  active,
  userEmail,
  children,
}: {
  active: string;
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="side">
        <Link href="/dashboard" className="side-logo">
          <span className="side-mark">S</span>
          <span className="side-word">SOCIA</span>
        </Link>

        <nav className="side-nav" aria-label="Main">
          {NAV.map(({ href, label, Icon, key }) => (
            <Link key={key} href={href} className={`side-link${active === key ? " active" : ""}`}>
              <Icon size={18} strokeWidth={2} className="side-ico" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="side-foot">
          <AccountMenu email={userEmail} />
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
