import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Tracked-competitor list management. SOCIA stores handles only — it never
// invents metrics for these accounts (platforms expose none to third parties).

const MAX_TRACKED = 10;
const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;
// YouTube handles/ids allow hyphens and are longer than Instagram's.
const YT_HANDLE_RE = /^[a-zA-Z0-9._-]{1,60}$/;
// A pasted channel URL: youtube.com/@handle, /channel/UC..., /c/name, /user/name
// or a youtu.be link. The first path segment is the handle or channel id.
const YT_URL_RE = /(?:^|\/\/)(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:(?:channel|c|user)\/)?@?([A-Za-z0-9._-]+)/i;
// Path segments that are pages, not channels.
const YT_NOT_A_CHANNEL = /^(watch|shorts|playlist|results|feed|embed|live|hashtag|premium)$/i;
// Channel ids are case-sensitive; handles are stored lowercased.
const YT_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{20,}$/;

/** What the schema stores for a YouTube competitor: the handle without its @,
 *  or the UC... channel id, whichever the user pasted, URL or not. */
function youtubeHandleFrom(raw: string): string {
  const m = YT_URL_RE.exec(raw);
  if (!m) return raw;
  return YT_NOT_A_CHANNEL.test(m[1]) ? "" : m[1];
}

function storedHandle(handle: string, platform: string): string {
  return platform === "youtube" && YT_CHANNEL_ID_RE.test(handle) ? handle : handle.toLowerCase();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const { data, error } = await supabase
      .from("tracked_competitors")
      .select("platform, handle, added_at")
      .eq("user_id", user.id)
      .order("added_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ competitors: data ?? [] });
  } catch {
    // table may not exist yet
    return NextResponse.json({ competitors: [] });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: unknown; platform?: unknown } | null;
  const platform =
    body?.platform === "facebook" ? "facebook"
    : body?.platform === "youtube" ? "youtube"
    : "instagram";
  let handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  if (platform === "youtube") handle = youtubeHandleFrom(handle);
  handle = handle.replace(/^@/, "");
  const valid = platform === "youtube" ? YT_HANDLE_RE.test(handle) : HANDLE_RE.test(handle);
  if (!valid) {
    return NextResponse.json({ error: "That doesn't look like a valid handle." }, { status: 400 });
  }

  const { count } = await supabase
    .from("tracked_competitors")
    .select("handle", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_TRACKED) {
    return NextResponse.json({ error: `You can track up to ${MAX_TRACKED} competitors.` }, { status: 400 });
  }

  const { error } = await supabase
    .from("tracked_competitors")
    .upsert({ user_id: user.id, platform, handle: storedHandle(handle, platform) }, { onConflict: "user_id,platform,handle" });
  if (error) {
    console.error("competitors: add failed:", error.message);
    return NextResponse.json({ error: "Couldn't save right now." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: unknown; platform?: unknown } | null;
  const platform = body?.platform === "facebook" ? "facebook" : body?.platform === "youtube" ? "youtube" : "instagram";
  const handle = typeof body?.handle === "string" ? storedHandle(body.handle.trim().replace(/^@/, ""), platform) : "";
  if (!handle) return NextResponse.json({ error: "handle required." }, { status: 400 });

  const { error } = await supabase
    .from("tracked_competitors")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", platform)
    .eq("handle", handle);
  if (error) {
    console.error("competitors: remove failed:", error.message);
    return NextResponse.json({ error: "Couldn't update right now." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
