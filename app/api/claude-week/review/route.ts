import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements } from "@/lib/entitlements";
import { ApiFailure } from "@/lib/api/context";
import { reviewVideos } from "@/lib/claudeWeek/server";
import { errorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

// POST { post_ids, action: "approve" | "reject", note? }: the owner or an Admin
// reviews videos their Claude handed in for the weekly plan (lib/claudeWeek).
// Approving schedules each at its planned time (or 15 minutes from now when that
// has passed); sending back keeps it as a draft with the note for Claude.
const STATUS: Record<string, number> = { forbidden: 403, invalid_input: 400, not_found: 404, limited: 429, unavailable: 503 };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { post_ids?: unknown; action?: unknown; note?: unknown } | null;
  const ids = Array.isArray(body?.post_ids) ? body!.post_ids.filter((x): x is string => typeof x === "string") : [];
  if (body?.action !== "approve" && body?.action !== "reject") return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  try {
    const ctx = await resolveContext(supabase, user.id);
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const results = await reviewVideos(ctx, ent, { post_ids: ids, action: body.action, note: typeof body.note === "string" ? body.note : null });
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof ApiFailure) return NextResponse.json({ error: e.message, code: e.code }, { status: STATUS[e.code] ?? 400 });
    return errorResponse("claude-week/review", e);
  }
}
