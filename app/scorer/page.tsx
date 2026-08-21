// app/scorer/page.tsx

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import VideoScorer from "@/components/VideoScorer";

export const metadata = { title: "Video Scorer — SOCIA" };

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
      .eq("id", user.id)
      .maybeSingle();
    const record = data as Record<string, unknown> | null;
    const value = record?.niche ?? record?.industry;
    if (typeof value === "string" && value.trim()) niche = value;
  } catch {
    // no-op — niche is optional
  }

  return (
    <AppShell active="scorer" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Pre-post analysis</div>
          <h1>Video Scorer</h1>
          <p className="page-sub">
            Upload a draft and get it graded — hook, script, visual, audio — before you post.
          </p>
        </div>
      </div>

      <VideoScorer niche={niche} />
    </AppShell>
  );
}
