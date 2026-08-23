import { redirect } from "next/navigation";
import {
  Settings as SettingsIcon,
  UserRound,
  Share2,
  CreditCard,
  Lock,
  LogOut,
  Sparkles,
} from "lucide-react";
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
      <div className="st2">
        <div className="st2-head">
          <div>
            <small className="st2-eyebrow">Account</small>
            <h1>Settings</h1>
            <p>Manage your profile, connections, and plan.</p>
          </div>
          <div className="st2-deco" aria-hidden>
            <SettingsIcon size={28} />
          </div>
        </div>

        <section className="st2-card">
          <div className="st2-card-head">
            <span className="st2-card-ico">
              <UserRound size={15} />
            </span>
            <h3>Your profile</h3>
            <span className="st2-card-note">Powers your recommendations and niche trends</span>
          </div>
          <ProfileForm mode="settings" email={user.email ?? ""} />
        </section>

        <section className="st2-card">
          <div className="st2-card-head">
            <span className="st2-card-ico">
              <Share2 size={15} />
            </span>
            <h3>Connected accounts</h3>
            <span className="st2-card-note">Connect a platform to pull analytics</span>
          </div>
          <InstagramConnect
            username={igConn?.username ?? null}
            status={ig}
            syncedAt={igConn?.last_synced_at ?? null}
            followers={igConn?.followers_count ?? null}
          />
          <div className="st2-divider">
            <span>Other platforms</span>
          </div>
          <ConnectionsManager />
        </section>

        <section className="st2-card">
          <div className="st2-card-head">
            <span className="st2-card-ico">
              <CreditCard size={15} />
            </span>
            <h3>Plan &amp; billing</h3>
            <span className="st2-card-note">Manage your subscription and usage</span>
          </div>
          <div className="st2-plan">
            <div>
              <div className="st2-plan-name">
                Free plan <span className="st2-badge">Current</span>
              </div>
              <p>1 account · monthly audit · 5 recommendations</p>
            </div>
            <button className="st2-upgrade" type="button">
              <Sparkles size={14} /> Upgrade to Pro
            </button>
          </div>
        </section>

        <section className="st2-card">
          <div className="st2-card-head">
            <span className="st2-card-ico">
              <Lock size={15} />
            </span>
            <h3>Session</h3>
            <span className="st2-card-note">Manage your account session</span>
          </div>
          <div className="st2-session">
            <p>
              Signed in as <b>{user.email}</b>
            </p>
            <form action="/auth/signout" method="post">
              <button className="st2-logout" type="submit">
                <LogOut size={14} /> Log out
              </button>
            </form>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
