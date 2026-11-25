import { NextResponse } from "next/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { trendingPool } from "@/lib/discoverTrending";
import { reelKey } from "@/lib/discoverStyle";
import { signRefUrl } from "@/lib/studioClips/refToken";
import { isPlatformMediaUrl } from "@/lib/fetchGuard";
import { cleanHandle, parseReelLink, type ReelSource } from "@/lib/studioClips/referenceSource";

export const runtime = "nodejs";
export const maxDuration = 60;

// A Reel as a reference for the Video editor (Noah, 2026-11-25): from its link (and its account, when the link
// doesn't carry it), find the Reel through Instagram's official Business Discovery read and answer with a link
// SOCIA serves for its video (app/api/studio/reference/media), plus what the platform published about it.
// Nothing is downloaded or kept here; ?fresh=1 reads the account again when an earlier video link expired.
//   GET ?link=<reel link>&handle=<account>&fresh=1 -> { reel, media } | { error, code }
export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const sp = new URL(req.url).searchParams;
  const parsed = parseReelLink(sp.get("link") ?? "");
  if (!parsed) return NextResponse.json({ error: "Paste an Instagram Reel link (instagram.com/reel/…).", code: "bad_link" }, { status: 400 });
  const limited = await perUserLimit(r.ctx.ownerId, "reference_reel", 30, "Reel look-ups");
  if (limited) return limited;

  // Whose Reel it is: the link, what the person typed, or a Reel SOCIA has already read.
  let handle = parsed.handle ?? cleanHandle(sp.get("handle"));
  if (!handle) {
    const known = (await trendingPool().catch(() => [])).find((x) => reelKey(x.url) === parsed.code);
    handle = known?.accountHandle ? cleanHandle(known.accountHandle) : null;
  }
  if (!handle) return NextResponse.json({ error: "Whose Reel is it? Add the account name, for example @salvospizza.", code: "need_handle" }, { status: 422 });

  const res = await igCompetitorRows(r.ctx.client, r.ctx.ownerId, [handle], sp.get("fresh") === "1", { max: 1 }).catch(() => null);
  if (!res?.enabled) return NextResponse.json({ error: "SOCIA can't read Instagram accounts right now (it needs a linked Facebook Page). Upload the Reel as a file instead.", code: "ig_off" }, { status: 503 });
  const acct = res.competitors[0];
  if (!acct?.found) return NextResponse.json({ error: `Instagram didn't share @${handle}'s Reels (it has to be a public Business or Creator account). Upload the Reel as a file instead.`, code: "not_found" }, { status: 404 });
  const post = (acct.media ?? []).find((m) => reelKey(m.permalink) === parsed.code);
  const reel: ReelSource = {
    link: post?.permalink ?? parsed.link, code: parsed.code, handle, account: acct.displayName ?? `@${handle}`,
    thumb: post?.thumbnail ?? null, caption: post?.caption ? post.caption.split("\n")[0].slice(0, 300) : null, format: "Reel",
    views: post?.views ?? null, multiplier: null,
  };
  if (!post) return NextResponse.json({ reel, error: `That Reel isn't among @${handle}'s last 30 posts, which is all Instagram shares. Upload it as a file instead.`, code: "too_old" }, { status: 404 });
  // Meta's Business Discovery leaves media_url out when the media "contains copyrighted material or has been
  // flagged for a copyright violation" (its IG Media reference), which covers Reels with licensed music.
  const token = post.video && isPlatformMediaUrl(post.video) ? signRefUrl(r.viewerId, post.video) : null;
  if (!token) return NextResponse.json({ reel, error: "Instagram found this Reel but kept its video file back, as it does for Reels with copyrighted material such as licensed music. Save it (Instagram's share menu has Download when the creator allows it, or screen record it) and upload the file, and SOCIA studies its length, pace and shots; otherwise the cut follows your prompt.", code: "no_video" }, { status: 404 });
  return NextResponse.json({ reel, media: `/api/studio/reference/media?url=${encodeURIComponent(post.video!)}&token=${token}` });
}
