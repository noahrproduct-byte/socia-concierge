import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, forbiddenCopy } from "@/lib/context";
import { setTaskStatus, teamWorkFor, unassignTask } from "@/lib/teamWorkServer";

export const runtime = "nodejs";

// One plan task (lib/teamWorkServer).
//   PATCH { status: "done" | "open", note? }  the person it's for, the owner or an Admin
//   DELETE                                    owner or Admin takes it back

async function setup(params: Promise<{ id: string }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: "Invalid request." }, { status: 400 }) } as const;
  const ctx = await resolveContext(supabase, user.id);
  const svc = await teamWorkFor(ctx);
  if (!svc) return { error: NextResponse.json({ error: "Handing out videos comes with a team on the Starter plan and up." }, { status: 403 }) } as const;
  return { ctx, svc, id } as const;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await setup(params);
  if ("error" in s) return s.error;
  const body = (await req.json().catch(() => null)) as { status?: unknown; note?: unknown } | null;
  if (body?.status !== "done" && body?.status !== "open") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const r = await setTaskStatus(s.svc, s.ctx, s.id, body.status, body.note);
  return r.ok ? NextResponse.json({ task: r.task }) : NextResponse.json({ error: r.error }, { status: r.status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await setup(params);
  if ("error" in s) return s.error;
  const ok = await unassignTask(s.svc, s.ctx, s.id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: forbiddenCopy("assign_work") }, { status: 403 });
}
