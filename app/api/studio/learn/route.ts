import { NextResponse } from "next/server";
import { studioRequest, isMissingTable } from "@/lib/studioClips/auth";
import { loadStudioOutcomes } from "@/lib/studioClips/learnLoad";
import { studioLessons } from "@/lib/studioClips/learn";

export const runtime = "nodejs";

// GET [?project=id] — Learn: the Content Studio posts in this workspace that
// became posts, their state and results against the account's own median,
// and the lessons the settled ones support. Read-only, every plan.
export async function GET(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const projectId = new URL(req.url).searchParams.get("project") ?? undefined;
  try {
    const outcomes = await loadStudioOutcomes(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, { projectId });
    return NextResponse.json({ outcomes, lessons: studioLessons(outcomes) });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ outcomes: [], lessons: studioLessons([]) });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
