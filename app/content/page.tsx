import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import { postCards } from "@/lib/overview";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ContentHome from "@/components/ContentHome";
import type { LibraryPost } from "@/components/ContentLibrary";

export const metadata = { title: "Content — SOCIA" };

// Content: the library of what the account has published. Same rows and the
// same baseline as Analytics; nothing here is estimated.
export default async function ContentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const snap = await getIgSnapshot(supabase, user.id);
  const media: IgMediaItem[] = snap?.media ?? [];
  if (!snap || snap.followers_count == null) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    return (
      <AppShell active="content" userEmail={user.email}>
        <PageHeader title="Content" sub="Every post you publish, with the numbers Instagram returns for it." />
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect your Instagram account</h2>
            <p>Your posts appear here with views, reach, likes, comments, saves and shares the moment an account is connected.</p>
          </div>
          <Link href={igHref} className="db-connect-cta">Connect Instagram</Link>
        </div>
      </AppShell>
    );
  }

  const followers = snap.followers_count ?? null;
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  const medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));
  const library: LibraryPost[] = posts.map((p) => ({
    id: p.id, caption: p.caption, published: p.published, format: p.format, views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares,
    engagements: p.engagements, engRate: p.reach ? (p.engagements / p.reach) * 100 : followers ? (p.engagements / followers) * 100 : null, multiplier: p.multiplier, thumb: p.thumb, permalink: p.permalink,
  }));

  return (
    <AppShell active="content" userEmail={user.email}>
      <ContentHome posts={posts} library={library} baseline={baseline} medianViews={medianViews} handle={snap.username ?? null} />
    </AppShell>
  );
}
