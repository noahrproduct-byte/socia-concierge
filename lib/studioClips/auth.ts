// Request plumbing shared by the Build-from-Clips routes: who is asking, in
// which workspace, and whether their role may change things.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";

export type StudioRequest = { ok: true; ctx: Ctx; viewerId: string } | { ok: false; res: NextResponse };

export async function studioRequest(): Promise<StudioRequest> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const ctx = await resolveContext(supabase, user.id);
  return { ok: true, ctx, viewerId: user.id };
}

/** Creating projects, adding clips, running analysis, editing and exporting make drafts: every role in the workspace (BUG-26). Scheduling stays "publish". */
export function requireMutate(ctx: Ctx): NextResponse | null {
  return can(ctx, "draft") ? null : NextResponse.json({ error: forbiddenCopy("draft") }, { status: 403 });
}

/** Postgres "relation does not exist": supabase/studio.sql has not been run. */
export const isMissingTable = (e: unknown): boolean => /relation .* does not exist|PGRST205|Could not find the table/i.test((e as Error)?.message ?? String(e));

export const MIGRATION_HINT = "Build from Clips needs its database tables. Run supabase/studio.sql in the Supabase SQL editor.";
