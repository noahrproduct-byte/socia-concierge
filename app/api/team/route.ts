import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { requireFeature, deny } from "@/lib/planGuard";
import { limitError } from "@/lib/planErrors";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { listWorkspaces } from "@/lib/workspaces";
import { teamEnabled, listMembers, listInvites, seatsUsed, createInvite, type MemberRole } from "@/lib/team";

export const runtime = "nodejs";

// The team of the ACTIVE workspace.
//   GET  -> { enabled, workspace, role, members, invites, seats: { used, limit }, canInvite }
//   POST { role: "admin" | "member", email? } -> a new invite link (owner/admin, within the owner's seats)

function inviteUrl(origin: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || origin;
  return `${base}/invite/${token}`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await teamEnabled(supabase))) return NextResponse.json({ enabled: false });

  const ctx = await resolveContext(supabase, user.id);
  const ws = ctx.workspace;
  if (!ws) return NextResponse.json({ enabled: true, workspace: null });

  const [ownerEnt, members, invites, owned] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    listMembers(supabase, ws.id),
    can(ctx, "invite") ? listInvites(supabase, ws.id) : Promise.resolve([]),
    ctx.isOwner ? listWorkspaces(supabase, user.id) : Promise.resolve([]),
  ]);
  const limit = getLimit(ownerEnt, "team_members");
  const used = ctx.isOwner ? await seatsUsed(supabase, owned.map((w) => w.id), user.id) : null;

  return NextResponse.json({
    enabled: true,
    workspace: { id: ws.id, name: ws.name },
    role: ctx.role,
    planName: ownerEnt.config.name,
    members,
    invites: invites.map((i) => ({ ...i, token: undefined })),
    seats: { used, limit },
    canInvite: can(ctx, "invite") && ownerEnt.config.features.team,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await teamEnabled(supabase))) {
    return NextResponse.json({ error: "SOCIA's database needs the team migration before invites can be created." }, { status: 409 });
  }

  const ctx = await resolveContext(supabase, user.id);
  const ws = ctx.workspace;
  if (!ws) return NextResponse.json({ error: "Create a Brand Workspace first." }, { status: 400 });
  if (!can(ctx, "invite")) return NextResponse.json({ error: forbiddenCopy("invite") }, { status: 403 });

  // The feature and the seats are the OWNER's.
  const g = await requireFeature(ctx.client, ctx.ownerId, "team");
  if (g.denied) return g.denied;

  const body = (await req.json().catch(() => null)) as { role?: unknown; email?: unknown } | null;
  const role: MemberRole = body?.role === "admin" ? "admin" : "member";
  const email = typeof body?.email === "string" ? body.email.slice(0, 200) : null;

  // Seat pre-check so the link is not handed out when nobody could accept it.
  // The atomic check happens again at accept time.
  const limit = getLimit(g.ent, "team_members");
  const owned = await listWorkspaces(ctx.client, ctx.ownerId);
  const used = await seatsUsed(ctx.client, owned.map((w) => w.id), ctx.ownerId);
  if (used != null && used >= limit) {
    return deny(limitError(g.ent.plan, "team_members", limit, used));
  }

  const res = await createInvite(supabase, ws.id, role, user.id, email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ ok: true, invite: { ...res.invite, token: undefined, url: inviteUrl(origin, res.invite.token) } });
}
