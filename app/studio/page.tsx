import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { getIgSnapshot } from "@/lib/instagramSync";
import AppShell from "@/components/AppShell";
import ContentStudio, { type DraftItem } from "@/components/studio/ContentStudio";
import type { GoalId } from "@/lib/studio";
import { resolveContext } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Content Studio — SOCIA" };

// Content Studio: bring a piece of content, make it better before it goes
// live. The server passes what SOCIA already knows (niche, goal, drafts with
// media); analysis happens on demand from frames sampled in the browser.
export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Profile, posts and drafts are the active workspace owner's.
  const ctx = await resolveContext(supabase, user.id);

  const [profile, snap] = await Promise.all([getProfile(ctx.client, ctx.ownerId).catch(() => null), getIgSnapshot(ctx.client, ctx.ownerId).catch(() => null)]);
  const goals = (profile?.goals ?? "").toLowerCase();
  const goalDefault: GoalId | null = /cater/.test(goals) ? "catering" : /order|visit|store|local/.test(goals) ? "local_orders" : /follower|grow/.test(goals) ? "followers" : /engage/.test(goals) ? "engagement" : /aware|brand/.test(goals) ? "awareness" : /authorit|expert|creator/.test(goals) ? "authority" : null;

  let drafts: DraftItem[] = [];
  try {
    const { data } = await scopeToWorkspace(
      ctx.client
        .from("scheduled_posts")
        .select("id, caption, media_url, media_type, scheduled_at, status")
        .eq("user_id", ctx.ownerId)
        .not("media_url", "is", null)
        .in("status", ["draft", "scheduled", "failed"]),
      ctx.workspace?.id,
    )
      .order("scheduled_at", { ascending: true })
      .limit(12);
    drafts = (data ?? []) as DraftItem[];
  } catch {
    drafts = [];
  }

  return (
    <AppShell active="studio" userEmail={user.email}>
      <ContentStudio
        // The viewer's own id: the browser uploads studio media under it with
        // the viewer's session, so this must not be the workspace owner.
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
