import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { perUserLimit } from "@/lib/rateLimit";
import { loadWins } from "@/lib/share/server";
import { resultCard } from "@/lib/share/card";

export const runtime = "nodejs";

// A shareable image for one of the person's own posts that beat their usual
// result (lib/share). 1080 x 1350, the 4:5 shape feeds and stories take. It
// carries the multiple, what it is a multiple of, the date, the post's first
// line and a small SOCIA mark. Only the account that published the post can
// ask for it, and only once the result is real and settled.
//   GET ?post=<id> -> image/png
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("post") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Say which post." }, { status: 400 });
  const limited = await perUserLimit(user.id, "share_image", 60, "share images");
  if (limited) return limited;
  const ctx = await resolveContext(supabase, user.id);
  const [win] = await loadWins(ctx, { only: id, limit: 1 }).catch(() => []);
  if (!win) return NextResponse.json({ error: "This post has no result to share yet." }, { status: 404 });
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const brand = (profile?.brand_name ?? "").trim().slice(0, 40);
  return resultCard(win, brand);
}
