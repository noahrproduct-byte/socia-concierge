import { NextResponse } from "next/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { PLATFORM_NAME, parseVideoLink, unstudiedWhy } from "@/lib/studioClips/videoLink";
import type { ReelSource } from "@/lib/studioClips/referenceSource";

export const runtime = "nodejs";
export const maxDuration = 20;

// A video from TikTok, YouTube or Facebook pasted as the Video editor's reference (Noah, 2026-11-25). Instagram
// Reels go to app/api/studio/reference/reel, which can fetch the video itself. For the others SOCIA reads only what
// the platform publishes for embedding (its public oEmbed: the title, the creator, the cover), never the video,
// so the editor can name what the person meant and ask for the file to study its footage.
//   GET ?link=<video link> -> { reel, why, platform }   (reel is null when the platform publishes nothing)

const OEMBED: Partial<Record<"tiktok" | "youtube", (link: string) => string>> = {
  tiktok: (link) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`,
  youtube: (link) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`,
};

const text = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, n) : null);
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) ? v.slice(0, 1000) : null);

export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const parsed = parseVideoLink(new URL(req.url).searchParams.get("link") ?? "");
  if (!parsed) return NextResponse.json({ error: "Paste a link to a video on Instagram, TikTok, YouTube or Facebook, or upload the file.", code: "bad_link" }, { status: 400 });
  if (parsed.platform === "instagram") return NextResponse.json({ error: "Instagram links are read through /api/studio/reference/reel.", code: "instagram" }, { status: 400 });
  const limited = await perUserLimit(r.ctx.ownerId, "reference_video", 30, "video look-ups");
  if (limited) return limited;

  const why = unstudiedWhy(parsed.platform);
  const bare: ReelSource = { link: parsed.link, code: `${parsed.platform}:${parsed.id}`, handle: parsed.handle ?? null, account: null, thumb: null, caption: null, format: PLATFORM_NAME[parsed.platform], views: null, multiplier: null };
  const endpoint = parsed.platform === "tiktok" || parsed.platform === "youtube" ? OEMBED[parsed.platform]!(parsed.link) : null;
  if (!endpoint) return NextResponse.json({ reel: bare, why, platform: parsed.platform });
  try {
    // A fixed endpoint on the platform's own host; the pasted link is only a parameter to it.
    const res = await fetch(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ reel: bare, why: `${PLATFORM_NAME[parsed.platform]} didn't find that video (it may be private or removed). ${why}`, platform: parsed.platform });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const authorUrl = typeof j?.author_url === "string" ? j.author_url : "";
    const handle = /tiktok\.com\/@([\w.]{1,40})/i.exec(authorUrl)?.[1] ?? /youtube\.com\/@([\w.-]{1,40})/i.exec(authorUrl)?.[1] ?? null;
    const reel: ReelSource = {
      ...bare,
      handle: handle ? handle.toLowerCase() : bare.handle,
      account: text(j?.author_name, 80),
      thumb: httpsUrl(j?.thumbnail_url),
      caption: text(j?.title, 300),
    };
    return NextResponse.json({ reel, why, platform: parsed.platform });
  } catch {
    return NextResponse.json({ reel: bare, why, platform: parsed.platform });
  }
}
