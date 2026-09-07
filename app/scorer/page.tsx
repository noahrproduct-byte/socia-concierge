// app/scorer/page.tsx

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
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
    <AppShell active="scorer" userEmail={user.email}>
      <div className="cpl">
        <PageHeader
          title="Video Scorer"
          sub="Upload a draft and get it graded on hook, script, visual and audio before you post."
          status={
            connected ? (
              <span className="ov-status">
                <i className="live" />
                Account connected{syncedAgo ? ` · Updated ${syncedAgo}` : ""} · Scored against your own performance
              </span>
            ) : (
              <span className="ov-status">
                <i />
                No account connected · <Link href="/settings">Connect for live data</Link>
              </span>
            )
          }
        />

        <VideoScorer niche={niche} />
      </div>
    </AppShell>
  );
}
