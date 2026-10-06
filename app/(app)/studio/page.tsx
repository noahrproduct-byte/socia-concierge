import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { getIgSnapshot } from "@/lib/instagramSync";
import ContentStudio, { type DraftItem } from "@/components/studio/ContentStudio";
import ClipsStudio from "@/components/studio/ClipsStudio";
import StudioMode from "@/components/studio/StudioMode";
import type { GoalId } from "@/lib/studio";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Content Studio — SOCIA" };

// Content Studio has two ways in. Quick Analyze: bring a finished piece of
// content and make it better before it goes live (the original Studio,
// unchanged). Build from Clips: bring raw footage and let SOCIA find the
// posts in it. The mode is in the URL (?mode=clips) so a refresh keeps it.
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ mode?: string; project?: string }> }) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const { mode } = await searchParams;

  if (mode === "clips") {
    return (
      <Suspense fallback={null}>
        <ClipsStudio viewerId={user.id} modeTabs={<StudioMode mode="clips" />} />
      </Suspense>
    );
  }

  // Profile, posts and drafts are the active workspace owner's.
  const ctx = await resolveContext(supabase, user.id);

  const [profile, snap] = await Promise.all([getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null), getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null)]);
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
    <>
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
        modeTabs={<StudioMode mode="quick" />}
      />
    </>
  );
}
