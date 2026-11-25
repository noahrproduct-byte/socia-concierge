import { referenceOf, sourceOfLink, sourceOfRef } from "@/lib/studioClips/referenceSource";
import type { HandoffReference } from "@/lib/studioClips/handoff";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { getIgSnapshot } from "@/lib/instagramSync";
import ContentStudio, { type DraftItem } from "@/components/studio/ContentStudio";
import ClipsStudio from "@/components/studio/ClipsStudio";
import StudioMode from "@/components/studio/StudioMode";
import GuideStudio from "@/components/studio/GuideStudio";
import MakeChoice from "@/components/studio/MakeChoice";
import AnimateStudio from "@/components/studio/AnimateStudio";
import { formatConcept, planConcept, planPost } from "@/lib/studioGuideLoad";
import { editorBrief, planPostTitle } from "@/lib/planEditorBrief";
import type { GoalId } from "@/lib/studio";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";

export const metadata = { title: "Content Studio | SOCIA" };

// Content Studio has three parts. Rate: bring a finished video and make it
// better before it goes live. Video editor (?mode=edit):
// put in clips, then a prompt and/or a reference video to copy, or edit
// them yourself; every video made and every clip kept are below. Audio: drop a video
// and SOCIA puts in a song from the playlist. The mode is in the URL (?mode=clips,
// ?mode=edit, ?mode=audio) so a refresh keeps it; Plan a post
// (?mode=guide) is opened from a planned post. Build (?mode=clips) is no
// longer a tab: a link to one of its projects still opens it, so nothing made
// there is stranded; without a project the link lands in the Video editor.
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ mode?: string; project?: string; plan?: string; i?: string; format?: string; brief?: string; about?: string; refUrl?: string; refBy?: string }> }) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const { mode, plan, i, format, project, brief, about, refUrl, refBy } = await searchParams;
  if ((mode === "clips" || mode === "autopost") && !project) redirect("/studio?mode=edit");

  // The Video editor tile asks first: animate a video from a prompt, or edit clips (Umar, 2026-11-21).
  if (mode === "make") return <MakeChoice modeTabs={<StudioMode mode="make" />} />;
  if (mode === "animate") return <AnimateStudio viewerId={user.id} modeTabs={<StudioMode mode="animate" />} />;

  // Plan a post: the concept from a planned post or a Discover format (read
  // here, never from the address alone), then its production guide.
  if (mode === "guide") {
    const gctx = await resolveContext(supabase, user.id);
    const fromPlan = plan && i != null && /^\d{1,2}$/.test(i) ? await planConcept(gctx, plan, Number(i)).catch(() => null) : null;
    const fromFormat = !fromPlan && format ? await formatConcept(gctx, format.slice(0, 80)).catch(() => null) : null;
    return (
      <GuideStudio
        modeTabs={<StudioMode mode="guide" />}
        concept={fromPlan?.concept ?? fromFormat ?? null}
        guide={fromPlan?.guide ?? null}
        source={fromPlan ? { kind: "plan", planId: plan!, index: Number(i) } : fromFormat ? { kind: "format", name: fromFormat.title } : null}
        missing={Boolean((plan || format) && !fromPlan && !fromFormat)}
      />
    );
  }

  // Build (raw clips → videos → schedule; "Clips to posts" lives inside it now), Edit and Audio.
  if (mode === "clips" || mode === "autopost" || mode === "edit" || mode === "audio") {
    const variant = mode === "edit" ? "edit" : mode === "audio" ? "audio" : "build";
    // A planned post opened in the editor (Dashboard "Yes, open the editor", the Planner): its plan becomes the prompt.
    let fromPlan: { title: string; day: string; prompt: string; from?: "post"; reference?: HandoffReference | null } | null = null;
    if (variant === "edit" && plan && i != null && /^\d{1,2}$/.test(i)) {
      const post = await planPost(await resolveContext(supabase, user.id), plan, Number(i)).catch(() => null);
      // Its Reel goes as the reference video, never into the prompt: the one to film it like, else the one it's built on.
      if (post) fromPlan = { title: planPostTitle(post), day: post.day, prompt: editorBrief(post), reference: referenceOf(sourceOfRef(post.filmRef) ?? sourceOfRef(post.ref)) };
    }
    // A published post's diagnosis (lib/postDiagnosis.ts, "Make a better opening") or an Ask SOCIA script: its brief,
    // as written there, and the reference Reel the person chose in Ask SOCIA when there is one (?refUrl, ?refBy).
    if (variant === "edit" && !fromPlan && brief?.trim()) fromPlan = { title: (about ?? "").trim().slice(0, 80) || "your post", day: "", prompt: brief.trim().slice(0, 1500), from: "post", reference: refUrl ? referenceOf(sourceOfLink(refUrl.slice(0, 400), refBy?.slice(0, 60) ?? null)) : null };
    return (
      <Suspense fallback={null}>
        <ClipsStudio key={variant} viewerId={user.id} modeTabs={<StudioMode mode={variant === "build" ? "clips" : variant} />} variant={variant} fromPlan={fromPlan} />
      </Suspense>
    );
  }

  // Profile, posts and drafts are the active workspace owner's.
  const ctx = await resolveContext(supabase, user.id);
  // A draft of a planned post (from its production guide): checked here, then passed to the review.
  const reviewIdx = plan && i != null && /^\d{1,2}$/.test(i) ? Number(i) : null;
  const reviewFound = plan && reviewIdx != null ? await planConcept(ctx, plan, reviewIdx).catch(() => null) : null;
  const reviewPlan = reviewFound && plan && reviewIdx != null ? { planId: plan, index: reviewIdx, title: reviewFound.concept.title } : null;

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
        plan={reviewPlan}
      />
    </>
  );
}
