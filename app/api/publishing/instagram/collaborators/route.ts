import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { checkCollaborators } from "@/lib/publishing/collaborators";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { accountId, usernames } — check Collab-post collaborators with
// Instagram for one connected account of the active workspace's owner, using
// unpublished test containers (nothing is posted). Returns a
// CollaboratorsCheck the composer stores on the destination.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { accountId?: unknown; usernames?: unknown } | null;
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const usernames = Array.isArray(body?.usernames) ? body!.usernames.filter((u): u is string => typeof u === "string") : [];
  if (!accountId) return NextResponse.json({ error: "accountId required." }, { status: 400 });

  // Instagram has to fetch the test image, so it must be a public address: the
  // site's own origin, or the production domain when running locally.
  const origin = new URL(req.url).origin;
  const publicOrigin = /localhost|127\.0\.0\.1/.test(origin) ? "https://sociaos.com" : origin;
  const result = await checkCollaborators(ctx.client, { ownerId: ctx.ownerId, igUserId: accountId, usernames, imageUrl: `${publicOrigin}/collab-check.jpg` });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
