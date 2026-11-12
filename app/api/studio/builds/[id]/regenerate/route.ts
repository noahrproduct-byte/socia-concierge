import { NextResponse } from "next/server";
import { isEditStyle } from "@/lib/studioClips/profiles";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { aiFailure } from "@/lib/anthropic";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { regenerateBuild, accountContext, isManualBuild } from "@/lib/studioClips/server";
import { REGENERATE_OPTIONS, type RegenerateDirective } from "@/lib/studioClips/types";
import { publicMessage } from "@/lib/dbError";
import { handOverCut } from "@/lib/studioClips/cutMeter";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST { directive } — a new cut for the same post with one change asked for
// (faster, more energetic, more professional, shorter, different hook, use
// different clips). Capped per build (MAX_REGENERATIONS); the previous cut
// goes to history, so Undo gets it back.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { directive?: string; style?: unknown } | null;
  // "restyle" makes it again in the editing style named with it (lib/studioClips/profiles.ts).
  const directive = (body?.directive === "restyle" ? "restyle" : REGENERATE_OPTIONS.find((o) => o.id === body?.directive)?.id) as RegenerateDirective | undefined;
  if (!directive) return NextResponse.json({ error: "Pick one of the regenerate options." }, { status: 400 });
  const style = isEditStyle(body?.style) ? body.style : undefined;
  if (directive === "restyle" && !style) return NextResponse.json({ error: "Pick an editing style." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  try {
    if (await isManualBuild(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, id)) return NextResponse.json({ error: "Your own edit has no AI rewrite. Edit it directly." }, { status: 400 });
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    // The new cut comes back to the browser: the build counts (once) if it hadn't yet.
    const handed = await handOverCut(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, { id, opportunity_idx: 0 });
    if (!handed.ok) return handed.res;
    const limited = await perUserLimit(ctx.ownerId, "clip_edl", 40, "video edits");
    if (limited) return limited;
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null);
    const build = await regenerateBuild(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, buildId: id, directive, acct, style });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const msg = publicMessage("studio/builds/regenerate", e, "");
    if (/regenerated .* times/.test(msg) || /not in this project/.test(msg)) return NextResponse.json({ error: msg }, { status: 409 });
    const kind = aiFailure("studio/builds/regenerate", e);
    return NextResponse.json({ error: kind === "failed" ? (msg || "Regenerating failed. Try again.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
