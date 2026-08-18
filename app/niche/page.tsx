import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import AppShell from "@/components/AppShell";
import NicheTrends from "@/components/NicheTrends";

export const metadata = { title: "Niche Trends — SOCIA" };

export default async function NichePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  const niche = profile?.niche ?? null;

  return (
    <AppShell active="niche" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Niche intelligence</div>
          <h1>Niche Trends</h1>
          <p className="page-sub">
            What&apos;s performing well in your niche right now — formats, hooks, and concepts.
          </p>
        </div>
      </div>

      {niche ? (
        <NicheTrends niche={niche} />
      ) : (
        <div className="connect-card">
          <span className="connect-ico">🎯</span>
          <h2>Set your niche first</h2>
          <p>
            Tell SOCIA your niche and we&apos;ll show you exactly what kind of content is
            winning in it right now.
          </p>
          <div className="connect-actions">
            <Link href="/onboarding" className="btn-primary">Choose your niche</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
