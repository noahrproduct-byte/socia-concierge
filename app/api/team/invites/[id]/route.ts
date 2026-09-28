import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { revokeInvite, teamEnabled } from "@/lib/team";

export const runtime = "nodejs";

// DELETE -> revoke a pending invite of the ACTIVE workspace (owner/admin).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await teamEnabled(supabase))) return NextResponse.json({ error: "Team features are not available yet." }, { status: 409 });

  const ctx = await resolveContext(supabase, user.id);
  if (!ctx.workspace) return NextResponse.json({ error: "No active workspace." }, { status: 400 });
  if (!can(ctx, "invite")) return NextResponse.json({ error: forbiddenCopy("invite") }, { status: 403 });

  const ok = await revokeInvite(supabase, ctx.workspace.id, id);
  if (!ok) return NextResponse.json({ error: "Couldn't cancel that invite." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
