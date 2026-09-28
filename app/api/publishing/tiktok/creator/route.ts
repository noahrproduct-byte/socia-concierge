import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tiktokAccessToken } from "@/lib/tiktokData";
import { TT_API } from "@/lib/tiktokAuth";
import { canPublishDirect, canUpload } from "@/lib/publishing/adapters/tiktok";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The composer's TikTok options for the active Brand Workspace's account:
// whether its grant can post directly (or only upload to the inbox) and, for
// direct posts, TikTok's creator_info: the visibility options it offers, which
// interactions the creator has switched off, and the longest video they may
// post. The token is the workspace owner's, used here and never returned.
// TikTok requires this query before every direct post; the adapter runs it
// again at publish time, so a stale answer here can never post the wrong settings.

type CreatorInfo = {
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const auth = await tiktokAccessToken(ctx.client, ctx.ownerId);
  if (!auth) return NextResponse.json({ error: "TikTok is not connected." }, { status: 404 });
  if (!canUpload(auth.scopes)) {
    return NextResponse.json({ error: "Reconnect TikTok to allow uploads.", code: "needs_scope" }, { status: 409 });
  }
  const direct = canPublishDirect(auth.scopes);
  if (!direct) {
    return NextResponse.json({ direct: false, privacyOptions: [], commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDurationSec: null });
  }

  const res = await fetch(`${TT_API}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json; charset=UTF-8" },
    body: "{}",
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "TikTok could not be reached." }, { status: 502 });
  const j = (await res.json().catch(() => null)) as { data?: CreatorInfo; error?: { code?: string; message?: string } } | null;
  if (!res.ok || (j?.error?.code && j.error.code !== "ok")) {
    const code = j?.error?.code ?? String(res.status);
    if (res.status === 401 || code === "access_token_invalid" || code === "scope_not_authorized") {
      return NextResponse.json({ error: "Reconnect TikTok to allow uploads.", code: "needs_scope" }, { status: 409 });
    }
    return NextResponse.json({ error: j?.error?.message || `TikTok returned ${res.status}.`, code }, { status: 502 });
  }
  const d = j?.data ?? {};
  return NextResponse.json({
    direct: true,
    privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
    commentDisabled: Boolean(d.comment_disabled),
    duetDisabled: Boolean(d.duet_disabled),
    stitchDisabled: Boolean(d.stitch_disabled),
    maxDurationSec: typeof d.max_video_post_duration_sec === "number" ? d.max_video_post_duration_sec : null,
  });
}
