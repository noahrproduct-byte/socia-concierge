import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import CalendarBoard, { type CalPost } from "@/components/CalendarBoard";
import { getIgSnapshot } from "@/lib/instagramSync";

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

  return (
    <AppShell active="calendar" userEmail={user.email}>
      <CalendarBoard posts={posts} igUsername={igUsername} connected={connected} />
    </AppShell>
  );
}
