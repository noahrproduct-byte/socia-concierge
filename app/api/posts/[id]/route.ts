import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadItem } from "@/lib/publishing/db";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// One item of the active Brand Workspace, read and removed as its owner
// through ctx.client. Any role may read; any role may remove what is not yet
// published (a Member's drafts are theirs to tidy).

// GET one item (legacy calendar rows included, with no destinations).
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { id } = await params;
  const item = await loadItem(ctx.client, id, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ item });
}

// DELETE one item. Anything already published stays in the record.
// Media objects go first so the bucket does not accumulate orphans; the
// destinations go with the parent (on delete cascade).
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { id } = await params;
  const item = await loadItem(ctx.client, id, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (item.status === "published" || item.destinations.some((d) => d.status === "published")) {
    return NextResponse.json({ error: "Published posts stay in the record." }, { status: 409 });
  }
  // Files live under their uploader's folder: the viewer's, or the workspace
  // owner's. Only those are removed, never a path from elsewhere in the bucket.
  const prefixes = [`${ctx.viewerId}/`, `${ctx.ownerId}/`];
  const paths = item.media.map((m) => m.path).filter((p): p is string => Boolean(p) && prefixes.some((x) => (p as string).startsWith(x)));
  if (paths.length) {
    try { await ctx.client.storage.from("scheduled-media").remove(paths); } catch { /* the row still goes */ }
  }
  const { error } = await ctx.client.from("scheduled_posts").delete().eq("id", id).eq("user_id", ctx.ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
