import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ContentLibrary, { type LibraryPost } from "@/components/ContentLibrary";
import { getIgSnapshot } from "@/lib/instagramSync";
import { getPerformanceBaseline, type AccountInput } from "@/lib/dashboardMetrics";
import { engagementOf } from "@/lib/metrics";

export const metadata = { title: "Content — SOCIA" };

// Every published post SOCIA has synced, with the real metrics Instagram
// returned for each. No estimates: unavailable fields render as "—".
export default async function ContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);
  const media = snap?.media ?? [];
  const acct: AccountInput = {
    followers: snap?.followers_count ?? null,
    lifetimePosts: snap?.media_count ?? null,
    posts: media,
    daily: [],
    syncedAt: snap?.last_synced_at ?? null,
    platform: "instagram",
    handle: snap?.username ?? null,
  };
  const baseline = getPerformanceBaseline(acct).value;

  const posts: LibraryPost[] = media
    .filter((m) => m.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .map((m, i) => {
      const e = engagementOf(m);
      const reach = m.insights?.reach ?? null;
      return {
        id: m.id ?? String(i),
        caption: (m.caption || "").split("\n")[0].trim(),
        published: m.timestamp!,
        format: m.media_type === "VIDEO" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Post",
        views: m.insights?.views ?? null,
        reach,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        saves: m.insights?.saved ?? null,
        shares: m.insights?.shares ?? null,
        engagements: e,
        engRate: reach && reach > 0 ? (e / reach) * 100 : null,
        multiplier: baseline && baseline > 0 ? e / baseline : null,
        thumb: m.thumbnail_url || m.media_url || null,
        permalink: m.permalink ?? null,
      };
    });

  return (
    <AppShell active="content" userEmail={user.email}>
      <div className="dsh-head">
        <div>
          <h1>Content</h1>
          <p>
            Every post SOCIA has synced from{" "}
            {snap?.username ? <b>@{snap.username}</b> : "your account"}, with the metrics Instagram
            actually returned.
          </p>
        </div>
        {snap?.username && (
          <a
            className="dsh-cta"
            href={`https://instagram.com/${snap.username}`}
            target="_blank"
            rel="noreferrer"
          >
            Open profile <ExternalLink size={12} />
          </a>
        )}
      </div>

      {posts.length ? (
        <ContentLibrary posts={posts} />
      ) : (
        <div className="dsh-panel">
          <p className="dsh-empty">
            No content synced yet. <Link href="/settings" className="dsh-link">Connect Instagram</Link>{" "}
            and hit Sync now.
          </p>
        </div>
      )}
    </AppShell>
  );
}
