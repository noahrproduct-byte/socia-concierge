import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { freshDetail } from "@/lib/intel/understandLoad";
import { saveAnimatedFit, scanAnimatedFit } from "@/lib/animated/fit";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Post animated videos": the brand's choice and SOCIA's scan of whether it suits the account.
//   GET  -> { on, fit }
//   POST -> runs the scan and saves it -> { on, fit }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const a = (await freshDetail(ctx).catch(() => ({}))) as { animated?: { on?: boolean; fit?: unknown } };
  return NextResponse.json({ on: a.animated?.on ?? false, fit: a.animated?.fit ?? null });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const limited = await perUserLimit(ctx.ownerId, "animated_fit", 10, "account checks");
  if (limited) return limited;
  try {
    const fit = await scanAnimatedFit(ctx);
    if (!(await saveAnimatedFit(ctx, fit))) return NextResponse.json({ error: "SOCIA checked the account but couldn't save the result. Try again." }, { status: 500 });
    const a = (await freshDetail(ctx).catch(() => ({}))) as { animated?: { on?: boolean } };
    return NextResponse.json({ on: a.animated?.on ?? false, fit });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 600) return NextResponse.json({ error: (e as Error).message }, { status });
    console.error("[animated/fit]", (e as Error)?.message ?? e);
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? "SOCIA couldn't check the account. Try again." : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
