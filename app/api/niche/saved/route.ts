import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, type Ctx } from "@/lib/context";
import type { NichePost } from "@/lib/nicheTrends";

export const runtime = "nodejs";

// Saved niche posts. Discovery prunes its content after two weeks, so a save
// keeps the post's own snapshot (the public numbers as read at that time)
// under the workspace owner's key in the shared niche_trends cache. No new
// table. The key carries the owner's id and its RLS is owner-scoped, so a
// guest in someone else's workspace reads and writes it through ctx.client
// (the service client); the owner goes through their own session as before.

const MAX = 60;
type SavedDoc = { v: 1; items: NichePost[] };

async function read(client: Ctx["client"], ownerId: string): Promise<SavedDoc> {
  try {
    const { data } = await client.from("niche_trends").select("data").eq("niche", `saved:${ownerId}`).maybeSingle();
    const doc = data?.data as SavedDoc | undefined;
    if (doc?.v === 1 && Array.isArray(doc.items)) return doc;
  } catch { /* none yet */ }
  return { v: 1, items: [] };
}

async function write(client: Ctx["client"], ownerId: string, doc: SavedDoc): Promise<boolean> {
  const { error } = await client.from("niche_trends").upsert({ niche: `saved:${ownerId}`, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
  return !error;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  return NextResponse.json(await read(ctx.client, ctx.ownerId));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const body = (await req.json().catch(() => null)) as { item?: NichePost } | null;
  const item = body?.item;
  if (!item?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });
  const doc = await read(ctx.client, ctx.ownerId);
  if (!doc.items.some((x) => x.url === item.url)) {
    doc.items = [{ ...item, why: item.why ?? null }, ...doc.items].slice(0, MAX);
    if (!(await write(ctx.client, ctx.ownerId, doc))) return NextResponse.json({ error: "Couldn't save right now." }, { status: 500 });
  }
  return NextResponse.json(doc);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });
  const doc = await read(ctx.client, ctx.ownerId);
  doc.items = doc.items.filter((x) => x.url !== body.url);
  if (!(await write(ctx.client, ctx.ownerId, doc))) return NextResponse.json({ error: "Couldn't update right now." }, { status: 500 });
  return NextResponse.json(doc);
}
