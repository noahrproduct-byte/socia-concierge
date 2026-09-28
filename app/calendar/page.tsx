import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import CalendarBoard, { type CalPost, type CalItem, type CalDestination, type PublishInfo } from "@/components/CalendarBoard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIgSnapshot, getActiveConnection } from "@/lib/instagramSync";
import { PUBLISH_SCOPE } from "@/lib/igPublish";
import { serviceConfigured } from "@/lib/supabase/service";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import type { ScheduledPost } from "@/lib/scheduling";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { PLANS, type PlanId } from "@/lib/plans";
import type { PlanError } from "@/lib/planErrors";

export const metadata = { title: "Calendar — SOCIA" };

/** A Member's answer in the shape the board already renders for a plan answer:
 *  the sentence, then one quiet link. Publishing is owner/admin only. */
function roleNotice(plan: PlanId): PlanError {
  return {
    error: forbiddenCopy("publish"),
    code: "feature_locked", plan, planName: PLANS[plan].name,
    requiredPlan: null, requiredPlanName: null,
    cta: "Workspace settings", href: "/settings",
  };
}

type DestinationRow = {
  id: string;
  post_id: string;
  platform: CalDestination["platform"];
  account_id: string;
  status: CalDestination["status"];
  scheduled_at: string | null;
  error_message: string | null;
  permalink: string | null;
};

/** The destinations of these posts, grouped by post id. Before the publishing
 *  migration the table does not exist (42P01 / PGRST205 / "schema cache"):
 *  that, like any other failure here, yields no destinations and every row
 *  renders through the legacy Instagram path. */
async function loadDestinations(supabase: SupabaseClient, userId: string, postIds: string[]): Promise<Map<string, CalDestination[]>> {
  const out = new Map<string, CalDestination[]>();
  if (!postIds.length) return out;
  try {
    const { data, error } = await supabase
      .from("post_destinations")
      .select("id, post_id, platform, account_id, status, scheduled_at, error_message, permalink")
      .eq("user_id", userId)
      .in("post_id", postIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error || !data) return out;
    for (const r of data as DestinationRow[]) {
      const d: CalDestination = {
        id: r.id, postId: r.post_id, platform: r.platform, accountId: r.account_id, status: r.status,
        scheduledAt: r.scheduled_at, errorMessage: r.error_message, permalink: r.permalink,
      };
      out.set(r.post_id, [...(out.get(r.post_id) ?? []), d]);
    }
  } catch {
    // no destinations: the calendar still renders every row
  }
  return out;
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // The active Brand Workspace: its owner's data, read through ctx.client.
  const ctx = await resolveContext(supabase, user.id);

  // Real post timestamps + engagement; the client buckets them in the
  // viewer's own time zone.
  let posts: CalPost[] = [];
  let igUsername: string | null = null;
  let connected = false;
  try {
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId);
    connected = Boolean(snap);
    igUsername = snap?.username ?? null;
    posts = (snap?.media ?? [])
      .filter((m) => m.timestamp)
      .map((m) => ({ t: m.timestamp!, e: (m.like_count ?? 0) + (m.comments_count ?? 0) }));
  } catch {
    // the calendar renders without audience intelligence
  }

  // The user's queue (recent past kept so published/failed posts stay visible)
  // and what we know about whether the publisher can actually post.
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: rows }, conn, { data: heartbeat }, ent] = await Promise.all([
    ctx.client
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", ctx.ownerId)
      .neq("status", "cancelled")
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: true })
      .limit(400),
    getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id, scopes"),
    ctx.client.from("publisher_heartbeat").select("ran_at").eq("id", 1).maybeSingle(),
    getEntitlements(ctx.client, ctx.ownerId),
  ]);
  const scopes = (conn as { scopes?: unknown } | null)?.scopes;
  // The owner's plan decides whether anything can leave the calendar at all,
  // and then the viewer's role (a Member keeps drafts; owner/admin publish).
  // The server enforces both in the schedule and publish routes, this only explains.
  const scheduling = checkFeature(ent, "scheduling");
  const roleOk = can(ctx, "publish");
  const publish: PublishInfo = {
    canPublish: Array.isArray(scopes) ? scopes.includes(PUBLISH_SCOPE) : null,
    configured: serviceConfigured() && Boolean(process.env.CRON_SECRET),
    lastRunAt: (heartbeat as { ran_at?: string } | null)?.ran_at ?? null,
    canSchedule: scheduling.ok && roleOk,
    planError: !scheduling.ok ? scheduling.error : roleOk ? null : roleNotice(ent.plan),
  };

  // Multi-destination items carry their destination rows; legacy rows carry none.
  const scheduledRows = (rows ?? []) as ScheduledPost[];
  const destinations = await loadDestinations(ctx.client, ctx.ownerId, scheduledRows.map((r) => r.id));
  const scheduled: CalItem[] = scheduledRows.map((r) => {
    const ds = destinations.get(r.id);
    return ds ? { ...r, destinations: ds } : r;
  });

  return (
    <AppShell active="calendar" userEmail={user.email}>
      <CalendarBoard
        posts={posts}
        igUsername={igUsername}
        connected={connected}
        scheduled={scheduled}
        userId={user.id}
        publish={publish}
      />
    </AppShell>
  );
}
