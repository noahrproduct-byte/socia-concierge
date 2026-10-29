import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { deleteGoal, listGoals, saveGoal, syncGoalsText } from "@/lib/growthStore";
import { normalizeGoal } from "@/lib/growth";
import { recordStartingPoints } from "@/lib/briefingLoad";

export const runtime = "nodejs";

// The brand's measurable goals. Every change also rewrites the brand's goals
// text, so the plan, Ask, captions and Studio follow the structured goals.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  return NextResponse.json(await listGoals(ctx));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const n = normalizeGoal(body, new Date().toISOString().slice(0, 10));
  if ("error" in n) return NextResponse.json({ error: n.error }, { status: 400 });
  const res = await saveGoal(ctx, n.goal);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  // Where it starts, read now from the connected accounts when it can be.
  const [saved] = await recordStartingPoints(ctx, [{ ...n.goal, id: res.id }]).catch(() => [{ ...n.goal, id: res.id }]);
  await syncGoalsText(ctx).catch(() => undefined);
  return NextResponse.json({ ok: true, id: res.id, baseline: saved.baseline ?? null });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid goal." }, { status: 400 });
  if (!(await deleteGoal(ctx, id))) return NextResponse.json({ error: "Couldn't remove that goal." }, { status: 500 });
  await syncGoalsText(ctx).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
