import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow, clipRows, loadBuild, buildOpportunity, accountContext } from "@/lib/studioClips/server";
import { AnalysisError } from "@/lib/studioClips/analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

// One post opportunity's build (EDL + edit guide).
//   GET  -> StudioBuild | 404 when not built yet
//   POST -> builds it (once; later calls return the saved build). Covered by
//           the project's clip-build credit; no extra meter in Phase A.

async function load(idParam: string, idxParam: string) {
  const idx = Number(idxParam);
  const r = await studioRequest();
  if (!r.ok) return { res: r.res } as const;
  if (!Number.isInteger(idx) || idx < 0) return { res: NextResponse.json({ error: "Unknown post." }, { status: 400 }) } as const;
  const project = await getProjectRow(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null, idParam);
  if (!project) return { res: NextResponse.json({ error: "That project does not exist." }, { status: 404 }) } as const;
  if (!project.yield?.opportunities.some((o) => o.idx === idx)) return { res: NextResponse.json({ error: "That post is not in this project's results." }, { status: 404 }) } as const;
  return { r, idx, project } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await params;
  try {
    const l = await load(id, idx);
    if ("res" in l) return l.res;
    const build = await loadBuild(l.r.ctx.client, l.project.id, l.idx, await clipRows(l.r.ctx.client, l.project.id));
    if (!build) return NextResponse.json({ error: "Not built yet." }, { status: 404 });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; idx: string }> }) {
  const { id, idx } = await params;
  try {
    const l = await load(id, idx);
    if ("res" in l) return l.res;
    const { ctx } = l.r;
    const forbidden = requireMutate(ctx);
    if (forbidden) return forbidden;
    const existing = await loadBuild(ctx.client, l.project.id, l.idx, await clipRows(ctx.client, l.project.id));
    if (existing) return NextResponse.json(existing);
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null);
    const build = await buildOpportunity(ctx.client, { ownerId: ctx.ownerId, wsId: ctx.workspace?.id ?? null, project: l.project, idx: l.idx, acct });
    return NextResponse.json(build);
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const msg = e instanceof AnalysisError ? `${e.message} Try again.` : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
