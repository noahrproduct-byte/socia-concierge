import { NextResponse } from "next/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { resolveMediaUrl } from "@/lib/audio/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 150 * 1024 * 1024;

// GET /api/studio/audio/media?id=<mediaId> — streams one post's file to the
// browser for measurement. Not an open proxy: the id must be a row of the
// signed-in owner's audio_media (their own posts, or a competitor's public
// post from Business Discovery), and the link is Instagram's own CDN URL.
export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  try {
    const src = await resolveMediaUrl(r.ctx.client, r.ctx.ownerId, id);
    if (!src) return NextResponse.json({ error: "That post's file isn't available to measure." }, { status: 404 });
    const upstream = await fetch(src, { redirect: "follow", headers: { accept: "video/*,*/*" } }).catch(() => null);
    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "The link to this video has expired. Sync Instagram to refresh it." }, { status: 410 });
    }
    const len = Number(upstream.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return NextResponse.json({ error: "This video is too large to measure here." }, { status: 413 });
    const headers = new Headers({ "content-type": upstream.headers.get("content-type") ?? "video/mp4", "cache-control": "private, no-store" });
    if (len) headers.set("content-length", String(len));
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
