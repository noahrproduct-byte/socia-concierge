import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { readOnboarding, saveOnboarding } from "@/lib/growthStore";
import { isStep, resumeStep } from "@/lib/onboarding";

export const runtime = "nodejs";

// Where this brand's setup stands, and saving it a step at a time.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { tableReady, row } = await readOnboarding(ctx);
  return NextResponse.json({ tableReady, step: resumeStep(row), completed: Boolean(row?.completed_at), answers: row?.answers ?? {} });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  let body: { step?: unknown; mark?: unknown; completed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.step != null && !isStep(body.step)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  // Bookkeeping flags only (booleans), never free-form data.
  const mark: Record<string, boolean> = {};
  if (body.mark && typeof body.mark === "object") {
    for (const [k, v] of Object.entries(body.mark as Record<string, unknown>)) if (/^[a-z_]{1,40}$/.test(k) && typeof v === "boolean") mark[k] = v;
  }
  const res = await saveOnboarding(ctx, { step: isStep(body.step) ? body.step : undefined, mark, completed: body.completed === true });
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 503 });
}
