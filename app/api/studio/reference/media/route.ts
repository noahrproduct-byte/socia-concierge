import { NextResponse } from "next/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { verifyRefUrl } from "@/lib/studioClips/refToken";
import { fetchAllowed, isPlatformMediaUrl } from "@/lib/fetchGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 150 * 1024 * 1024;

// GET /api/studio/reference/media?url=<cdn url>&token=<signature> — streams a
// competitor's Reel to the browser, where the Build tab reads it as the
// reference for the person's own version. Not an open proxy: the link must
// be one the Discover page offered this viewer (its signature), on Instagram's
// or Facebook's CDN on every redirect; nothing is stored.
export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const sp = new URL(req.url).searchParams;
  const url = sp.get("url") ?? "", token = sp.get("token") ?? "";
  if (!url || !token || !isPlatformMediaUrl(url) || !verifyRefUrl(r.viewerId, url, token)) return NextResponse.json({ error: "That video isn't available as a reference." }, { status: 404 });
  try {
    const upstream = await fetchAllowed(url, isPlatformMediaUrl, { headers: { accept: "video/*,*/*" } });
    if (!upstream || !upstream.ok || !upstream.body) return NextResponse.json({ error: "The link to this Reel has expired. Open Discover again to refresh it." }, { status: 410 });
    const len = Number(upstream.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return NextResponse.json({ error: "This Reel is too large to read here." }, { status: 413 });
    const type = upstream.headers.get("content-type") ?? "video/mp4";
    const headers = new Headers({
      "content-type": /^(video|audio)\/[\w.+-]+$/i.test(type.split(";")[0].trim()) ? type : "application/octet-stream",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    });
    if (len) headers.set("content-length", String(len));
    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    console.error("[studio/reference/media]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't read that Reel just now." }, { status: 500 });
  }
}
