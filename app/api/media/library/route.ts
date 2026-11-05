import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { listClipsForLibrary } from "@/lib/clipper/server";
import { listGenerationsForLibrary } from "@/lib/generation/server";
import { aiErrorResponse } from "@/lib/aiStudio/auth";

export const runtime = "nodejs";

// GET -> { clips, generations }: the owner's AI media library (finished clips and generations, newest first).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const wsId = ctx.workspace?.id ?? null;
    const [clips, generations] = await Promise.all([
      canUseFeature(ent, "ai_clipper") ? listClipsForLibrary(ctx.client, ctx.ownerId, wsId) : Promise.resolve([]),
      canUseFeature(ent, "ai_studio") ? listGenerationsForLibrary(ctx.client, ctx.ownerId, wsId) : Promise.resolve([]),
    ]);
    return NextResponse.json({ clips, generations });
  } catch (e) {
    return aiErrorResponse("media/library", e);
  }
}
