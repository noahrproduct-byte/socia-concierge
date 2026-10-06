import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY, aiFailureKind } from "@/lib/aiStatus";
import { requireFeature } from "@/lib/planGuard";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { regenerateBuild, accountContext } from "@/lib/studioClips/server";
import { REGENERATE_OPTIONS, type RegenerateDirective } from "@/lib/studioClips/types";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const body = (await req.json().catch(() => null)) as { directive?: string } | null;
  const directive = REGENERATE_OPTIONS.find((o) => o.id === body?.directive)?.id as RegenerateDirective | undefined;
  if (!directive) return NextResponse.json({ error: "Pick one of the regenerate options." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx));
    const build = await regenerateBuild(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, buildId: id, directive, acct });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const msg = (e as Error).message ?? "";
    if (/regenerated .* times/.test(msg) || /not in this project/.test(msg)) return NextResponse.json({ error: msg }, { status: 409 });
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? (msg || "Regenerating failed. Try again.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
