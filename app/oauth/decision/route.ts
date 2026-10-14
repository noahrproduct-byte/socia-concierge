import { NextResponse } from "next/server";
import { getViewer } from "@/lib/supabase/server";
import { listAccessibleWorkspaces } from "@/lib/workspaces";
import { decide } from "@/lib/oauth/server";
import { appOrigin } from "@/lib/oauth/config";
import { audit, oauthStore, serviceOrNull } from "@/lib/oauth/runtime";

export const runtime = "nodejs";

// The consent form's answer. Only from SOCIA's own page (Origin/Referer), only
// for the signed-in person who opened the request, and only for workspaces
// they can open right now. On success the person goes back to the app with a
// one-time code; on a problem they see SOCIA's own message.
function sameOrigin(req: Request): boolean {
  const own = new Set([appOrigin(), new URL(req.url).origin]);
  const origin = req.headers.get("origin");
  if (origin) return own.has(origin);
  const ref = req.headers.get("referer");
  if (!ref) return false;
  try { return own.has(new URL(ref).origin); } catch { return false; }
}

const toError = (req: Request, code: string) => NextResponse.redirect(new URL(`/oauth/error?reason=${encodeURIComponent(code)}`, req.url), 303);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  const store = oauthStore();
  const svc = serviceOrNull();
  if (!store || !svc) return toError(req, "unavailable");
  const { user } = await getViewer();
  if (!user) return NextResponse.redirect(new URL("/login", req.url), 303);

  const form = await req.formData();
  const requestId = String(form.get("request_id") ?? "");
  const allow = form.get("decision") === "allow";
  const workspaceIds = form.getAll("workspace").map(String);
  const accessible = (await listAccessibleWorkspaces(svc, user.id)).filter((w) => !w.suspended).map((w) => w.id);

  const d = await decide(store, { requestId, userId: user.id, allow, workspaceIds, accessibleWorkspaceIds: accessible }, new Date()).catch((e) => {
    console.error("[oauth] decision", (e as Error)?.message ?? e);
    return null;
  });
  if (!d) return toError(req, "server");
  if (!d.ok) {
    await audit({ userId: user.id, action: "authorize", outcome: "denied", detail: { reason: d.code } });
    return toError(req, d.code);
  }
  await audit({
    userId: user.id, connectionId: d.connection?.id ?? null, clientId: d.connection?.clientId ?? null, action: "authorize",
    outcome: allow ? "ok" : "denied", detail: allow ? { workspaces: d.connection?.workspaceIds.length ?? 0, scopes: d.connection?.scopes } : { reason: "declined" },
  });
  return NextResponse.redirect(d.url, 303);
}
