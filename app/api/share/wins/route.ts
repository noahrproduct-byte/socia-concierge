import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { loadWins } from "@/lib/share/server";

export const runtime = "nodejs";

// Recent posts that did clearly better than this account's usual post, each
// with a link to an image the person can save and share (lib/share).
//   GET -> { wins: [{ postId, title, multiple, platform, publishedAt, image }] }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const wins = await loadWins(ctx).catch(() => []);
  return NextResponse.json({ wins: wins.map((w) => ({ ...w, image: `/api/share/result?post=${encodeURIComponent(w.postId)}` })) });
}
