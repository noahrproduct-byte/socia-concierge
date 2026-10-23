import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncFacebook } from "@/lib/facebookSync";
import { igAccountForPage } from "@/lib/igBusinessDiscovery";
import { canConnectAnother, getEntitlements, listConnectedAccounts } from "@/lib/entitlements";
import { ensureDefaultWorkspace } from "@/lib/workspaces";
import { deny } from "@/lib/planGuard";
import { trackEvent } from "@/lib/events";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";
import { createServiceClient } from "@/lib/supabase/service";
import { takePageToken, type PendingPage } from "@/lib/facebookPending";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 3 (multi-Page managers): the user picked which Page to connect.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The person acts inside their ACTIVE Brand Workspace, which may belong to
  // someone who invited them as an Admin. Choosing a Page is owner/admin only;
  // the pending row and the saved Page are the workspace OWNER's, read and
  // written through ctx.client. Event attribution stays on the viewer.
  const ctx = await resolveContext(supabase, user.id);
  // Connection rows (tokens) are written only by SOCIA's server role: the
  // database refuses direct writes from a browser session (security-hardening.sql).
  const connDb = createServiceClient() ?? ctx.client;
  // Connections or their data are about to change: drop the reused live
  // platform reads so the next page view asks the platforms again.
  clearLiveCache(ctx.ownerId);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });

  let pageId: string;
  try {
    ({ page_id: pageId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Scope the pending row to the owner's active workspace when Brand
  // Workspaces are on (a user may then have a Facebook row per workspace).
  const ws = ctx.workspace ?? (await ensureDefaultWorkspace(ctx.client, ctx.ownerId));
  let pendingQ = connDb.from("facebook_connections").select("pending_pages").eq("user_id", ctx.ownerId);
  if (ws) pendingQ = pendingQ.eq("workspace_id", ws.id);
  const { data: rows } = await pendingQ.limit(1);
  const row = ((rows as { pending_pages?: unknown }[] | null) ?? [])[0] ?? null;
  const pages: PendingPage[] = Array.isArray(row?.pending_pages) ? row!.pending_pages : [];
  const listed = pages.find((x) => x.id === pageId);
  const token = listed ? await takePageToken(createServiceClient(), ctx.ownerId, ws?.id ?? null, pageId, pages) : null;
  if (!listed || !token) {
    return NextResponse.json({ error: "That Page isn't in your pending list. Reconnect Facebook." }, { status: 400 });
  }
  const p = { ...listed, access_token: token };

  // Plan gate, server-side, before the write. Picking the Page already on
  // file is a reconnect and never counts as a new slot. This route is called
  // with fetch() from the Settings card, so the answer is a 403 PlanError
  // body (rendered in the card) rather than a redirect fetch would swallow.
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const list = await listConnectedAccounts(ctx.client, ctx.ownerId);
  const check = canConnectAnother(ent, list, "facebook", p.id);
  if (!check.ok) {
    await trackEvent(supabase, user.id, "account_limit_reached", { platform: "facebook", plan: ent.plan });
    return deny(check.error);
  }

  // The Page's linked Instagram Professional account is what enables
  // Business Discovery. Best-effort: a Page without one still connects fine,
  // it just can't provide Instagram competitor data.
  const igAccount = await igAccountForPage(p.id, p.access_token).catch(() => null);

  const selectRow: Record<string, unknown> = {
    user_id: ctx.ownerId,
    page_id: p.id,
    ig_business_id: igAccount?.id ?? null,
    ig_business_username: igAccount?.username ?? null,
    page_name: p.name ?? null,
    username: p.username ?? null,
    followers_count: p.followers_count ?? p.fan_count ?? null,
    picture_url: p.picture?.data?.url ?? null,
    access_token: p.access_token,
    connection_status: "connected",
    pending_pages: null,
  };
  if (ws) selectRow.workspace_id = ws.id;
  const { error } = await connDb.from("facebook_connections").upsert(selectRow, { onConflict: ws ? "workspace_id" : "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save the connection." }, { status: 500 });

  await syncFacebook(ctx.client, ctx.ownerId).catch(() => null);
  return NextResponse.json({ ok: true });
}
