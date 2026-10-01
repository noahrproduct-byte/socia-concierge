import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { scopeToWorkspace, isMissingColumnError } from "@/lib/workspaces";

export const runtime = "nodejs";

// List the active workspace's saved chats (newest first). The explicit
// user_id filter matters: a member reads through the service-role client,
// where Row Level Security does not narrow the rows for them.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ conversations: [] });
    const ctx = await resolveContext(supabase, user.id);

    const wsId = ctx.workspace?.id;
    const run = (scoped: boolean) => {
      const q = ctx.client.from("conversations").select("id, title, messages, updated_at").eq("user_id", ctx.ownerId);
      return (scoped ? scopeToWorkspace(q, wsId) : q).order("updated_at", { ascending: false }).limit(30);
    };
    let { data, error } = await run(true);
    // workspace_id column may not exist yet (migration not run): fall back to the
    // per-user history. Only for a missing column — a transient error must not
    // widen the read to the owner's other workspaces.
    if (error && wsId && isMissingColumnError(error)) ({ data, error } = await run(false));

    if (error) return NextResponse.json({ conversations: [] });
    return NextResponse.json({ conversations: data ?? [] });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}

// Create or update a conversation. Returns its id.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Chats are saved to the active workspace owner's history.
  const ctx = await resolveContext(supabase, user.id);

  let body: { id?: string; title?: string; messages?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const now = new Date().toISOString();

  try {
    if (body.id) {
      const applyUpdate = (scoped: boolean) => {
        const q = ctx.client
          .from("conversations")
          .update({ title: body.title ?? null, messages: body.messages ?? [], updated_at: now })
          .eq("id", body.id)
          .eq("user_id", ctx.ownerId);
        return scoped ? scopeToWorkspace(q, ctx.workspace?.id) : q;
      };
      let { error } = await applyUpdate(true);
      if (error && ctx.workspace && isMissingColumnError(error)) ({ error } = await applyUpdate(false)); // column not migrated yet
      if (error) throw error;
      return NextResponse.json({ id: body.id });
    } else {
      const rowBase = { user_id: ctx.ownerId, title: body.title ?? null, messages: body.messages ?? [], updated_at: now };
      let { data, error } = ctx.workspace
        ? await ctx.client.from("conversations").insert({ ...rowBase, workspace_id: ctx.workspace.id }).select("id").single()
        : await ctx.client.from("conversations").insert(rowBase).select("id").single();
      if (error && ctx.workspace && isMissingColumnError(error)) ({ data, error } = await ctx.client.from("conversations").insert(rowBase).select("id").single()); // column not migrated yet
      if (error || !data) throw error ?? new Error("Couldn't save.");
      return NextResponse.json({ id: data.id });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Couldn't save.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
