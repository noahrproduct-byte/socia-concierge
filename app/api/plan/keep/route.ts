import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntitlements, getLimit, getOverLimits, listConnectedAccounts } from "@/lib/entitlements";
import { recordEvent } from "@/lib/planGuard";

export const runtime = "nodejs";

// After a downgrade: which accounts and competitors stay active. Everything
// else is paused (plan_suspended_at / is_active=false), never deleted.
//
// The signed-in session only authenticates and validates the request. The
// write itself is one call to socia_apply_plan_keep() through the service
// role: the pause columns are locked by triggers so a browser session (or a
// user-scoped server client) can never flip them, and the function applies
// the whole decision atomically under a per-user lock.
//
// Body: { accounts?: ConnectedAccount.id[], competitors?: `${platform}:${handle}`[] }
// A key that is absent means "leave that side alone".

const MIGRATION_MESSAGE = "SOCIA's database needs the plans migration before this can be saved.";
const NOT_CONFIGURED_MESSAGE = "SOCIA is not configured to change plan state on this server.";

type DbError = { code?: string; message?: string } | null;

/** A function or column the migration adds is not there yet. */
function isMissingSchema(e: unknown): boolean {
  const err = e as DbError;
  if (!err) return false;
  if (err.code === "42883" || err.code === "42703" || err.code === "PGRST202" || err.code === "PGRST204") return true;
  const m = err.message ?? "";
  return /column .* does not exist/i.test(m) || /function .* does not exist/i.test(m) || /could not find .* (column|function)/i.test(m) || /schema cache/i.test(m);
}

/** undefined = not provided, null = malformed, otherwise a de-duplicated list. */
function stringList(v: unknown): string[] | null | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
  return Array.from(new Set(v as string[]));
}

function fail(error: unknown, fallback: string) {
  if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
  const msg = (error as { message?: string } | null)?.message || fallback;
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { accounts?: unknown; competitors?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const accounts = stringList(body.accounts);
  const competitors = stringList(body.competitors);
  if (accounts === null || competitors === null) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!accounts && !competitors) return NextResponse.json({ error: "Nothing to keep." }, { status: 400 });

  const ent = await getEntitlements(supabase, user.id);
  const list = await listConnectedAccounts(supabase, user.id);
  const accountLimit = getLimit(ent, "connected_accounts");
  const competitorLimit = getLimit(ent, "competitors");

  // ---- Validate before touching anything --------------------------------
  if (accounts) {
    const known = new Set(list.map((a) => a.id));
    if (accounts.some((id) => !known.has(id))) {
      return NextResponse.json({ error: "One of those accounts is not connected to SOCIA." }, { status: 400 });
    }
    if (accounts.length > accountLimit) {
      return NextResponse.json(
        { error: `${ent.config.name} supports ${accountLimit} connected ${accountLimit === 1 ? "account" : "accounts"}. Choose ${accountLimit} to keep.` },
        { status: 400 },
      );
    }
  }

  let compTotal: number | null = null;
  if (competitors) {
    const { data, error } = await supabase.from("tracked_competitors").select("platform, handle").eq("user_id", user.id);
    if (error) return fail(error, "Could not read your competitors.");
    const rows = (data ?? []) as { platform: string; handle: string }[];
    compTotal = rows.length;
    const known = new Set(rows.map((r) => `${r.platform}:${r.handle}`));
    if (competitors.some((k) => !known.has(k))) {
      return NextResponse.json({ error: "One of those competitors is not on your list." }, { status: 400 });
    }
    if (competitors.length > competitorLimit) {
      return NextResponse.json(
        { error: `${ent.config.name} supports ${competitorLimit} ${competitorLimit === 1 ? "competitor" : "competitors"}. Choose ${competitorLimit} to keep.` },
        { status: 400 },
      );
    }
  }

  // ---- Apply, in one privileged call ---------------------------------------
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 503 });

  const { error } = await svc.rpc("socia_apply_plan_keep", {
    p_user: user.id,
    p_accounts: accounts ?? null,
    p_competitors: competitors ?? null,
    p_account_limit: accountLimit,
    p_competitor_limit: competitorLimit,
  });
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
    if ((error as DbError)?.code === "22023") {
      return NextResponse.json({ error: "That choice does not match your plan or your connected accounts. Reload and try again." }, { status: 400 });
    }
    return fail(error, "Your choice could not be saved.");
  }

  recordEvent(supabase, user.id, "plan_keep_chosen", {
    plan: ent.plan,
    accounts_kept: accounts?.length ?? null,
    accounts_total: accounts ? list.length : null,
    competitors_kept: competitors?.length ?? null,
    competitors_total: compTotal,
  });

  const overLimits = await getOverLimits(supabase, ent);
  return NextResponse.json({ ok: true, overLimits });
}
