import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { scopeToWorkspace } from "@/lib/workspaces";
import { pickAnimatedDays, type PlanDay } from "@/lib/animated/pick";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import type { Deliverable } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Generate animated videos", step one: which of a saved plan's days suit an
// animated video. The plan's own animated posts are picked without asking;
// days turned down, or listed in `skip` (already on the Calendar with
// media), are left out. Nothing is counted against the video allowance.
//   POST { planId, skip?: number[] } -> { days: [{ index, day, animated, planned?, reason }] }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { planId?: unknown; skip?: unknown } | null;
  const planId = typeof b?.planId === "string" && /^[0-9a-f-]{36}$/i.test(b.planId) ? b.planId : null;
  if (!planId) return NextResponse.json({ error: "Say which plan." }, { status: 400 });
  const skip = new Set(Array.isArray(b?.skip) ? (b.skip as unknown[]).filter((n): n is number => Number.isInteger(n)) : []);
  const limited = await perUserLimit(ctx.ownerId, "animated_pick", 20, "week checks");
  if (limited) return limited;
  const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data").eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
  const week = (data as { data: Deliverable } | null)?.data?.weeklyPlan;
  if (!week) return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });
  const open = week
    .map((p, index) => ({ p, index }))
    .filter(({ p, index }) => p.decision?.status !== "rejected" && !skip.has(index) && (p.hook?.trim() || p.concept?.trim()));
  // The plan's animated posts were written for this: picked without asking the model.
  const planned = open.filter(({ p }) => p.animated).map(({ p, index }) => ({ index, day: p.day, animated: true, planned: true, reason: "Planned as an animated video." }));
  const days: PlanDay[] = open
    .filter(({ p }) => !p.animated)
    .slice(0, 7)
    .map(({ p, index }) => ({ index, day: p.day, title: p.title, hook: p.hook ?? "", concept: p.concept ?? "", format: p.format, direction: p.direction }));
  if (!days.length) return NextResponse.json({ days: planned });
  try {
    const picks = await pickAnimatedDays(ctx, days);
    return NextResponse.json({ days: [...planned, ...picks.map((x) => ({ ...x, day: week[x.index].day }))] });
  } catch (e) {
    console.error("[animated/week/pick]", (e as Error)?.message ?? e);
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? "SOCIA couldn't read the week. Try again." : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
