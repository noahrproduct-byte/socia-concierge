import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getAlerts, unreadAlertCount, markAlertsRead, dismissAlert, alertsEnabled } from "@/lib/alerts";

export const runtime = "nodejs";

// The active workspace's alerts, for the bell.
//   GET  -> { enabled, alerts, unread }
//   POST { action: "read", ids? }  mark some/all read
//        { action: "dismiss", id } remove one from the feed
//
// Alerts belong to the workspace owner; a member reads and marks them through
// their own session (RLS allows it). Everything is scoped to ctx.ownerId.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await alertsEnabled(supabase))) return NextResponse.json({ enabled: false, alerts: [], unread: 0 });

  const ctx = await resolveContext(supabase, user.id);
  const [alerts, unread] = await Promise.all([
    getAlerts(supabase, ctx.ownerId, 20),
    unreadAlertCount(supabase, ctx.ownerId),
  ]);
  return NextResponse.json({ enabled: true, alerts, unread: unread ?? 0 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await alertsEnabled(supabase))) return NextResponse.json({ ok: true });

  const ctx = await resolveContext(supabase, user.id);
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: unknown; id?: unknown } | null;

  if (body?.action === "read") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : undefined;
    const ok = await markAlertsRead(supabase, ctx.ownerId, ids);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Couldn't update." }, { status: 500 });
  }
  if (body?.action === "dismiss" && typeof body.id === "string") {
    const ok = await dismissAlert(supabase, ctx.ownerId, body.id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Couldn't dismiss." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
