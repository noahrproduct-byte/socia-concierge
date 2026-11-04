import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { readAutoSetting, writeAutoSetting } from "@/lib/commentAuto";

export const runtime = "nodejs";

// Automatic comment replies for this brand (lib/commentAuto.ts).
//   GET            -> { setting: { enabled, enabledAt } | null } (null before comment-auto.sql)
//   POST { enabled } -> turn on or off. Owner or Admin, Growth and up. Turning
//                    it on answers only comments made from now on.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  return NextResponse.json({ setting: await readAutoSetting(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null) });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (!canUseFeature(ent, "comment_replies")) return NextResponse.json({ error: "AI comment replies are on Growth and up." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "Say whether to turn it on or off." }, { status: 400 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "Automatic replies aren't set up on this server yet." }, { status: 503 });
  const setting = await writeAutoSetting(svc, ctx.ownerId, ctx.workspace?.id ?? null, ctx.viewerId, body.enabled);
  if (!setting) return NextResponse.json({ error: "SOCIA couldn't save that. Automatic replies need a database update (supabase/comment-auto.sql)." }, { status: 503 });
  return NextResponse.json({ setting });
}
