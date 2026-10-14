import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleWorkspaces } from "@/lib/workspaces";
import { audit, oauthStore, serviceOrNull } from "@/lib/oauth/runtime";
import { SCOPE_LABEL } from "@/lib/oauth/config";

export const runtime = "nodejs";

// Settings → AI Assistants: the apps the signed-in person connected, and
// Disconnect. Only ever the caller's own connections (filtered by their user
// id on the service role; the tables have no browser access at all).

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const store = oauthStore();
  const svc = serviceOrNull();
  if (!store || !svc) return NextResponse.json({ ready: false, connections: [] });
  try {
    const [conns, workspaces] = await Promise.all([store.listConnections(user.id), listAccessibleWorkspaces(svc, user.id)]);
    const nameOf = new Map(workspaces.map((w) => [w.id, w.name]));
    return NextResponse.json({
      ready: true,
      connections: conns.filter((c) => !c.revokedAt).map((c) => ({
        id: c.id,
        app: c.clientName ?? "An app",
        permissions: c.scopes.map((s) => SCOPE_LABEL[s] ?? s),
        workspaces: c.workspaceIds.map((id) => nameOf.get(id) ?? "A workspace you no longer have access to"),
        connectedAt: c.createdAt,
        lastUsedAt: c.lastUsedAt,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Before supabase/ai-assistants.sql has run the tables don't exist.
    console.error("[ai] list", (e as Error)?.message ?? e);
    return NextResponse.json({ ready: false, connections: [] });
  }
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const store = oauthStore();
  if (!store) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown connection." }, { status: 400 });
  const ok = await store.revokeConnection(user.id, id, new Date().toISOString()).catch(() => false);
  if (!ok) return NextResponse.json({ error: "That connection wasn't found." }, { status: 404 });
  await audit({ userId: user.id, connectionId: id, action: "disconnect", outcome: "ok" });
  return NextResponse.json({ ok: true });
}
