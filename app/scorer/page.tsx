// app/scorer/page.tsx

import { redirect } from "next/navigation";
import { Zap, CheckCircle2, Plug, Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import VideoScorer from "@/components/VideoScorer";
import { getIgSnapshot } from "@/lib/instagramSync";

export const metadata = { title: "Video Scorer — SOCIA" };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function ScorerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pass the user's niche through so scoring is judged against the right context.
  // Tolerant on purpose — if the column isn't there, we just score without it.
  let niche: string | undefined;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const record = data as Record<string, unknown> | null;
    const value = record?.niche ?? record?.industry;
    if (typeof value === "string" && value.trim()) niche = value;
  } catch {
    // no-op — niche is optional
  }

  // Connection state for the header badges (best-effort, never blocks the page).
  let connected = false;
  let syncedAgo: string | null = null;
  try {
    const snap = await getIgSnapshot(supabase, user.id);
    connected = Boolean(snap);
    syncedAgo = snap?.last_synced_at ? ago(snap.last_synced_at) : null;
  } catch {
    // header simply shows the connect nudge
  }

  return (
    <AppShell active="scorer" userEmail={user.email} dark>
      {/* shares the dark-page shell + header system introduced on Content Plan */}
      <div className="cpl">
        <div className="cpl-head">
          <div>
            <small className="cpl-eyebrow">Pre-post analysis</small>
            <h1>
              Video Scorer <Sparkles size={20} className="ch2-spark" />
            </h1>
            <p>
              Upload a draft and get it graded — hook, script, visual, audio — before you post.
            </p>
          </div>
          <div className="cpl-badges">
            <div className="cpl-badge">
              <span className="cpl-badge-ico blue">
                <Zap size={14} />
              </span>
              <span className="cpl-badge-meta">
                <b>Powered by AI</b>
                <small>Strategy + performance + competitors</small>
              </span>
            </div>
            {connected ? (
              <div className="cpl-badge">
                <span className="cpl-badge-ico green">
                  <CheckCircle2 size={14} />
                </span>
                <span className="cpl-badge-meta">
                  <b>Account connected</b>
                  <small>Live data{syncedAgo ? ` · Updated ${syncedAgo}` : ""}</small>
                </span>
              </div>
            ) : (
              <Link href="/settings" className="cpl-badge link">
                <span className="cpl-badge-ico dim">
                  <Plug size={14} />
                </span>
                <span className="cpl-badge-meta">
                  <b>No account connected</b>
                  <small>Connect for live data →</small>
                </span>
              </Link>
            )}
          </div>
        </div>

        <VideoScorer niche={niche} />
      </div>
    </AppShell>
  );
}
