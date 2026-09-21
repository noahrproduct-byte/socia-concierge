import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntitlements, getLimit, countActiveCompetitors, canAddCompetitor } from "@/lib/entitlements";
import { deny, recordEvent } from "@/lib/planGuard";
import { listTracked, trackedState } from "@/lib/trackedCompetitors";

export const runtime = "nodejs";

// Tracked-competitor list management. SOCIA stores handles only; it never
// invents metrics for these accounts (platforms expose none to third parties).
//
// The roster cap is the plan's "competitors" limit (lib/plans.ts), enforced
// here. Rows beyond the cap after a downgrade carry is_active = false and are
// excluded from every read; only an explicit removal deletes a row.
//
// Adding goes through socia_add_competitor() with the service role: the
// function checks the cap and inserts under one per-user lock, and the
// browser insert policy is gone post-migration. Without a service key (local
// dev) or before the migration, the legacy check-then-upsert runs instead.

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;
// YouTube handles/ids allow hyphens and are longer than Instagram's.
const YT_HANDLE_RE = /^[a-zA-Z0-9._-]{1,60}$/;

type Platform = "instagram" | "facebook" | "youtube";
const platformOf = (v: unknown): Platform => (v === "facebook" ? "facebook" : v === "youtube" ? "youtube" : "instagram");

const UNREADABLE_MESSAGE = "SOCIA could not read your competitor list. Try again.";

/** The add function is not installed yet (pre-migration database). */
function isMissingFunction(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202") return true;
  const m = err.message ?? "";
  return /function .* does not exist/i.test(m) || /could not find .* function/i.test(m) || /schema cache/i.test(m);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ent = await getEntitlements(supabase, user.id);
  const limit = getLimit(ent, "competitors");
  try {
    const competitors = await listTracked(supabase, user.id, "platform, handle, added_at", { byAdded: true });
    return NextResponse.json({ competitors, limit, active: competitors.length });
  } catch {
    // Table may not exist yet. The count is unknown, not zero.
    return NextResponse.json({ competitors: [], limit, active: null });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "");
  const platform = platformOf(body?.platform);
  const valid = platform === "youtube" ? YT_HANDLE_RE.test(handle) : HANDLE_RE.test(handle);
  if (!valid) {
    return NextResponse.json({ error: "That doesn't look like a valid handle." }, { status: 400 });
  }
  const key = handle.toLowerCase();

  const ent = await getEntitlements(supabase, user.id);
  const limit = getLimit(ent, "competitors");

  // Unknown is not zero: a list that cannot be read is neither full nor empty.
  const active = await countActiveCompetitors(supabase, user.id);
  if (active == null) return NextResponse.json({ error: UNREADABLE_MESSAGE }, { status: 503 });

  const limitReached = (count: number) => {
    const c = canAddCompetitor(ent, count);
    // The function refused but the count it reported is under the cap: a race
    // it could not resolve, not a plan decision. Say so plainly.
    if (c.ok) return NextResponse.json({ error: UNREADABLE_MESSAGE }, { status: 503 });
    recordEvent(supabase, user.id, "competitor_limit_reached", { plan: ent.plan, limit });
    return deny(c.error);
  };

  // ---- Atomic path: cap check and insert in one privileged call -----------
  const svc = createServiceClient();
  if (svc) {
    const { data, error } = await svc.rpc("socia_add_competitor", {
      p_user: user.id,
      p_platform: platform,
      p_handle: key,
      p_limit: limit,
    });
    if (error && !isMissingFunction(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as { added?: boolean; already?: boolean; active_count?: number } | null;
      if (row?.already || row?.added) return NextResponse.json({ ok: true });
      return limitReached(typeof row?.active_count === "number" ? row.active_count : active);
    }
    // Function missing: the database is pre-migration, so the legacy path is right.
  }

  // ---- Legacy path: no service key, or the migration has not run ----------
  // Idempotent: re-adding a handle that is already counted never hits the cap.
  let state: Awaited<ReturnType<typeof trackedState>> = { exists: false };
  try {
    state = await trackedState(supabase, user.id, platform, key);
  } catch {
    /* table may not exist yet; the upsert below reports that */
  }
  if (state.exists && state.active) return NextResponse.json({ ok: true });

  const c = canAddCompetitor(ent, active);
  if (!c.ok) return limitReached(active);

  const row = { user_id: user.id, platform, handle: key };
  const { error } = await supabase
    .from("tracked_competitors")
    .upsert({ ...row, is_active: true }, { onConflict: "user_id,platform,handle" });
  if (error) {
    // Pre-migration schema: no is_active column, and no inactive rows either.
    const { error: e2 } = await supabase.from("tracked_competitors").upsert(row, { onConflict: "user_id,platform,handle" });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!handle) return NextResponse.json({ error: "handle required." }, { status: 400 });

  // An explicit removal is a hard delete, active or not.
  const { error } = await supabase
    .from("tracked_competitors")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", platformOf(body?.platform))
    .eq("handle", handle);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
