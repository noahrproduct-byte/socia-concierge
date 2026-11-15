// What happens to things beyond a plan's limits after the plan gets smaller
// (a cancelled trial or subscription, a downgrade). Nothing is deleted: the
// extra workspaces, connected accounts and competitors are paused, exactly as
// the person could choose themselves on Settings (socia_apply_plan_keep), and
// they can change that choice there at any time. Without this, a cancelled
// trial kept every Pro-sized resource running on the Free plan.
//
// Defaults when the person hasn't chosen: the default workspace and the
// oldest others stay; per platform the accounts listed first stay; the
// earliest-added competitors stay, in each brand on its own (the competitor
// limit is per brand, Noah 2026-11-15). Server only (service role).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlements, getLimit, listConnectedAccounts } from "./entitlements";
import { PLATFORMS_PER_WORKSPACE } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type DowngradeResult = { workspacesPaused: number; accountsPaused: number; competitorsPaused: number };
export type RestoreResult = { workspacesResumed: number; accountsResumed: number; competitorsResumed: number };

type WsRow = { id: string; is_default: boolean | null; plan_suspended_at: string | null; created_at: string };
type CompRow = { workspace_id?: string | null; platform: string; handle: string; is_active?: boolean | null; added_at?: string | null };

/** Keep the first `n` of `items` per key, in order. */
export function keepFirstPerKey<T>(items: T[], key: (t: T) => string, n: number): T[] {
  const seen = new Map<string, number>();
  return items.filter((t) => {
    const k = key(t);
    const c = seen.get(k) ?? 0;
    if (c >= n) return false;
    seen.set(k, c + 1);
    return true;
  });
}

/**
 * What to resume after a plan grows: everything active stays, then paused
 * items in order until `limit` is reached. Returns the paused ones to resume.
 */
export function resumeWithin<T>(active: T[], paused: T[], limit: number): T[] {
  return paused.slice(0, Math.max(0, limit - active.length));
}

const byAdded = (a: CompRow, b: CompRow) => (a.added_at ?? "").localeCompare(b.added_at ?? "");
const brandOf = (c: CompRow) => c.workspace_id ?? "";

/** Active competitors beyond the limit in each brand: the earliest added stay. */
export function competitorsOverLimit(rows: CompRow[], limit: number): CompRow[] {
  const active = rows.filter((c) => c.is_active !== false).sort(byAdded);
  const kept = keepFirstPerKey(active, brandOf, limit);
  return active.filter((c) => !kept.includes(c));
}

/** Paused competitors that fit again in their brand, earliest added first. */
export function competitorsToResume(rows: CompRow[], limit: number): CompRow[] {
  const out: CompRow[] = [];
  for (const brand of Array.from(new Set(rows.map(brandOf)))) {
    const mine = rows.filter((c) => brandOf(c) === brand).sort(byAdded);
    out.push(...resumeWithin(mine.filter((c) => c.is_active !== false), mine.filter((c) => c.is_active === false), limit));
  }
  return out;
}

/** Set is_active on these rows, one update per brand and platform, never touching another brand's row of the same handle. */
async function setCompetitorsActive(svc: Supa, userId: string, rows: CompRow[], active: boolean): Promise<void> {
  const groups = new Map<string, CompRow[]>();
  for (const c of rows) {
    const k = `${brandOf(c)}|${c.platform}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const list of groups.values()) {
    const { workspace_id: ws, platform } = list[0];
    let q = svc.from("tracked_competitors").update({ is_active: active }).eq("user_id", userId).eq("platform", platform);
    q = ws ? q.eq("workspace_id", ws) : q.is("workspace_id", null);
    const { error } = await q.in("handle", list.map((c) => c.handle));
    if (error) throw new Error(`${active ? "resume" : "pause"} competitors: ${error.message}`);
  }
}

/** Pause whatever is over the person's current plan. A no-op when everything fits. */
export async function enforcePlanLimits(svc: Supa, userId: string, now: Date = new Date()): Promise<DowngradeResult> {
  const out: DowngradeResult = { workspacesPaused: 0, accountsPaused: 0, competitorsPaused: 0 };
  const ent = await getEntitlements(svc, userId);
  const wsLimit = Math.max(1, getLimit(ent, "workspaces"));
  const compLimit = getLimit(ent, "competitors");

  // Workspaces: the default first, then oldest.
  const { data: wsData } = await svc.from("workspaces").select("id, is_default, plan_suspended_at, created_at").eq("owner_id", userId);
  const active = ((wsData ?? []) as WsRow[])
    .filter((w) => !w.plan_suspended_at)
    .sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) || a.created_at.localeCompare(b.created_at));
  const pauseWs = active.slice(wsLimit).map((w) => w.id);
  if (pauseWs.length) {
    const { error } = await svc.from("workspaces").update({ plan_suspended_at: now.toISOString() }).in("id", pauseWs).eq("owner_id", userId);
    if (error) throw new Error(`pause workspaces: ${error.message}`);
    out.workspacesPaused = pauseWs.length;
  }

  // Accounts: at most wsLimit per platform stay active.
  const accounts = (await listConnectedAccounts(svc, userId)).filter((a) => !a.suspended);
  const keepAccounts = keepFirstPerKey(accounts, (a) => a.platform, wsLimit);
  const accountsOver = keepAccounts.length < accounts.length;

  // Competitors: in each brand, the earliest added stay.
  const { data: compData, error: compErr } = await svc.from("tracked_competitors").select("workspace_id, platform, handle, is_active, added_at").eq("user_id", userId);
  if (!compErr) {
    const over = competitorsOverLimit((compData ?? []) as CompRow[], compLimit);
    if (over.length) {
      await setCompetitorsActive(svc, userId, over, false);
      out.competitorsPaused = over.length;
    }
  }

  if (accountsOver) {
    const { error } = await svc.rpc("socia_apply_plan_keep", {
      p_user: userId,
      p_accounts: keepAccounts.map((a) => a.id),
      p_competitors: null,
      p_account_limit: wsLimit * PLATFORMS_PER_WORKSPACE,
      p_competitor_limit: compLimit,
    });
    if (error) throw new Error(`apply plan keep: ${error.message}`);
    if (accountsOver) out.accountsPaused = accounts.length - keepAccounts.length;
  }
  return out;
}

/**
 * The other direction: after an upgrade (or a re-subscribe), resume what an
 * earlier downgrade paused, as far as the plan now allows. A no-op when
 * nothing is paused. Paused workspaces come back default first, then oldest;
 * accounts per platform in the order they are listed; competitors earliest added.
 */
export async function restoreWithinPlan(svc: Supa, userId: string): Promise<RestoreResult> {
  const out: RestoreResult = { workspacesResumed: 0, accountsResumed: 0, competitorsResumed: 0 };
  const ent = await getEntitlements(svc, userId);
  const wsLimit = Math.max(1, getLimit(ent, "workspaces"));
  const compLimit = getLimit(ent, "competitors");

  const { data: wsData } = await svc.from("workspaces").select("id, is_default, plan_suspended_at, created_at").eq("owner_id", userId);
  const order = (a: WsRow, b: WsRow) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) || a.created_at.localeCompare(b.created_at);
  const rows = (wsData ?? []) as WsRow[];
  const resumeWs = resumeWithin(rows.filter((w) => !w.plan_suspended_at), rows.filter((w) => w.plan_suspended_at).sort(order), wsLimit).map((w) => w.id);
  if (resumeWs.length) {
    const { error } = await svc.from("workspaces").update({ plan_suspended_at: null }).in("id", resumeWs).eq("owner_id", userId);
    if (error) throw new Error(`resume workspaces: ${error.message}`);
    out.workspacesResumed = resumeWs.length;
  }

  const accounts = await listConnectedAccounts(svc, userId);
  const keep: string[] = [];
  for (const platform of Array.from(new Set(accounts.map((a) => a.platform)))) {
    const mine = accounts.filter((a) => a.platform === platform);
    const active = mine.filter((a) => !a.suspended);
    const resumed = resumeWithin(active, mine.filter((a) => a.suspended), wsLimit);
    keep.push(...active.map((a) => a.id), ...resumed.map((a) => a.id));
    out.accountsResumed += resumed.length;
  }

  const { data: compData, error: compErr } = await svc.from("tracked_competitors").select("workspace_id, platform, handle, is_active, added_at").eq("user_id", userId);
  if (!compErr) {
    const resumed = competitorsToResume((compData ?? []) as CompRow[], compLimit);
    if (resumed.length) {
      await setCompetitorsActive(svc, userId, resumed, true);
      out.competitorsResumed = resumed.length;
    }
  }

  if (out.accountsResumed) {
    const { error } = await svc.rpc("socia_apply_plan_keep", {
      p_user: userId,
      p_accounts: keep,
      p_competitors: null,
      p_account_limit: wsLimit * PLATFORMS_PER_WORKSPACE,
      p_competitor_limit: compLimit,
    });
    if (error) throw new Error(`apply plan keep: ${error.message}`);
  }
  return out;
}

/** After any plan change: pause what no longer fits, then resume what fits again. */
export async function fitToPlan(svc: Supa, userId: string): Promise<DowngradeResult & RestoreResult> {
  const paused = await enforcePlanLimits(svc, userId);
  const resumed = await restoreWithinPlan(svc, userId);
  return { ...paused, ...resumed };
}
