import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can } from "@/lib/context";
import { assignTask, listTasks, teamWorkFor, workspacePeople } from "@/lib/teamWorkServer";

export const runtime = "nodejs";

// The weekly plan's videos handed to people (lib/teamWorkServer).
//   GET ?plan=<id> -> { enabled, canAssign, people, tasks }  one plan's tasks and who can take them
//   POST { planId, itemId, assigneeId, dueOn?, note? } -> { task }  owner or Admin hands a plan post to someone

async function setup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const ctx = await resolveContext(supabase, user.id);
  return { ctx, svc: await teamWorkFor(ctx), email: user.email ?? null } as const;
}

export async function GET(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  const planId = new URL(req.url).searchParams.get("plan");
  if (!s.svc || !planId) return NextResponse.json({ enabled: false, canAssign: false, people: [], tasks: [] });
  const [people, tasks] = await Promise.all([workspacePeople(s.svc, s.ctx, s.email), listTasks(s.svc, s.ctx, { planId })]);
  return NextResponse.json({ enabled: true, canAssign: can(s.ctx, "assign_work"), people, tasks });
}

export async function POST(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  if (!s.svc) return NextResponse.json({ error: "Handing out videos comes with a team on the Starter plan and up." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const r = await assignTask(s.svc, s.ctx, { planId: body.planId, itemId: body.itemId, assigneeId: body.assigneeId, dueOn: body.dueOn, note: body.note });
  return r.ok ? NextResponse.json({ task: r.task }) : NextResponse.json({ error: r.error }, { status: r.status });
}
