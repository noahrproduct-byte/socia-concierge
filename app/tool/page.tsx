import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ContentPlanClient, { type PlanContext } from "@/components/ContentPlanClient";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { GenerateInput } from "@/lib/schema";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { resolveContext, brandWorkspace, type Ctx } from "@/lib/context";
import { competitorScopeId } from "@/lib/workspaces";

export const metadata = { title: "Content Plan — SOCIA" };

const engOf = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Rows on file that the generator attaches to the brief by itself. Counted
 *  here so the form can say so truthfully; zero when a table doesn't exist. */
async function evidenceCounts(supabase: Ctx["client"], userId: string, workspaceId?: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (workspaceId ? q.eq("workspace_id", workspaceId) : q);
  const count = async (table: string) => {
    try {
      const { count, error } = await scope(supabase
        .from(table)
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId));
      return error ? 0 : count ?? 0;
    } catch {
      return 0;
    }
  };
  // Competitors paused by a plan downgrade are not attached to the brief, so
  // they are not counted. The column is new: fall back to all rows when the
  // database has not been migrated yet.
  const countActiveTracked = async () => {
    try {
      const { count, error } = await scope(supabase
        .from("tracked_competitors")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true));
      if (!error) return count ?? 0;
    } catch {
      /* column may not exist yet */
    }
    return count("tracked_competitors");
  };
  const [discovered, tracked, winning] = await Promise.all([
    count("discovered_accounts"),
    countActiveTracked(),
    count("discovered_content"),
  ]);
  return { competitors: Math.min(discovered, 10) + tracked, winning: Math.min(winning, 12) };
}

export default async function ContentPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Everything below reads the active Brand Workspace's owner (the viewer,
  // unless they were invited into someone else's workspace).
  const ctx = await resolveContext(supabase, user.id);

  // Prefill everything SOCIA already knows (all best-effort).
  let brandName: string | null = null;
  let niche: string | null = null;
  let nicheDetected = false;
  let goal: string | null = null;
  let platform: string | null = null;
  const brandWs = brandWorkspace(ctx);
  try {
    const { data: prof } = await ctx.client
      .from("profiles")
      .select("brand_name, niche, niche_detail, goals, platforms")
      .eq("user_id", ctx.ownerId)
      .maybeSingle();
    // Brand fields come from a non-default workspace; platforms is per-user.
    brandName = brandWs ? brandWs.brand_name : (prof?.brand_name ?? null);
    niche = brandWs ? brandWs.niche : (prof?.niche ?? null);
    nicheDetected = Boolean(brandWs ? brandWs.niche_detail : prof?.niche_detail);
    goal = brandWs ? brandWs.goals : (prof?.goals ?? null);
    platform = (Array.isArray(prof?.platforms) && prof.platforms[0]) || null;
  } catch {
    // profile columns may be mid-migration; the form still works blank
  }

  const snap = await getIgSnapshot(ctx.client, ctx.ownerId);
  const media = snap?.media ?? [];
  const engRate =
    snap?.followers_count && media.length
      ? ((avg(media.map(engOf)) / snap.followers_count) * 100).toFixed(1) + "%"
      : null;

  // Entitlements are the workspace owner's: a member's plans count against
  // the owner's allowance.
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id);
  const [counts, ent] = await Promise.all([evidenceCounts(ctx.client, ctx.ownerId, cwid), getEntitlements(ctx.client, ctx.ownerId)]);
  const evidence = { posts: Math.min(media.length, 25), ...counts };
  // Drafts are always saved; whether they can publish themselves is a plan question.
  const canSchedule = canUseFeature(ent, "scheduling");

  // Recent posts and competitors are attached server-side with real numbers
  // when the account is connected; the fields become optional extra notes.
  const prefill: GenerateInput = {
    clientHandle: brandName || snap?.name || (snap?.username ? `@${snap.username}` : ""),
    niche: niche ?? "",
    platform: platform || "Instagram",
    brandVoice: "",
    recentPosts: "",
    competitors: "",
    goal: goal ?? "",
  };

  const autoNotes: PlanContext["autoNotes"] = {};
  if (prefill.clientHandle)
    autoNotes.clientHandle = brandName ? "From your profile" : "From your connected account";
  if (prefill.niche)
    autoNotes.niche = nicheDetected ? "Detected from your content" : "From your profile";
  if (prefill.goal) autoNotes.goal = "From your profile";

  const context: PlanContext = {
    prefill,
    autoNotes,
    connected: Boolean(snap),
    username: snap?.username ?? null,
    syncedAgo: snap?.last_synced_at ? ago(snap.last_synced_at) : null,
    postsAnalyzed: snap ? media.length : null,
    engRate,
    posts: media.filter((m) => m.timestamp).map((m) => ({ t: m.timestamp!, e: engOf(m) })),
    evidence,
  };

  return (
    <AppShell active="tool" userEmail={user.email}>
      <ContentPlanClient context={context} canSchedule={canSchedule} />
    </AppShell>
  );
}
