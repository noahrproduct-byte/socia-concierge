// What each account's AI costs SOCIA this month, and the ceiling its plan
// sets (lib/plans.ts aiSpendCapUsd). Every Claude response, transcription
// and music track adds its price (supabase/ai-spend.sql); before an AI
// action starts, the account's month so far is checked against its plan's
// ceiling. Past it, AI features pause until the 1st of next month, so no
// account can cost more than its plan brings in, whatever the meters allow.
//
// Prices are the list prices SOCIA pays (per million tokens; transcription
// per audio hour; music per minute). Before ai-spend.sql has run nothing is
// counted and nothing is paused (logged once per process).
//
// Server only.

import { NextResponse } from "next/server";
import { createServiceClient } from "./supabase/service";
import { getEntitlements, type Entitlements } from "./entitlements";
import { PLANS, formatPrice, nextPlan, pricingHref } from "./plans";

/** USD per million input / output tokens, by model family. */
const TOKEN_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /opus/i, input: 4, output: 20 },
  { match: /sonnet/i, input: 2, output: 10 },
  { match: /haiku/i, input: 0.1, output: 0.5 },
];
/** An unknown model is priced like the most expensive one, never as free. */
const FALLBACK = { input: 4, output: 20 };
const WEB_SEARCH_USD = 0.01;
export const TRANSCRIBE_USD_PER_HOUR = 0.21;
export const MUSIC_USD_PER_MINUTE = 0.15;

type Usage = {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

/** One Claude response's cost in millionths of a dollar. Pure. */
export function claudeMicros(model: string | null | undefined, usage: Usage | null | undefined): number {
  if (!usage) return 0;
  const p = TOKEN_PRICES.find((x) => x.match.test(model ?? "")) ?? FALLBACK;
  const n = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  // Per million tokens, so a token costs `price` micro-dollars.
  const usd =
    n(usage.input_tokens) * p.input +
    n(usage.cache_read_input_tokens) * p.input * 0.1 +
    n(usage.cache_creation_input_tokens) * p.input * 1.25 +
    n(usage.output_tokens) * p.output +
    n(usage.server_tool_use?.web_search_requests) * WEB_SEARCH_USD * 1_000_000;
  return Math.round(usd);
}

export const transcriptionMicros = (seconds: number) => Math.round(Math.max(0, seconds) / 3600 * TRANSCRIBE_USD_PER_HOUR * 1_000_000);
export const musicMicros = (seconds: number) => Math.round(Math.max(0, seconds) / 60 * MUSIC_USD_PER_MINUTE * 1_000_000);

/** The first day of `now`'s month (UTC), as the counter's key. */
export const monthKey = (now = new Date()) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
/** The 1st of next month (UTC): when a paused account's AI comes back. */
export const nextMonthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

let warned = false;
const missing = (e: { message?: string; code?: string } | null | undefined) => Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /ai_spend|does not exist|Could not find/i.test(e.message ?? "")));

/** Add a call's cost to the owner's month. Never throws, never blocks the request it describes. */
export async function addSpend(ownerId: string | null | undefined, micros: number, now = new Date()): Promise<void> {
  if (!ownerId || !(micros > 0)) return;
  const svc = createServiceClient();
  if (!svc) return;
  try {
    const { error } = await svc.rpc("socia_ai_spend_add", { p_user: ownerId, p_month: monthKey(now), p_micros: Math.round(micros) });
    if (error && !warned) { warned = true; console.error("[ai-spend] not recorded:", error.message); }
  } catch (e) {
    if (!warned) { warned = true; console.error("[ai-spend] not recorded:", (e as Error)?.message ?? e); }
  }
}

export type SpendState = { spentUsd: number; capUsd: number; over: boolean };

/** This month's AI cost against the plan's ceiling; null when it can't be read (before ai-spend.sql). */
export async function spendState(ownerId: string, ent: Entitlements, now = new Date()): Promise<SpendState | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const capUsd = PLANS[ent.plan]?.aiSpendCapUsd ?? 0;
  const { data, error } = await svc.from("ai_spend").select("micro_usd").eq("user_id", ownerId).eq("month", monthKey(now)).maybeSingle();
  if (error) {
    if (!missing(error)) console.error("[ai-spend] can't read:", error.message);
    return null;
  }
  const spentUsd = Number((data as { micro_usd?: number } | null)?.micro_usd ?? 0) / 1_000_000;
  return { spentUsd, capUsd, over: spentUsd >= capUsd };
}

/** The refusal shown when the month's AI is used up: when it comes back, and what's next. */
export function overCapResponse(ent: Entitlements, now = new Date()): NextResponse {
  const back = nextMonthStart(now).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const up = nextPlan(ent.plan);
  const plan = PLANS[ent.plan]?.name ?? "your";
  const more = up ? ` ${PLANS[up].name} (${formatPrice(PLANS[up])} a month) includes more.` : " Need more? Contact us.";
  return NextResponse.json(
    {
      error: `You've used this month's AI on the ${plan} plan. It comes back on ${back}.${more}`,
      code: "ai_budget",
      upgrade: up ? { plan: up, href: pricingHref(up) } : null,
    },
    { status: 429 },
  );
}

/** A refusal when this owner's month is over its plan's ceiling; null to go ahead (also when it can't be read). */
export async function aiBudgetDenied(ownerId: string, ent?: Entitlements | null, now = new Date()): Promise<NextResponse | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const e = ent ?? (await getEntitlements(svc, ownerId).catch(() => null));
  if (!e) return null;
  const s = await spendState(ownerId, e, now).catch(() => null);
  return s?.over ? overCapResponse(e, now) : null;
}
