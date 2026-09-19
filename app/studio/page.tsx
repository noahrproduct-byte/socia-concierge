import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { getIgSnapshot } from "@/lib/instagramSync";
import AppShell from "@/components/AppShell";
import ContentStudio, { type DraftItem } from "@/components/studio/ContentStudio";
import type { GoalId } from "@/lib/studio";

export const metadata = { title: "Content Studio | SOCIA" };

// Content Studio: bring a piece of content, make it better before it goes
// live. The server passes what SOCIA already knows (niche, goal, drafts with
// media); analysis happens on demand from frames sampled in the browser.
export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, snap] = await Promise.all([getProfile(supabase, user.id).catch(() => null), getIgSnapshot(supabase, user.id).catch(() => null)]);
  const goals = (profile?.goals ?? "").toLowerCase();
  const goalDefault: GoalId | null = /cater/.test(goals) ? "catering" : /order|visit|store|local/.test(goals) ? "local_orders" : /follower|grow/.test(goals) ? "followers" : /engage/.test(goals) ? "engagement" : /aware|brand/.test(goals) ? "awareness" : /authorit|expert|creator/.test(goals) ? "authority" : null;

  let drafts: DraftItem[] = [];
  try {
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, caption, media_url, media_type, scheduled_at, status")
      .eq("user_id", user.id)
      .not("media_url", "is", null)
      .in("status", ["draft", "scheduled", "failed"])
      .order("scheduled_at", { ascending: true })
      .limit(12);
    drafts = (data ?? []) as DraftItem[];
  } catch {
    drafts = [];
  }

  return (
    <AppShell active="studio" userEmail={user.email}>
      <ContentStudio
        userId={user.id}
        niche={profile?.niche ?? null}
        location={profile?.brand_detail?.location ?? null}
        goalDefault={goalDefault}
        drafts={drafts}
        connected={Boolean(snap && snap.followers_count != null)}
        postsSynced={snap?.media?.length ?? 0}
      />
    </AppShell>
  );
}
