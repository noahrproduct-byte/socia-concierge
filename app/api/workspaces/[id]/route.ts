import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setActiveWorkspace, updateWorkspace, deleteWorkspace, getWorkspace, workspacesEnabled } from "@/lib/workspaces";

export const runtime = "nodejs";

// One workspace.
//   PATCH { name?, active? } -> rename and/or make it the active workspace
//   DELETE                   -> remove it (and, by cascade, the accounts in it)

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await workspacesEnabled(supabase))) return NextResponse.json({ error: "Workspaces are not available yet." }, { status: 409 });

  const ws = await getWorkspace(supabase, user.id, id);
  if (!ws) return NextResponse.json({ error: "That workspace does not exist." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; active?: unknown } | null;

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Give the workspace a name." }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    const ok = await updateWorkspace(supabase, user.id, id, { name });
    if (!ok) return NextResponse.json({ error: "Couldn't rename the workspace." }, { status: 500 });
  }

  if (body?.active === true) {
    const res = await setActiveWorkspace(supabase, id);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await workspacesEnabled(supabase))) return NextResponse.json({ error: "Workspaces are not available yet." }, { status: 409 });

  const res = await deleteWorkspace(supabase, user.id, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
