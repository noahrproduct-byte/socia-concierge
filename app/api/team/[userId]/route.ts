import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { listMembers, removeMember, setMemberRole, teamEnabled, type MemberRole } from "@/lib/team";

export const runtime = "nodejs";

// One member of the ACTIVE workspace.
//   PATCH { role } -> change their role (owner only)
//   DELETE         -> remove them (owner: anyone; admin: members only; anyone: themselves)

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await teamEnabled(supabase))) return NextResponse.json({ error: "Team features are not available yet." }, { status: 409 });

  const ctx = await resolveContext(supabase, user.id);
  if (!ctx.workspace) return NextResponse.json({ error: "No active workspace." }, { status: 400 });
  if (!can(ctx, "change_role")) return NextResponse.json({ error: forbiddenCopy("change_role") }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { role?: unknown } | null;
  const role: MemberRole | null = body?.role === "admin" ? "admin" : body?.role === "member" ? "member" : null;
  if (!role) return NextResponse.json({ error: "Role must be admin or member." }, { status: 400 });

  const ok = await setMemberRole(supabase, ctx.workspace.id, userId, role);
  if (!ok) return NextResponse.json({ error: "Couldn't change the role." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await teamEnabled(supabase))) return NextResponse.json({ error: "Team features are not available yet." }, { status: 409 });

  const ctx = await resolveContext(supabase, user.id);
  if (!ctx.workspace) return NextResponse.json({ error: "No active workspace." }, { status: 400 });

  const self = userId === user.id;
  if (!self) {
    if (!can(ctx, "remove_member")) return NextResponse.json({ error: forbiddenCopy("remove_member") }, { status: 403 });
    // An admin may remove members, never other admins.
    if (ctx.role === "admin") {
      const target = (await listMembers(supabase, ctx.workspace.id)).find((m) => m.userId === userId);
      if (target?.role === "admin") return NextResponse.json({ error: "Only the workspace owner can remove an admin." }, { status: 403 });
    }
  }
  // Owner and self go through the session (RLS allows both); an admin removing a member goes through the server.
  const ok = await removeMember(supabase, ctx.workspace.id, userId, !self && ctx.role === "admin");
  if (!ok) return NextResponse.json({ error: "Couldn't remove that person." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
