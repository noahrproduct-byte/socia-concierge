import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot } from "@/lib/instagramSync";
import AppShell from "@/components/AppShell";
import NicheTrends from "@/components/NicheTrends";
import NicheDetection, { type NicheDetail } from "@/components/NicheDetection";

export const metadata = { title: "Niche Trends — SOCIA" };

export default async function NichePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  const niche = profile?.niche ?? null;

  // Niche hierarchy detail (additive columns; ignore when not migrated yet).
  let detail: NicheDetail = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("niche_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    detail = (data?.niche_detail as NicheDetail) ?? null;
  } catch {
    detail = null;
  }

  // Connection + cached content, to decide whether SOCIA can detect on its own.
  const snap = await getIgSnapshot(supabase, user.id);
  const connected = Boolean(snap);
  const mediaCount = snap?.media?.length ?? 0;

  return (
    <AppShell active="niche" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Niche intelligence</div>
          <h1>Niche Trends</h1>
          <p className="page-sub">
            What&apos;s performing well in your niche right now: formats, hooks, and concepts.
          </p>
        </div>
      </div>

      {niche ? (
        <>
          {/* niche is known → intelligence feed, with the editable indicator */}
          <NicheDetection
            mode="settled"
            niche={niche}
            detail={detail}
            username={snap?.username}
            mediaCount={mediaCount}
          />
          <NicheTrends niche={niche} />
        </>
      ) : connected ? (
        /* connected account → SOCIA analyzes the real content first */
        <NicheDetection
          mode="detect"
          username={snap?.username}
          mediaCount={mediaCount}
        />
      ) : (
        /* nothing connected → connect first, or pick manually */
        <>
          <div className="db-connect">
            <span className="db-connect-ico"><Link2 size={22} /></span>
            <div className="db-connect-copy">
              <h2>Connect your account and SOCIA finds your niche</h2>
              <p>
                Connect Instagram and SOCIA reads your real content to identify your niche
                automatically. No forms.
              </p>
            </div>
            <Link
              href={igConfigured() ? "/api/auth/instagram/start" : "/settings"}
              className="db-connect-cta"
            >
              Connect Instagram
            </Link>
          </div>
          <NicheDetection mode="manual" niche={null} />
        </>
      )}
    </AppShell>
  );
}
