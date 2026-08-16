import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
  glyph: string;
  key: string;
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", glyph: "▦", key: "dashboard" },
  { href: "/analytics", label: "Analytics", glyph: "📈", key: "analytics" },
  { href: "/tool", label: "Content Plan", glyph: "✦", key: "tool" },
  { href: "#", label: "Competitors", glyph: "◎", key: "competitors", soon: true },
  { href: "#", label: "Calendar", glyph: "◷", key: "calendar", soon: true },
  { href: "#", label: "Settings", glyph: "⚙", key: "settings", soon: true },
];

// The logged-in app frame: fixed left sidebar + main content area.
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
          <span className="brand-mark">S</span>
          <span>SOCIA</span>
        </Link>

        <nav className="side-nav">
          {NAV.map((item) =>
            item.soon ? (
              <span key={item.key} className="side-link soon">
                <span className="side-glyph">{item.glyph}</span>
                {item.label}
                <span className="soon-badge">Soon</span>
              </span>
            ) : (
              <Link
                key={item.key}
                href={item.href}
                className={`side-link${active === item.key ? " active" : ""}`}
              >
                <span className="side-glyph">{item.glyph}</span>
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="side-foot">
          <div className="side-user">
            <span className="side-avatar">
              {(userEmail?.[0] ?? "?").toUpperCase()}
            </span>
            <span className="side-email">{userEmail ?? "Signed in"}</span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="side-signout" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}
