import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadItem } from "@/lib/publishing/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// GET one of my items (legacy calendar rows included, with no destinations).
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const item = await loadItem(supabase, id, user.id);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ item });
}

// DELETE one of my items. Anything already published stays in the record.
// Media objects go first so the bucket does not accumulate orphans; the
// destinations go with the parent (on delete cascade).
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const item = await loadItem(supabase, id, user.id);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (item.status === "published" || item.destinations.some((d) => d.status === "published")) {
    return NextResponse.json({ error: "Published posts stay in the record." }, { status: 409 });
  }
  const prefix = `${user.id}/`;
  const paths = item.media.map((m) => m.path).filter((p): p is string => Boolean(p) && (p as string).startsWith(prefix));
  if (paths.length) {
    try { await supabase.storage.from("scheduled-media").remove(paths); } catch { /* the row still goes */ }
  }
  const { error } = await supabase.from("scheduled_posts").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
