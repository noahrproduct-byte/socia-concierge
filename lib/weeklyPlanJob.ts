// The Monday plan. Once a week SOCIA builds the coming week's Content Plan for
// every owner whose plan includes it, from the same evidence a person would
// get by clicking Generate — plus what became of the previous plan — and
// leaves a "your plan is ready" alert in the bell. One plan credit per owner,
// metered exactly like a manual plan. Service role, from the weekly cron.
//
// Who gets one: owners on a plan with the Content Plan feature, whose active
// workspace has a connected Instagram account with at least MIN_POSTS synced
// posts (a plan needs real content to reason over), and who do not already
// have a plan for this week in that workspace. Everything else is skipped and
// counted, never guessed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveWorkspace, competitorScopeId } from "./workspaces";
import { brandWorkspace } from "./context";
import { getEntitlements, canUseFeature, consumeUsage, releaseUsage } from "./entitlements";
import { getIgSnapshot } from "./instagramSync";
import { getProfile } from "./profile";
import { loadEvidence } from "./planEvidence";
import { recentPlanOutcomes } from "./planOutcomesLoad";
import { generatePlan } from "./planGenerate";
import { alertsEnabled, recordAlerts } from "./alerts";
import { planReadyAlert } from "./alertDetectors";
import type { GenerateInput } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** Synced posts a plan needs to reason over (the Content Plan page's own rule). */
export const MIN_POSTS = 5;
const DAY_MS = 86400000;

export type WeeklyPlanRun = {
  ran: boolean;
  owners: number;
  generated: number;
  skipped: Record<"not_entitled" | "already_this_week" | "no_account" | "too_few_posts" | "no_credit" | "out_of_time", number>;
  errors: number;
};

export const isMonday = (d: Date): boolean => d.getUTCDay() === 1;

/** Monday of the week containing `d`, as "Oct 6". */
export function weekLabel(d: Date): string {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
  return m.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function owners(svc: Supa): Promise<string[]> {
  try {
    const { data, error } = await svc.from("workspaces").select("owner_id").is("plan_suspended_at", null);
    if (!error && data) return [...new Set((data as { owner_id: string }[]).map((r) => r.owner_id))];
  } catch {
    /* pre-workspaces */
  }
  try {
    const { data } = await svc.from("instagram_connections").select("user_id");
    return [...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  } catch {
    return [];
  }
}

async function hasPlanThisWeek(svc: Supa, ownerId: string, workspaceId: string | null, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 6 * DAY_MS).toISOString();
  try {
    let q = svc.from("plans").select("id", { count: "exact", head: true }).eq("user_id", ownerId).gte("created_at", since);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { count, error } = await q;
    if (error) throw error;
    return (count ?? 0) > 0;
  } catch {
    // if the plans table cannot be read there is nothing to generate into
    return true;
  }
}

/** Build and store one owner's plan. Returns a skip reason, "generated", or throws. */
export async function generateWeeklyPlanFor(svc: Supa, ownerId: string, now: Date): Promise<keyof WeeklyPlanRun["skipped"] | "generated"> {
  const ent = await getEntitlements(svc, ownerId);
  if (!canUseFeature(ent, "content_plan")) return "not_entitled";

  const ws = await getActiveWorkspace(svc, ownerId);
  const wsId = ws?.id ?? null;
  if (await hasPlanThisWeek(svc, ownerId, wsId, now)) return "already_this_week";

  const snap = await getIgSnapshot(svc, ownerId, wsId).catch(() => null);
  if (!snap) return "no_account";
  const media = snap.media ?? [];
  if (media.length < MIN_POSTS) return "too_few_posts";

  const brandWs = brandWorkspace({ workspace: ws });
  const profile = await getProfile(svc, ownerId, brandWs).catch(() => null);
  const p = (profile ?? null) as { brand_name?: string | null; niche?: string | null; goals?: string | null; brand_detail?: unknown } | null;
  const input: GenerateInput = {
    clientHandle: (brandWs?.brand_name || p?.brand_name || snap.name || (snap.username ? `@${snap.username}` : "")) ?? "",
    niche: (brandWs?.niche || p?.niche) ?? "",
    platform: "Instagram",
    brandVoice: "",
    recentPosts: "",
    competitors: "",
    goal: (brandWs?.goals || p?.goals) ?? "",
  };
  if (!input.clientHandle && !input.niche) return "no_account";

  const outcomes = await recentPlanOutcomes(svc, ownerId, wsId).catch(() => []);
  const evidence = await loadEvidence(svc, ownerId, snap, await competitorScopeId(svc, wsId), { outcomes });

  // One plan credit, counted against the owner exactly as a manual plan is.
  const usage = await consumeUsage(svc, ent, "content_plan");
  if (!usage.allowed) return "no_credit";
  try {
    const { data, saved } = await generatePlan({
      client: svc, ownerId, workspaceId: wsId, input,
      brand: (p?.brand_detail as Parameters<typeof generatePlan>[0]["brand"]) ?? null,
      evidence,
    });
    if (saved && (await alertsEnabled(svc))) {
      await recordAlerts(svc, { userId: ownerId, workspaceId: wsId }, [
        planReadyAlert({ id: saved.id, headline: data.headline ?? "", posts: data.weeklyPlan?.length ?? 0, weekLabel: weekLabel(now) }),
      ]);
    }
    return "generated";
  } catch (e) {
    if (usage.usage.used != null) await releaseUsage(svc, ent, "content_plan").catch(() => null);
    throw e;
  }
}

/** The whole Monday run. `force` runs it on any day (manual trigger). */
export async function runWeeklyPlans(svc: Supa, now: Date = new Date(), budgetMs = 280_000, force = false): Promise<WeeklyPlanRun> {
  const run: WeeklyPlanRun = { ran: false, owners: 0, generated: 0, skipped: { not_entitled: 0, already_this_week: 0, no_account: 0, too_few_posts: 0, no_credit: 0, out_of_time: 0 }, errors: 0 };
  if (!force && !isMonday(now)) return run;
  run.ran = true;
  const deadline = Date.now() + budgetMs;
  const ids = await owners(svc);
  run.owners = ids.length;
  for (const ownerId of ids) {
    // A plan takes one to three minutes; stop starting new ones near the limit.
    if (Date.now() > deadline - 180_000) { run.skipped.out_of_time++; continue; }
    try {
      const r = await generateWeeklyPlanFor(svc, ownerId, now);
      if (r === "generated") run.generated++;
      else run.skipped[r]++;
    } catch (e) {
      run.errors++;
      console.error(`[weekly-plan] ${ownerId}:`, e instanceof Error ? e.message : e);
    }
  }
  return run;
}
