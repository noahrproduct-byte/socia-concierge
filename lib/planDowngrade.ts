// What happens to things beyond a plan's limits after the plan gets smaller
// (a cancelled trial or subscription, a downgrade). Nothing is deleted: the
// extra workspaces, connected accounts and competitors are paused, exactly as
// the person could choose themselves on Settings (socia_apply_plan_keep), and
// they can change that choice there at any time. Without this, a cancelled
// trial kept every Pro-sized resource running on the Free plan.
//
// Defaults when the person hasn't chosen: the default workspace and the
// oldest others stay; per platform the accounts listed first stay; the
// earliest-added competitors stay. Server only (service role).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlements, getLimit, listConnectedAccounts } from "./entitlements";
import { PLATFORMS_PER_WORKSPACE } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type DowngradeResult = { workspacesPaused: number; accountsPaused: number; competitorsPaused: number };

type WsRow = { id: string; is_default: boolean | null; plan_suspended_at: string | null; created_at: string };
type CompRow = { platform: string; handle: string; is_active?: boolean | null; added_at?: string | null };

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

  // Competitors: the earliest added stay.
  let keepCompetitors: string[] | null = null;
  const { data: compData, error: compErr } = await svc.from("tracked_competitors").select("platform, handle, is_active, added_at").eq("user_id", userId);
  if (!compErr) {
    const activeComps = ((compData ?? []) as CompRow[])
      .filter((c) => c.is_active !== false)
      .sort((a, b) => (a.added_at ?? "").localeCompare(b.added_at ?? ""));
    if (activeComps.length > compLimit) {
      keepCompetitors = Array.from(new Set(activeComps.slice(0, compLimit).map((c) => `${c.platform}:${c.handle}`)));
      out.competitorsPaused = activeComps.length - compLimit;
    }
  }

  if (accountsOver || keepCompetitors) {
    const { error } = await svc.rpc("socia_apply_plan_keep", {
      p_user: userId,
      p_accounts: accountsOver ? keepAccounts.map((a) => a.id) : null,
      p_competitors: keepCompetitors,
      p_account_limit: wsLimit * PLATFORMS_PER_WORKSPACE,
      p_competitor_limit: compLimit,
    });
    if (error) throw new Error(`apply plan keep: ${error.message}`);
    if (accountsOver) out.accountsPaused = accounts.length - keepAccounts.length;
  }
  return out;
}
