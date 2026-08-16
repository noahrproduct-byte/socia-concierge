import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Dashboard — SOCIA" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Home</div>
          <h1>Welcome back 👋</h1>
          <p className="page-sub">
            Signed in as <b>{user.email}</b>
          </p>
        </div>
      </div>

      <div className="panel-grid">
        <Link href="/tool" className="hub-card">
          <span className="hub-glyph">✦</span>
          <h3>Content Plan</h3>
          <p>
            Generate a content audit, competitor breakdown, and weekly plan for a
            client account.
          </p>
          <span className="hub-link">Open the tool →</span>
        </Link>

        <Link href="/analytics" className="hub-card">
          <span className="hub-glyph">📈</span>
          <h3>Analytics</h3>
          <p>
            See growth, engagement, and how you stack up against your niche.
          </p>
          <span className="hub-link">View analytics →</span>
        </Link>

        <Link href="/competitors" className="hub-card">
          <span className="hub-glyph">◎</span>
          <h3>Competitors</h3>
          <p>Track rivals and catch their outlier posts, with the &quot;why&quot;.</p>
          <span className="hub-link">Scan competitors →</span>
        </Link>

        <Link href="/calendar" className="hub-card">
          <span className="hub-glyph">◷</span>
          <h3>Calendar</h3>
          <p>Plan your week and see your audience&apos;s best times to post.</p>
          <span className="hub-link">Open calendar →</span>
        </Link>
      </div>
    </AppShell>
  );
}
