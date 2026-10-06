import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";
import { loadPlanOutcome } from "@/lib/planOutcomesLoad";
import type { Deliverable } from "@/lib/schema";

export const runtime = "nodejs";

// What became of one Content Plan: each planned post's state on the Calendar
// and, once published, how it did against the account's own median.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const { data, error } = await scopeToWorkspace(
    ctx.client.from("plans").select("id, data, created_at").eq("id", id).eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  ).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

  const plan = data as { id: string; data: Deliverable; created_at: string };
  const outcome = await loadPlanOutcome(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, plan);
  return NextResponse.json({ outcome });
}
