import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import CalendarBoard, { type CalPost, type PublishInfo } from "@/components/CalendarBoard";
import { getIgSnapshot, getActiveConnection } from "@/lib/instagramSync";
import { PUBLISH_SCOPE } from "@/lib/igPublish";
import { serviceConfigured } from "@/lib/supabase/service";
import type { ScheduledPost } from "@/lib/scheduling";

export const metadata = { title: "Calendar — SOCIA" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Real post timestamps + engagement; the client buckets them in the
  // viewer's own time zone.
  let posts: CalPost[] = [];
  let igUsername: string | null = null;
  let connected = false;
  try {
    const snap = await getIgSnapshot(supabase, user.id);
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
  const [{ data: rows }, conn, { data: heartbeat }] = await Promise.all([
    supabase
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: true })
      .limit(400),
    getActiveConnection(supabase, user.id, "ig_user_id, scopes"),
    supabase.from("publisher_heartbeat").select("ran_at").eq("id", 1).maybeSingle(),
  ]);
  const scopes = (conn as { scopes?: unknown } | null)?.scopes;
  const publish: PublishInfo = {
    canPublish: Array.isArray(scopes) ? scopes.includes(PUBLISH_SCOPE) : null,
    configured: serviceConfigured() && Boolean(process.env.CRON_SECRET),
    lastRunAt: (heartbeat as { ran_at?: string } | null)?.ran_at ?? null,
  };

  return (
    <AppShell active="calendar" userEmail={user.email}>
      <CalendarBoard
        posts={posts}
        igUsername={igUsername}
        connected={connected}
        scheduled={(rows ?? []) as ScheduledPost[]}
        userId={user.id}
        publish={publish}
      />
    </AppShell>
  );
}
