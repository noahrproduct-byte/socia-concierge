import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ContentPlanClient, { type PlanContext } from "@/components/ContentPlanClient";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { GenerateInput } from "@/lib/schema";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";

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
async function evidenceCounts(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const count = async (table: string) => {
    try {
      const { count, error } = await supabase
        .from(table)
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId);
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
      const { count, error } = await supabase
        .from("tracked_competitors")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true);
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

  // Prefill everything SOCIA already knows (all best-effort).
  let brandName: string | null = null;
  let niche: string | null = null;
  let nicheDetected = false;
  let goal: string | null = null;
  let platform: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("brand_name, niche, niche_detail, goals, platforms")
      .eq("user_id", user.id)
      .maybeSingle();
    brandName = prof?.brand_name ?? null;
    niche = prof?.niche ?? null;
    nicheDetected = Boolean(prof?.niche_detail);
    goal = prof?.goals ?? null;
    platform = (Array.isArray(prof?.platforms) && prof.platforms[0]) || null;
  } catch {
    // profile columns may be mid-migration; the form still works blank
  }

  const snap = await getIgSnapshot(supabase, user.id);
  const media = snap?.media ?? [];
  const engRate =
    snap?.followers_count && media.length
      ? ((avg(media.map(engOf)) / snap.followers_count) * 100).toFixed(1) + "%"
      : null;

  const [counts, ent] = await Promise.all([evidenceCounts(supabase, user.id), getEntitlements(supabase, user.id)]);
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
