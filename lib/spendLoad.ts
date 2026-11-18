// Reads the facts for the admin spend page (lib/spendCore.ts): this month's
// AI costs (supabase/ai-spend.sql), AI Studio generations and their quoted
// prices (supabase/ai-studio.sql), live paid subscriptions, and the last
// balance alarms. Service role; each read that fails comes back null, so the
// page shows "not available" for that part instead of a wrong number.
// Server only.
import { createServiceClient } from "./supabase/service";
import { monthKey } from "./aiSpend";
import { PLANS, isPlanId, type PlanId } from "./plans";
import type { SpendFacts } from "./spendCore";

const LIVE = ["active", "trialing", "past_due"];

export async function loadSpendFacts(now = new Date()): Promise<SpendFacts> {
  const svc = createServiceClient();
  const empty: SpendFacts = { now, aiMonthMicros: null, aiMonthCalls: null, aiLastMonthMicros: null, topAccounts: null, generations: null, subscriptions: null, lastAlarms: null };
  if (!svc) return empty;
  const month = monthKey(now);
  const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
  const monthStart = `${month}T00:00:00Z`;

  const [thisRows, lastRows, gens, subs, alarms] = await Promise.all([
    svc.from("ai_spend").select("user_id, micro_usd, calls").eq("month", month).order("micro_usd", { ascending: false }).limit(5000),
    svc.from("ai_spend").select("micro_usd").eq("month", lastMonth).limit(5000),
    svc.from("generation_jobs").select("created_at, finished_at, model, input").eq("status", "done").gte("created_at", monthStart).limit(10000),
    (async () => {
      const full = await svc.from("profiles").select("plan, subscription_status, subscription_price_cents").in("subscription_status", LIVE).limit(10000);
      // Before subscription-price.sql the price column is missing: read the plans alone.
      if (full.error && /subscription_price_cents/.test(full.error.message ?? "")) return svc.from("profiles").select("plan, subscription_status").in("subscription_status", LIVE).limit(10000);
      return full;
    })(),
    svc.from("alert_events").select("platform, detected_at").eq("type", "provider").order("detected_at", { ascending: false }).limit(5),
  ]);

  const rows = thisRows.error ? null : (thisRows.data ?? []) as { user_id: string; micro_usd: number; calls: number }[];
  const aiMonthMicros = rows ? rows.reduce((s, r) => s + Number(r.micro_usd || 0), 0) : null;
  const aiMonthCalls = rows ? rows.reduce((s, r) => s + Number(r.calls || 0), 0) : null;
  const aiLastMonthMicros = lastRows.error ? null : (lastRows.data ?? []).reduce((s, r) => s + Number((r as { micro_usd: number }).micro_usd || 0), 0);

  let topAccounts: SpendFacts["topAccounts"] = null;
  if (rows) {
    const top = rows.slice(0, 8);
    const ids = top.map((r) => r.user_id);
    const { data: plans } = ids.length ? await svc.from("profiles").select("user_id, plan").in("user_id", ids) : { data: [] };
    const planOf = new Map((plans ?? []).map((p) => [(p as { user_id: string }).user_id, (p as { plan: string }).plan]));
    topAccounts = await Promise.all(top.map(async (r) => {
      const raw = planOf.get(r.user_id);
      const plan: PlanId = isPlanId(raw) ? raw : "free";
      const { data } = await svc.auth.admin.getUserById(r.user_id).catch(() => ({ data: null }));
      return { userId: r.user_id, email: data?.user?.email ?? null, plan, micros: Number(r.micro_usd || 0), capUsd: PLANS[plan].aiSpendCapUsd };
    }));
  }

  const generations = gens.error ? null : (gens.data ?? []).map((g) => {
    const row = g as { created_at: string; finished_at: string | null; model: string; input: { quotedUsd?: unknown } | null };
    const q = Number(row.input?.quotedUsd);
    return { at: row.finished_at ?? row.created_at, usd: Number.isFinite(q) && q > 0 ? q : 0, model: row.model };
  });

  const subscriptions = subs.error ? null : ((subs.data ?? []) as { plan: string; subscription_price_cents?: number | null }[])
    .filter((s) => isPlanId(s.plan) && s.plan !== "free")
    .map((s) => ({ plan: s.plan as PlanId, cents: typeof s.subscription_price_cents === "number" ? s.subscription_price_cents : null }));

  const lastAlarms = alarms.error ? null : ((alarms.data ?? []) as { platform: string | null; detected_at: string }[]).map((a) => ({ provider: a.platform ?? "unknown", at: a.detected_at }));

  return { now, aiMonthMicros, aiMonthCalls, aiLastMonthMicros, topAccounts, generations, subscriptions, lastAlarms };
}
