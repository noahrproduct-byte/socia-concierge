import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { setInsightStatus } from "@/lib/intel/insightStore";

export const runtime = "nodejs";

// Dismiss a finding, mark it resolved, or bring it back.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== "dismissed" && status !== "resolved" && status !== "active") return NextResponse.json({ error: "Status must be dismissed, resolved or active." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid finding." }, { status: 400 });
  if (!(await setInsightStatus(ctx, id, status))) return NextResponse.json({ error: "That finding wasn't found in this brand." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
