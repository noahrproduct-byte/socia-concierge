import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace, type Ctx } from "@/lib/context";
import type { NichePost } from "@/lib/nicheTrends";

export const runtime = "nodejs";

// Saved niche posts. Discovery prunes its content after two weeks, so a save
// keeps the post's own snapshot (the public numbers as read at that time)
// in the shared niche_trends cache. No new table. The key embeds the SCOPE id:
// the owner's id for the default workspace (so existing saves are preserved),
// or the workspace id for a second brand — so each brand keeps its own saves.
// The owner goes through their own session; a guest through ctx.client.

const MAX = 60;
type SavedDoc = { v: 1; items: NichePost[] };

// The default workspace keeps the owner-keyed row (existing data); a non-default
// workspace gets its own key.
const scopeKey = (ctx: Ctx): string => brandWorkspace(ctx)?.id ?? ctx.ownerId;

async function read(client: Ctx["client"], scopeId: string): Promise<SavedDoc> {
  try {
    const { data } = await client.from("niche_trends").select("data").eq("niche", `saved:${scopeId}`).maybeSingle();
    const doc = data?.data as SavedDoc | undefined;
    if (doc?.v === 1 && Array.isArray(doc.items)) return doc;
  } catch { /* none yet */ }
  return { v: 1, items: [] };
}

async function write(client: Ctx["client"], scopeId: string, doc: SavedDoc): Promise<boolean> {
  const { error } = await client.from("niche_trends").upsert({ niche: `saved:${scopeId}`, data: doc, updated_at: new Date().toISOString() }, { onConflict: "niche" });
  return !error;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  return NextResponse.json(await read(ctx.client, scopeKey(ctx)));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const body = (await req.json().catch(() => null)) as { item?: NichePost } | null;
  const item = body?.item;
  if (!item?.url) return NextResponse.json({ error: "No post given." }, { status: 400 });
  const doc = await read(ctx.client, scopeKey(ctx));
  if (!doc.items.some((x) => x.url === item.url)) {
    doc.items = [{ ...item, why: item.why ?? null }, ...doc.items].slice(0, MAX);
    if (!(await write(ctx.client, scopeKey(ctx), doc))) return NextResponse.json({ error: "Couldn't save right now." }, { status: 500 });
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
  const doc = await read(ctx.client, scopeKey(ctx));
  doc.items = doc.items.filter((x) => x.url !== body.url);
  if (!(await write(ctx.client, scopeKey(ctx), doc))) return NextResponse.json({ error: "Couldn't update right now." }, { status: 500 });
  return NextResponse.json(doc);
}
