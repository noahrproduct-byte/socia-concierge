import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ProfileForm from "@/components/ProfileForm";
import ConnectionsManager from "@/components/ConnectionsManager";
import InstagramConnect from "@/components/InstagramConnect";

export const metadata = { title: "Settings — SOCIA" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ig } = await searchParams;
  // Full row first; fall back to the base column if cache columns don't exist yet.
  let igConn: { username: string | null; last_synced_at?: string | null; followers_count?: number | null } | null = null;
  {
    const full = await supabase
      .from("instagram_connections")
      .select("username, last_synced_at, followers_count")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!full.error) {
      igConn = full.data;
    } else {
      const base = await supabase
        .from("instagram_connections")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();
      igConn = base.data;
    }
  }

  return (
    <AppShell active="settings" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1>Settings</h1>
          <p className="page-sub">Manage your profile, connections, and plan.</p>
        </div>
      </div>

      <div className="settings">
        <section className="chart-card">
          <div className="chart-head">
            <h3>Your profile</h3>
            <span className="head-note">Powers your recommendations and niche trends</span>
          </div>
          <label>Email</label>
          <input type="email" value={user.email ?? ""} readOnly />
          <ProfileForm mode="settings" />
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3>Connected accounts</h3>
            <span className="head-note">Connect a platform to pull analytics</span>
          </div>
          <InstagramConnect
            username={igConn?.username ?? null}
            status={ig}
            syncedAt={igConn?.last_synced_at ?? null}
            followers={igConn?.followers_count ?? null}
          />
          <div className="ig-connect-divider">
            <span>Other platforms — coming soon</span>
          </div>
          <ConnectionsManager />
        </section>

        <section className="chart-card plan-card">
          <div className="chart-head">
            <h3>Plan &amp; billing</h3>
          </div>
          <div className="plan-row">
            <div>
              <div className="plan-name">
                Free plan <span className="plan-badge">Current</span>
              </div>
              <p className="plan-sub">1 account · monthly audit · 5 recommendations</p>
            </div>
            <button className="head-btn">Upgrade to Pro</button>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <h3>Session</h3>
          </div>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Signed in as <b>{user.email}</b>
          </p>
          <form action="/auth/signout" method="post">
            <button className="side-signout" style={{ maxWidth: 160 }} type="submit">
              Log out
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
