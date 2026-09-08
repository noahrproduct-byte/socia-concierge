import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { NichePost } from "@/lib/nicheTrends";

export const runtime = "nodejs";

// Saved niche posts. Discovery prunes its content after two weeks, so a save
// keeps the post's own snapshot (the public numbers as read at that time)
// under the user's key in the shared niche_trends cache. No new table.

const MAX = 60;
type SavedDoc = { v: 1; items: NichePost[] };

async function read(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<SavedDoc> {
  try {
    const { data } = await supabase.from("niche_trends").select("data").eq("niche", `saved:${userId}`).maybeSingle();
    const doc = data?.data as SavedDoc | undefined;
    if (doc?.v === 1 && Array.isArray(doc.items)) return doc;
  } catch { /* none yet */ }
  return { v: 1, items: [] };
}

async function write(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, doc: SavedDoc): Promise<boolean> {
  const { error } = await supabase.from("niche_trends").upsert({ niche: `saved:${userId}`, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
  return !error;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await read(supabase, user.id));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { item?: NichePost } | null;
  const item = body?.item;
  if (!item?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });
  const doc = await read(supabase, user.id);
  if (!doc.items.some((x) => x.url === item.url)) {
    doc.items = [{ ...item, why: item.why ?? null }, ...doc.items].slice(0, MAX);
    if (!(await write(supabase, user.id, doc))) return NextResponse.json({ error: "Couldn't save right now." }, { status: 500 });
  }
  return NextResponse.json(doc);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });
  const doc = await read(supabase, user.id);
  doc.items = doc.items.filter((x) => x.url !== body.url);
  if (!(await write(supabase, user.id, doc))) return NextResponse.json({ error: "Couldn't update right now." }, { status: 500 });
  return NextResponse.json(doc);
}
