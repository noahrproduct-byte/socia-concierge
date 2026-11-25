import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { loadDiscoverData } from "@/lib/discoverData";
import { getIgSnapshot } from "@/lib/instagramSync";
import { signRefUrl } from "@/lib/studioClips/refToken";
import { isPlatformMediaUrl } from "@/lib/fetchGuard";

export const runtime = "nodejs";
export const maxDuration = 30;

// A Reel link pasted into the Video editor as the reference.
//   POST { url } -> { url, name }: a link SOCIA serves (app/api/studio/reference/media), signed for this viewer
// SOCIA doesn't scrape Instagram, so a link works when the Reel is one SOCIA already reads through
// official data: the brand's own Reels and the Reels on its Discover page (competitors, the niche,
// trending). Anything else gets an honest answer and the way to use it anyway: upload the file.

const SHORTCODE = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,40})/i;
const codeOf = (u: string | null | undefined) => (u ? u.match(SHORTCODE)?.[1] ?? null : null);
const NOT_FOUND = "SOCIA can only read a Reel it already reaches through Instagram's official data: your own Reels and the ones on your Discover page. Download this one and upload the file instead.";

export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx, viewerId } = r;
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const raw = typeof body?.url === "string" ? body.url.trim().slice(0, 500) : "";
  if (!raw) return NextResponse.json({ error: "Paste a Reel link." }, { status: 400 });
  const code = codeOf(raw);
  if (!code) return NextResponse.json({ error: "That isn't an Instagram Reel link. Paste one like instagram.com/reel/…, or upload the video as a file." }, { status: 400 });

  const serve = (video: string, name: string) => {
    const token = signRefUrl(viewerId, video);
    if (!token) return null;
    return NextResponse.json({ url: `/api/studio/reference/media?url=${encodeURIComponent(video)}&token=${token}`, name });
  };

  try {
    // The brand's own Reels first: their files come with the account's own data.
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
    const own = (snap?.media ?? []).find((m) => codeOf(m.permalink) === code && m.media_url && isPlatformMediaUrl(m.media_url));
    if (own?.media_url) {
      const out = serve(own.media_url, `${snap?.username ? `@${snap.username}` : "your"} Reel.mp4`);
      if (out) return out;
    }
    // Then every Reel the Discover page holds for this brand.
    const supabase = await createClient();
    const d = await loadDiscoverData(supabase, { id: viewerId });
    const lists = [d.reelsToCopy, d.nicheReels, d.styleReels, d.recommended, d.trending];
    for (const list of lists) {
      const hit = (list ?? []).find((x) => codeOf(x.url) === code);
      if (!hit) continue;
      if (!hit.video || !isPlatformMediaUrl(hit.video)) {
        return NextResponse.json({ error: "Instagram doesn't give SOCIA this Reel's video file, only its numbers. Download it and upload the file instead." }, { status: 404 });
      }
      const out = serve(hit.video, `${hit.accountHandle ? `@${hit.accountHandle}` : hit.accountName} ${hit.format}.mp4`);
      if (out) return out;
    }
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  } catch (e) {
    console.error("[studio/reference/link]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't look that Reel up just now. Try again, or upload the file." }, { status: 500 });
  }
}
