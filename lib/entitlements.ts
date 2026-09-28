// Entitlement service: the only place the app asks "what may this user do?".
//
//   const ent = await getEntitlements(supabase, user.id)
//   canUseFeature(ent, "scheduling")          -> boolean
//   checkFeature(ent, "scheduling")           -> { ok } | { ok: false, error: PlanError }
//   getLimit(ent, "workspaces")               -> number
//   getUsage(supabase, ent)                   -> { ask_socia: { used, limit, remaining, resetsOn }, ... }
//   consumeUsage(supabase, ent, "ask_socia")  -> atomic increment, refused when the period allowance is spent
//
// Until Brand Workspaces exist as rows, "one account per platform per
// workspace" is enforced as: active accounts on a platform <= workspaces limit.
// That is the same rule (a workspace holds at most one account per platform),
// counted from the accounts themselves.
//
// Resolution order: PLANS defaults (lib/plans.ts) <- plan_config_overrides row
// for that plan <- profiles.entitlement_overrides for that user. All reads are
// defensive: a missing table, column or row falls back to the code defaults,
// and an unreadable plan resolves to Free, so nothing ever gates open by
// accident. Metering is the one place that fails CLOSED: if the usage counter
// cannot be read or written, the metered request is refused (503), never
// silently allowed.
//
// Usage periods are UTC calendar months (and UTC Monday-to-Monday weeks for
// weekly meters); getEntitlements() is the single place that would change if
// a billing anchor were ever wanted instead.
//
// Server only. Route handlers use the wrappers in lib/planGuard.ts.

import {
  PLANS, FEATURE_STATUS, METER_PERIOD, normalizePlan,
  type PlanId, type PlanConfig, type FeatureKey, type LimitKey, type MeterKey, type MeterPeriod,
} from "./plans";
import { featureError, limitError, usageError, type PlanError } from "./planErrors";
import { createServiceClient } from "./supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** ISO dates; start inclusive, end exclusive. `end` is also the reset date. */
export type UsagePeriod = { start: string; end: string };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function currentPeriod(now: Date = new Date()): UsagePeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return { start: isoDay(new Date(Date.UTC(y, m, 1))), end: isoDay(new Date(Date.UTC(y, m + 1, 1))) };
}

/** UTC week, Monday to Monday; `end` is the reset date. */
export function currentWeekPeriod(now: Date = new Date()): UsagePeriod {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  const start = day - sinceMonday * 86400000;
  return { start: isoDay(new Date(start)), end: isoDay(new Date(start + 7 * 86400000)) };
}

export function currentPeriods(now: Date = new Date()): Record<MeterPeriod, UsagePeriod> {
  return { month: currentPeriod(now), week: currentWeekPeriod(now) };
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

export type Overrides = {
  limits?: Partial<Record<LimitKey, number>>;
  meters?: Partial<Record<MeterKey, number>>;
  features?: Partial<Record<FeatureKey, boolean>>;
};

const nonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.floor(v) === v;

/** Keep only well-formed keys and values; ignore everything else silently. */
export function sanitizeOverrides(v: unknown, base: PlanConfig): Overrides {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const out: Overrides = {};
  const pick = <K extends string>(src: unknown, keys: K[], ok: (x: unknown) => boolean) => {
    if (!src || typeof src !== "object") return undefined;
    const r: Partial<Record<K, never>> = {};
    for (const k of keys) {
      const val = (src as Record<string, unknown>)[k];
      if (ok(val)) (r as Record<string, unknown>)[k] = val;
    }
    return Object.keys(r).length ? r : undefined;
  };
  const limits = pick(o.limits, Object.keys(base.limits) as LimitKey[], nonNegInt);
  const meters = pick(o.meters, Object.keys(base.meters) as MeterKey[], nonNegInt);
  const features = pick(o.features, Object.keys(base.features) as FeatureKey[], (x) => typeof x === "boolean");
  if (limits) out.limits = limits as Overrides["limits"];
  if (meters) out.meters = meters as Overrides["meters"];
  if (features) out.features = features as Overrides["features"];
  return out;
}

export function mergeConfig(base: PlanConfig, ...layers: (Overrides | null | undefined)[]): PlanConfig {
  const out: PlanConfig = { ...base, limits: { ...base.limits }, meters: { ...base.meters }, features: { ...base.features } };
  for (const l of layers) {
    if (!l) continue;
    Object.assign(out.limits, l.limits ?? {});
    Object.assign(out.meters, l.meters ?? {});
    Object.assign(out.features, l.features ?? {});
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type Entitlements = {
  userId: string;
  plan: PlanId;
  /** Defaults merged with any database overrides. */
  config: PlanConfig;
  /** The monthly period. Most meters run on it; kept as `period` for older call sites. */
  period: UsagePeriod;
  /** Every period a meter can run on (see METER_PERIOD in lib/plans.ts). */
  periods: Record<MeterPeriod, UsagePeriod>;
  /** Where the plan came from. "profile" until a billing provider owns it. */
  source: "profile";
};

/** The period a given meter counts in. */
export function meterPeriod(ent: Entitlements, meter: MeterKey): UsagePeriod {
  return ent.periods[METER_PERIOD[meter]];
}

async function readProfilePlan(supabase: Supa, userId: string): Promise<{ plan: PlanId; overrides: unknown }> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, entitlement_overrides")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error) return { plan: normalizePlan(data?.plan), overrides: data?.entitlement_overrides ?? null };
  } catch {
    /* fall through to the narrower select */
  }
  try {
    const { data, error } = await supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle();
    if (error) return { plan: "free", overrides: null };
    return { plan: normalizePlan(data?.plan), overrides: null };
  } catch {
    return { plan: "free", overrides: null };
  }
}

async function readPlanOverrides(supabase: Supa, plan: PlanId): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from("plan_config_overrides")
      .select("limits, meters, features")
      .eq("plan_id", plan)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function getEntitlements(supabase: Supa, userId: string, now: Date = new Date()): Promise<Entitlements> {
  const { plan, overrides: userOverrides } = await readProfilePlan(supabase, userId);
  const base = PLANS[plan];
  const planOverrides = await readPlanOverrides(supabase, plan);
  const config = mergeConfig(base, sanitizeOverrides(planOverrides, base), sanitizeOverrides(userOverrides, base));
  const periods = currentPeriods(now);
  return { userId, plan, config, period: periods.month, periods, source: "profile" };
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type FeatureCheck = { ok: true } | { ok: false; error: PlanError };

/** True only when the feature is built AND the plan includes it. */
export function checkFeature(ent: Entitlements, key: FeatureKey): FeatureCheck {
  if (FEATURE_STATUS[key] === "coming_soon") return { ok: false, error: featureError(ent.plan, key) };
  if (ent.config.features[key]) return { ok: true };
  return { ok: false, error: featureError(ent.plan, key) };
}

export function canUseFeature(ent: Entitlements, key: FeatureKey): boolean {
  return checkFeature(ent, key).ok;
}

export function getLimit(ent: Entitlements, key: LimitKey): number {
  return ent.config.limits[key];
}

export function getMeterLimit(ent: Entitlements, key: MeterKey): number {
  return ent.config.meters[key];
}

/** Longest analytics window this plan may look back over. */
export function maxHistoryDays(ent: Entitlements): number {
  return ent.config.limits.analytics_history_days;
}

export function clampDays(ent: Entitlements, days: number): number {
  return Math.min(days, maxHistoryDays(ent));
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export type UsageSnapshot = {
  meter: MeterKey;
  /** null when the counter could not be read (metering not installed), never 0. */
  used: number | null;
  limit: number;
  remaining: number | null;
  /** ISO date. */
  resetsOn: string;
};

const METERS = Object.keys(PLANS.free.meters) as MeterKey[];

function snapshot(ent: Entitlements, meter: MeterKey, used: number | null): UsageSnapshot {
  const limit = ent.config.meters[meter];
  return { meter, used, limit, remaining: used == null ? null : Math.max(0, limit - used), resetsOn: meterPeriod(ent, meter).end };
}

/** Every meter's usage for its current period (monthly or weekly) in one query. */
export async function getUsage(supabase: Supa, ent: Entitlements): Promise<Record<MeterKey, UsageSnapshot>> {
  const out = {} as Record<MeterKey, UsageSnapshot>;
  let rows: { meter: string; used: number; period_start: string }[] | null = null;
  try {
    const starts = Array.from(new Set(Object.values(ent.periods).map((p) => p.start)));
    const { data, error } = await supabase
      .from("usage_counters")
      .select("meter, used, period_start")
      .eq("user_id", ent.userId)
      .in("period_start", starts);
    if (!error) rows = data ?? [];
  } catch {
    rows = null;
  }
  for (const m of METERS) {
    const start = meterPeriod(ent, m).start;
    const used = rows == null ? null : (rows.find((r) => r.meter === m && String(r.period_start).slice(0, 10) === start)?.used ?? 0);
    out[m] = snapshot(ent, m, used);
  }
  return out;
}

export type ConsumeResult = {
  allowed: boolean;
  usage: UsageSnapshot;
  error: PlanError | null;
  /** The counter could not be read or written (function missing, DB error). The request must be refused. */
  unavailable?: boolean;
};

/**
 * Atomically count one use and say whether it was within the allowance.
 * Backed by the socia_consume_usage() Postgres function (row lock, so two
 * concurrent requests cannot both squeeze through the last slot). If the
 * function is missing or errors the request is REFUSED (unavailable: true) and
 * the problem is logged loudly. Failing open here would make every AI meter
 * unlimited whenever metering breaks, which is a billing hole, not resilience.
 */
export async function consumeUsage(supabase: Supa, ent: Entitlements, meter: MeterKey): Promise<ConsumeResult> {
  const limit = ent.config.meters[meter];
  const period = meterPeriod(ent, meter);
  if (limit <= 0) {
    const usage = snapshot(ent, meter, 0);
    return { allowed: false, usage, error: usageError(ent.plan, meter, limit, 0, period.end) };
  }
  try {
    let { data, error } = await supabase.rpc("socia_consume_usage", {
      p_meter: meter,
      p_period_start: period.start,
      p_limit: limit,
    });
    // No session behind this client (a member acting as the workspace owner
    // through the service role): count against the owner explicitly, via the
    // service-role-only function. Never reached for an ordinary signed-in owner.
    if (error && /not signed in|42501/.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
      const svc = createServiceClient();
      if (svc) {
        ({ data, error } = await svc.rpc("socia_consume_usage_for", {
          p_user: ent.userId, p_meter: meter, p_period_start: period.start, p_limit: limit,
        }));
      }
    }
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const used = typeof row?.used_count === "number" ? row.used_count : null;
    const allowed = Boolean(row?.allowed);
    const usage = snapshot(ent, meter, used);
    return { allowed, usage, error: allowed ? null : usageError(ent.plan, meter, limit, used, period.end) };
  } catch (e) {
    console.error(`[entitlements] usage metering unavailable for ${meter}, refusing:`, (e as Error)?.message ?? e);
    return { allowed: false, usage: snapshot(ent, meter, null), error: null, unavailable: true };
  }
}

/**
 * Give a consumed unit back because the work it paid for never happened (the
 * model call failed). Only meaningful after a consume that actually counted;
 * callers skip it when usage.used is null. Refunds go through the service-role
 * client on purpose: socia_release_usage() is not callable by a signed-in
 * session, otherwise a browser could reset its own counters in a loop.
 * Best-effort: no service key or a missing function is logged, never thrown.
 */
export async function releaseUsage(_supabase: Supa, ent: Entitlements, meter: MeterKey): Promise<void> {
  if (ent.config.meters[meter] <= 0) return;
  const svc = createServiceClient();
  if (!svc) {
    console.error(`[entitlements] could not release ${meter}: SUPABASE_SERVICE_ROLE_KEY is not set`);
    return;
  }
  try {
    const { error } = await svc.rpc("socia_release_usage", { p_user: ent.userId, p_meter: meter, p_period_start: meterPeriod(ent, meter).start });
    if (error) throw error;
  } catch (e) {
    console.error(`[entitlements] could not release ${meter}:`, (e as Error)?.message ?? e);
  }
}

// ---------------------------------------------------------------------------
// Connected accounts (all platforms)
// ---------------------------------------------------------------------------

export type ConnectedPlatform = "instagram" | "facebook" | "youtube" | "tiktok";

export type ConnectedAccount = {
  platform: ConnectedPlatform;
  /** `${platform}:${platform id}`; stable across renames. */
  id: string;
  platformId: string;
  label: string;
  handle: string | null;
  avatar: string | null;
  /** "expired" = Meta reported the token dead; the slot is still held until removed. */
  status: "connected" | "expired";
  /** Paused by a plan downgrade: data kept, not read, not counted. */
  suspended: boolean;
  /** Instagram only: the account the app currently reads through. */
  current: boolean;
};

type Row = Record<string, unknown>;

/**
 * Try progressively narrower selects so a pre-migration schema still answers.
 * null means every shape failed: the table could not be read at all, which is
 * not the same as the person having no rows.
 */
async function selectRows(supabase: Supa, table: string, userId: string, selects: string[]): Promise<Row[] | null> {
  for (const cols of selects) {
    try {
      const { data, error } = await supabase.from(table).select(cols).eq("user_id", userId);
      if (!error) return (data ?? []) as Row[];
    } catch {
      /* try the next shape */
    }
  }
  console.error(`[entitlements] could not read ${table} for ${userId}`);
  return null;
}

export type ConnectedAccountsResult = {
  accounts: ConnectedAccount[];
  /** false when at least one platform table could not be read; counts are then a lower bound. */
  complete: boolean;
};

/** The list plus whether it is trustworthy. Use this wherever a count is shown or compared. */
export async function listConnectedAccountsDetailed(supabase: Supa, userId: string): Promise<ConnectedAccountsResult> {
  const [igRaw, fbRaw, ytRaw, ttRaw] = await Promise.all([
    selectRows(supabase, "instagram_connections", userId, [
      "ig_user_id, username, profile, is_active, plan_suspended_at",
      "ig_user_id, username, profile, is_active",
      "ig_user_id, username, profile",
    ]),
    selectRows(supabase, "facebook_connections", userId, [
      "page_id, page_name, username, picture_url, connection_status, plan_suspended_at",
      "page_id, page_name, username, picture_url, connection_status",
    ]),
    selectRows(supabase, "youtube_connections", userId, [
      "channel_id, title, handle, avatar_url, plan_suspended_at",
      "channel_id, title, handle, avatar_url",
    ]),
    selectRows(supabase, "tiktok_connections", userId, [
      "open_id, display_name, username, avatar_url, plan_suspended_at",
      "open_id, display_name, username, avatar_url",
    ]),
  ]);
  // TikTok's table is newer than the others: an account with no rows there
  // (or a project that has not run the migration) must not read as incomplete.
  const complete = igRaw != null && fbRaw != null && ytRaw != null;
  const ig = igRaw ?? [], fb = fbRaw ?? [], yt = ytRaw ?? [], tt = ttRaw ?? [];

  const out: ConnectedAccount[] = [];
  for (const r of ig) {
    const pid = String(r.ig_user_id ?? r.username ?? "");
    if (!pid) continue;
    const profile = (r.profile as Row | null) ?? null;
    out.push({
      platform: "instagram", id: `instagram:${pid}`, platformId: pid,
      label: r.username ? `@${r.username}` : "Instagram account",
      handle: (r.username as string | null) ?? null,
      avatar: (profile?.profile_picture_url as string | null) ?? null,
      status: "connected",
      suspended: r.plan_suspended_at != null,
      current: r.is_active !== false,
    });
  }
  for (const r of fb) {
    // A row still choosing its Page is not an account yet; it holds no slot.
    if (!r.page_id) continue;
    out.push({
      platform: "facebook", id: `facebook:${r.page_id}`, platformId: String(r.page_id),
      label: (r.page_name as string | null) || "Facebook Page",
      handle: (r.username as string | null) ?? null,
      avatar: (r.picture_url as string | null) ?? null,
      status: r.connection_status === "expired" ? "expired" : "connected",
      suspended: r.plan_suspended_at != null,
      current: true,
    });
  }
  for (const r of yt) {
    if (!r.channel_id) continue;
    out.push({
      platform: "youtube", id: `youtube:${r.channel_id}`, platformId: String(r.channel_id),
      label: (r.title as string | null) || "YouTube channel",
      handle: (r.handle as string | null) ?? null,
      avatar: (r.avatar_url as string | null) ?? null,
      status: "connected",
      suspended: r.plan_suspended_at != null,
      current: true,
    });
  }
  for (const r of tt) {
    if (!r.open_id) continue;
    out.push({
      platform: "tiktok", id: `tiktok:${r.open_id}`, platformId: String(r.open_id),
      label: (r.display_name as string | null) || (r.username ? `@${r.username}` : "TikTok account"),
      handle: r.username ? `@${r.username}` : null,
      avatar: (r.avatar_url as string | null) ?? null,
      status: "connected",
      suspended: r.plan_suspended_at != null,
      current: true,
    });
  }
  return { accounts: out, complete };
}

/**
 * The list alone. Fails open (an unreadable table reads as no accounts there),
 * which is right for the connect flows: a database blip must not lock people
 * out of connecting. Anything that displays or compares a count should use
 * listConnectedAccountsDetailed() and treat an incomplete list as unknown.
 */
export async function listConnectedAccounts(supabase: Supa, userId: string): Promise<ConnectedAccount[]> {
  return (await listConnectedAccountsDetailed(supabase, userId)).accounts;
}

/** Accounts that occupy a plan slot: everything connected and not paused. */
export function activeAccounts(list: ConnectedAccount[]): ConnectedAccount[] {
  return list.filter((a) => !a.suspended);
}

/** Active accounts per platform. Each is "how many workspaces' worth of that platform" is in use. */
export function activeByPlatform(list: ConnectedAccount[]): Record<ConnectedPlatform, number> {
  const out: Record<ConnectedPlatform, number> = { instagram: 0, facebook: 0, youtube: 0, tiktok: 0 };
  for (const a of activeAccounts(list)) out[a.platform] += 1;
  return out;
}

/**
 * How many Brand Workspaces the connected accounts occupy: a workspace holds at
 * most one account per platform, so it is the platform with the most active
 * accounts. Two Instagram accounts and one YouTube channel = 2 workspaces.
 */
export function workspacesInUse(list: ConnectedAccount[]): number {
  return Math.max(0, ...Object.values(activeByPlatform(list)));
}

/**
 * Whether one more account may be connected on `platform`. The rule is one
 * account per platform per workspace, so the check is that platform's active
 * count against the workspaces limit. `reconnectId` is the platform id of the
 * account being (re)connected when it is already known, so reconnecting an
 * existing account never hits the limit.
 */
export function canConnectAnother(ent: Entitlements, list: ConnectedAccount[], platform: ConnectedPlatform, reconnectId?: string | null): FeatureCheck {
  if (reconnectId && list.some((a) => a.platform === platform && a.platformId === reconnectId)) return { ok: true };
  const onPlatform = activeByPlatform(list)[platform];
  const max = getLimit(ent, "workspaces");
  if (onPlatform < max) return { ok: true };
  return { ok: false, error: limitError(ent.plan, "workspaces", max, onPlatform) };
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

/** Active competitors, or null when the table could not be read (unknown is not zero). */
export async function countActiveCompetitors(supabase: Supa, userId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("tracked_competitors")
      .select("handle", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true);
    if (!error) return count ?? 0;
  } catch {
    /* column may not exist yet */
  }
  try {
    const { count, error } = await supabase
      .from("tracked_competitors")
      .select("handle", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  } catch (e) {
    console.error(`[entitlements] could not count competitors for ${userId}:`, (e as Error)?.message ?? e);
    return null;
  }
}

/** Callers must resolve an unknown count before asking (refuse with a plain error, not a plan notice). */
export function canAddCompetitor(ent: Entitlements, active: number): FeatureCheck {
  const max = getLimit(ent, "competitors");
  if (active < max) return { ok: true };
  return { ok: false, error: limitError(ent.plan, "competitors", max, active) };
}

// ---------------------------------------------------------------------------
// Over-limit state (after a downgrade)
// ---------------------------------------------------------------------------

export type OverLimit = { active: number; limit: number; excess: number };
/**
 * Accounts over the workspaces limit. `limit` is per platform (one account per
 * platform per workspace), `active` the busiest platform's count, `excess` the
 * total number of accounts that must be paused, `byPlatform` which platforms
 * are over and by how many active accounts.
 */
export type AccountsOverLimit = OverLimit & { byPlatform: Partial<Record<ConnectedPlatform, number>> };
export type OverLimits = { accounts: AccountsOverLimit | null; competitors: OverLimit | null };

/** null counts (unreadable) never produce an over-limit state; nothing is inferred from a failed read. */
export function computeOverLimits(
  ent: Entitlements,
  accountsByPlatform: Record<ConnectedPlatform, number> | null,
  activeCompetitorCount: number | null,
): OverLimits {
  const ws = getLimit(ent, "workspaces");
  const comp = getLimit(ent, "competitors");
  let accounts: AccountsOverLimit | null = null;
  if (accountsByPlatform) {
    const byPlatform: Partial<Record<ConnectedPlatform, number>> = {};
    let excess = 0;
    let active = 0;
    for (const [p, n] of Object.entries(accountsByPlatform) as [ConnectedPlatform, number][]) {
      active = Math.max(active, n);
      if (n > ws) {
        byPlatform[p] = n;
        excess += n - ws;
      }
    }
    if (excess > 0) accounts = { active, limit: ws, excess, byPlatform };
  }
  return {
    accounts,
    competitors: activeCompetitorCount != null && activeCompetitorCount > comp
      ? { active: activeCompetitorCount, limit: comp, excess: activeCompetitorCount - comp }
      : null,
  };
}

export async function getOverLimits(supabase: Supa, ent: Entitlements): Promise<OverLimits> {
  const [accounts, competitors] = await Promise.all([
    listConnectedAccountsDetailed(supabase, ent.userId),
    countActiveCompetitors(supabase, ent.userId),
  ]);
  return computeOverLimits(ent, accounts.complete ? activeByPlatform(accounts.accounts) : null, competitors);
}
