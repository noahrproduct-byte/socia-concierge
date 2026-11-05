import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import { markReady, readyState, teamWorkFor, unmarkReady } from "@/lib/teamWorkServer";
import { readyRoleFor } from "@/lib/teamWork";

export const runtime = "nodejs";

// Ready for review (lib/teamWorkServer), on every plan with a team.
//   GET ?post=<id>      -> { role: "mark" | "review" | null, ready }
//   POST { postId, note? } a Member marks a saved draft ready
//   DELETE ?post=<id>   the person who marked it, the owner or an Admin takes the mark off

async function setup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const ctx = await resolveContext(supabase, user.id);
  const svc = await teamWorkFor(ctx);
  if (!svc) return { ctx, svc: null, role: null } as const;
  const ent = await getEntitlements(svc, ctx.ownerId);
  return { ctx, svc, role: readyRoleFor(ctx.role, checkFeature(ent, "approval_workflow").ok) } as const;
}

const postParam = (req: Request) => {
  const id = new URL(req.url).searchParams.get("post");
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};

export async function GET(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  if (!s.svc) return NextResponse.json({ role: null, ready: null });
  const postId = postParam(req);
  return NextResponse.json({ role: s.role, ready: postId ? await readyState(s.svc, s.ctx, postId) : null });
}

export async function POST(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  if (!s.svc) return NextResponse.json({ error: "Ready for review comes with a team on the Starter plan and up." }, { status: 403 });
  if (s.role !== "mark") return NextResponse.json({ error: "Members mark drafts ready. The owner and admins schedule them directly." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { postId?: unknown; note?: unknown } | null;
  const postId = typeof body?.postId === "string" && /^[0-9a-f-]{36}$/i.test(body.postId) ? body.postId : null;
  if (!postId) return NextResponse.json({ error: "Save the post first." }, { status: 400 });
  const r = await markReady(s.svc, s.ctx, postId, body?.note);
  return r.ok ? NextResponse.json({ ready: r.ready }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function DELETE(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  if (!s.svc) return NextResponse.json({ error: "Ready for review comes with a team on the Starter plan and up." }, { status: 403 });
  const postId = postParam(req);
  if (!postId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const r = await unmarkReady(s.svc, s.ctx, postId);
  return r.ok ? NextResponse.json({ ready: null }) : NextResponse.json({ error: r.error }, { status: r.status });
}
