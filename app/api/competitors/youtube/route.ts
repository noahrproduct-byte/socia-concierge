import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveChannel, recentVideos, uploadsPerWeek, publicEngagementRate, ytConfigured } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 30;

// Public YouTube stats for the user's tracked channels. Genuinely public data
// from YouTube's official API — the same numbers any visitor sees. Fields
// Google omits come back null so the UI can render "—" instead of a guess.

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!ytConfigured()) return NextResponse.json({ configured: false, channels: [] });

  const one = new URL(req.url).searchParams.get("handle");
  let handles: string[] = [];
  if (one) {
    handles = [one];
  } else {
    try {
      const { data } = await supabase
        .from("tracked_competitors")
        .select("handle")
        .eq("user_id", user.id)
        .eq("platform", "youtube");
      handles = (data ?? []).map((r: { handle: string }) => r.handle);
    } catch {
      handles = [];
    }
  }
  if (!handles.length) return NextResponse.json({ configured: true, channels: [] });

  const channels = await Promise.all(
    handles.slice(0, 10).map(async (h) => {
      const ch = await resolveChannel(h);
      if (!ch) return { handle: h, found: false as const };
      const vids = ch.uploadsPlaylist ? await recentVideos(ch.uploadsPlaylist, 10) : [];
      const views = vids.map((v) => v.views).filter((v): v is number => v != null).sort((a, b) => a - b);
      const medianViews = views.length
        ? views.length % 2
          ? views[Math.floor(views.length / 2)]
          : (views[views.length / 2 - 1] + views[views.length / 2]) / 2
        : null;
      return {
        handle: h,
        found: true as const,
        channelId: ch.channelId,
        title: ch.title,
        avatar: ch.avatar,
        url: `https://youtube.com/channel/${ch.channelId}`,
        subscribers: ch.subscribers,
        lifetimeViews: ch.views,
        videoCount: ch.videoCount,
        uploadsPerWeek: uploadsPerWeek(vids),
        engagementRate: publicEngagementRate(vids),
        medianViews,
        topVideos: [...vids]
          .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
          .slice(0, 3)
          .map((v) => ({ ...v, url: `https://youtube.com/watch?v=${v.videoId}` })),
      };
    }),
  );

  return NextResponse.json({ configured: true, channels });
}
