import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { acceptInvite, inviteByToken, teamEnabled, ACCEPT_FAILURE_COPY } from "@/lib/team";
import { setActiveWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

// POST -> accept the invite as the signed-in user, within the OWNER's seat
// limit (atomic in the database), then make that workspace the active one.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to accept this invite." }, { status: 401 });
  if (!(await teamEnabled(supabase))) return NextResponse.json({ error: "Team features are not available yet." }, { status: 409 });

  const inv = await inviteByToken(supabase, token);
  if (!inv) return NextResponse.json({ error: ACCEPT_FAILURE_COPY.invite_invalid, reason: "invite_invalid" }, { status: 404 });

  // The seat limit is the owner's plan.
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: ACCEPT_FAILURE_COPY.not_configured, reason: "not_configured" }, { status: 503 });
  const ownerEnt = await getEntitlements(svc, inv.ownerId);
  const limit = getLimit(ownerEnt, "team_members");

  const res = await acceptInvite(token, user.id, limit);
  if (!res.ok) {
    const status = res.reason === "seat_limit" ? 403 : res.reason === "not_configured" ? 503 : 400;
    return NextResponse.json({ error: ACCEPT_FAILURE_COPY[res.reason], reason: res.reason }, { status });
  }

  // Land them in the workspace they just joined.
  await setActiveWorkspace(supabase, res.workspaceId);
  return NextResponse.json({ ok: true, workspaceId: res.workspaceId, workspaceName: inv.workspaceName, role: res.role });
}
