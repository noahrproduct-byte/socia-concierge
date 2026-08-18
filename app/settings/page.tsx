import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ProfileForm from "@/components/ProfileForm";

export const metadata = { title: "Settings — SOCIA" };

const SOCIALS = [
  { name: "Instagram", glyph: "📷" },
  { name: "TikTok", glyph: "🎵" },
  { name: "YouTube", glyph: "▶" },
  { name: "LinkedIn", glyph: "in" },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
          <div className="conn-list">
            {SOCIALS.map((s) => (
              <div className="conn-row" key={s.name}>
                <span className="conn-icon">{s.glyph}</span>
                <span className="conn-name">{s.name}</span>
                <span className="conn-status">Not connected</span>
                <button className="conn-btn">Connect</button>
              </div>
            ))}
          </div>
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
