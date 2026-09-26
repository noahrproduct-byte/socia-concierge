import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { recordEvent } from "@/lib/planGuard";
import { limitError } from "@/lib/planErrors";
import {
  workspacesEnabled, listWorkspaces, getActiveWorkspace, createWorkspace, activeWorkspaces,
} from "@/lib/workspaces";

export const runtime = "nodejs";

// Brand Workspaces for the signed-in user.
//   GET  -> { enabled, workspaces, activeId, limit, used, planName, canCreate }
//   POST { name } -> create one within the plan limit (atomic, service role)
//
// When the migration has not run yet, GET returns { enabled: false } and POST
// answers 409 so the UI can stay quiet rather than pretend.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await workspacesEnabled(supabase))) return NextResponse.json({ enabled: false });

  const [ent, list, active] = await Promise.all([
    getEntitlements(supabase, user.id),
    listWorkspaces(supabase, user.id),
    getActiveWorkspace(supabase, user.id),
  ]);
  const limit = getLimit(ent, "workspaces");
  const used = activeWorkspaces(list).length;
  return NextResponse.json({
    enabled: true,
    planName: ent.config.name,
    limit,
    used,
    canCreate: used < limit,
    activeId: active?.id ?? null,
    workspaces: list.map((w) => ({
      id: w.id,
      name: w.name,
      isDefault: w.isDefault,
      suspended: w.suspended,
      active: active?.id === w.id,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!(await workspacesEnabled(supabase))) {
    return NextResponse.json({ error: "SOCIA's database needs the workspaces migration before this can be saved." }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the workspace a name." }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "That name is too long." }, { status: 400 });

  const ent = await getEntitlements(supabase, user.id);
  const limit = getLimit(ent, "workspaces");
  const res = await createWorkspace(user.id, name, limit);
  if (!res.ok) {
    if (res.reason === "limit") {
      recordEvent(supabase, user.id, "feature_locked", { limit: "workspaces", plan: ent.plan });
      return NextResponse.json(limitError(ent.plan, "workspaces", limit), { status: 403 });
    }
    if (res.reason === "not_configured") return NextResponse.json({ error: res.error }, { status: 503 });
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
