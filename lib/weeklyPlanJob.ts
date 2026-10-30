// The Sunday plan. Every Sunday at 6 PM in the person's own time zone (Noah,
// 2026-10-30), SOCIA builds the coming week's Content Plan for owners on a
// paid plan, from the same evidence a person gets by clicking Generate (their
// Growth Strategy, posts, formats, what became of the last plan), and leaves a
// "your plan is ready" alert in the bell. One plan credit per owner, metered
// exactly like a manual plan. Service role, from the plan cron, which calls
// every 15 minutes from Sunday to Tuesday UTC (every time zone's Sunday
// evening falls inside it); each call builds only the plans now due.
//
// Who gets one: owners on a paid plan whose active workspace has a connected
// Instagram account with at least MIN_POSTS synced posts, at Sunday 6 PM
// their time or later (until Monday noon, for a run that was missed), with no
// plan made since the Thursday before. Everything else is skipped and
// counted, never guessed. The plan after onboarding (lib/initialPlan.ts) uses
// the same inputs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveWorkspace, competitorScopeId, type Workspace } from "./workspaces";
import { brandWorkspace } from "./context";
import { getEntitlements, canUseFeature, consumeUsage, releaseUsage } from "./entitlements";
import { getIgSnapshot, type IgSnapshot } from "./instagramSync";
import { getProfile, type BrandDetail } from "./profile";
import { loadEvidence, type Evidence } from "./planEvidence";
import { recentPlanOutcomes } from "./planOutcomesLoad";
import { generatePlan } from "./planGenerate";
import { alertsEnabled, recordAlerts } from "./alerts";
import { planReadyAlert } from "./alertDetectors";
import type { GenerateInput } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** Synced posts a plan needs to reason over (the Content Plan page's own rule). */
export const MIN_POSTS = 5;
/** Local hour on Sunday the plan is due; a missed run catches up until Monday at MONDAY_CUTOFF. */
export const SUNDAY_HOUR = 18;
export const MONDAY_CUTOFF = 12;
const DAY_MS = 86400000;

export type WeeklyPlanRun = {
  owners: number;
  due: number;
  generated: number;
  skipped: Record<"not_due" | "not_entitled" | "already_this_week" | "no_account" | "too_few_posts" | "no_credit" | "out_of_time", number>;
  errors: number;
};

// ---------------------------------------------------------------------------
// The person's clock (pure)
// ---------------------------------------------------------------------------

export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Weekday (0 = Sunday), hour and minute at `now` in `tz`. */
export function localClock(now: Date, tz: string): { weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hour: Number(get("hour")), minute: Number(get("minute")) };
}

/**
 * Is the coming week's plan due now, in this time zone? From Sunday 6 PM to
 * Monday noon, unless a plan was already made since Thursday 00:00 local (a
 * plan made Thursday or later is already for the coming week, the same rule
 * the Content Plan uses when it puts a plan on the Calendar). Counted in
 * local hours, so across a daylight-saving change that boundary can be an
 * hour off.
 */
export function sundayPlanDue(now: Date, tz: string, lastPlanAt: string | null): boolean {
  const c = localClock(now, isTimeZone(tz) ? tz : "UTC");
  const inWindow = (c.weekday === 0 && c.hour >= SUNDAY_HOUR) || (c.weekday === 1 && c.hour < MONDAY_CUTOFF);
  if (!inWindow) return false;
  if (!lastPlanAt) return true;
  const hoursSinceThursday = (c.weekday === 0 ? 72 : 96) + c.hour + c.minute / 60;
  return now.getTime() - Date.parse(lastPlanAt) >= hoursSinceThursday * 3_600_000;
}

/** The Monday the plan is for, as "Nov 3", in the person's time zone. */
export function comingWeekLabel(now: Date, tz: string): string {
  const c = localClock(now, isTimeZone(tz) ? tz : "UTC");
  const monday = new Date(now.getTime() + (c.weekday === 0 ? DAY_MS : 0));
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: isTimeZone(tz) ? tz : "UTC" });
}

// ---------------------------------------------------------------------------
// Inputs shared with the plan after onboarding
// ---------------------------------------------------------------------------

export type PlanInputs = { input: GenerateInput; brand: BrandDetail | null; evidence: Evidence; snap: IgSnapshot | null };

/** What a plan for this brand is written from: the brand's profile and strategy, and the evidence SOCIA holds. Null when there is nothing to name the account by. */
export async function planInputsFor(svc: Supa, ownerId: string, ws: Workspace | null, snap: IgSnapshot | null): Promise<PlanInputs | null> {
  const wsId = ws?.id ?? null;
  const brandWs = brandWorkspace({ workspace: ws });
  const profile = await getProfile(svc, ownerId, brandWs).catch(() => null);
  const input: GenerateInput = {
    clientHandle: (brandWs?.brand_name || profile?.brand_name || snap?.name || (snap?.username ? `@${snap.username}` : "")) ?? "",
    niche: (brandWs?.niche || profile?.niche) ?? "",
    platform: "Instagram",
    brandVoice: "",
    recentPosts: "",
    competitors: "",
    goal: (brandWs?.goals || profile?.goals) ?? "",
  };
  if (!input.clientHandle && !input.niche) return null;
  const outcomes = await recentPlanOutcomes(svc, ownerId, wsId).catch(() => []);
  const evidence = await loadEvidence(svc, ownerId, snap, await competitorScopeId(svc, wsId), { outcomes });
  return { input, brand: profile?.brand_detail ?? null, evidence, snap };
}

async function lastPlanAt(svc: Supa, ownerId: string, workspaceId: string | null): Promise<string | null | "unreadable"> {
  try {
    let q = svc.from("plans").select("created_at").eq("user_id", ownerId).order("created_at", { ascending: false }).limit(1);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null;
  } catch {
    // If the plans table can't be read there is nothing to generate into.
    return "unreadable";
  }
}

/** The person's own time zone, from their profile row; UTC until their browser has reported one. */
async function ownerTimeZone(svc: Supa, ownerId: string): Promise<string> {
  try {
    const { data } = await svc.from("profiles").select("brand_detail").eq("user_id", ownerId).maybeSingle();
    const tz = (data as { brand_detail?: { timezone?: string } } | null)?.brand_detail?.timezone;
    return tz && isTimeZone(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
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

/** Build and store one owner's plan if it is due (or `force`). Returns a skip reason, "generated", or throws. */
export async function generateWeeklyPlanFor(svc: Supa, ownerId: string, now: Date, force = false): Promise<keyof WeeklyPlanRun["skipped"] | "generated"> {
  const ws = await getActiveWorkspace(svc, ownerId);
  const wsId = ws?.id ?? null;
  const [tz, last] = await Promise.all([ownerTimeZone(svc, ownerId), lastPlanAt(svc, ownerId, wsId)]);
  if (last === "unreadable") return "already_this_week";
  if (!force && !sundayPlanDue(now, tz, last)) return "not_due";

  const ent = await getEntitlements(svc, ownerId);
  // Free has one plan a month to use by hand; the automatic plan is for paid plans.
  if (ent.plan === "free" || !canUseFeature(ent, "content_plan")) return "not_entitled";

  const snap = await getIgSnapshot(svc, ownerId, wsId).catch(() => null);
  if (!snap) return "no_account";
  if ((snap.media ?? []).length < MIN_POSTS) return "too_few_posts";

  const inputs = await planInputsFor(svc, ownerId, ws, snap);
  if (!inputs) return "no_account";

  // One plan credit, counted against the owner exactly as a manual plan is.
  const usage = await consumeUsage(svc, ent, "content_plan");
  if (!usage.allowed) return "no_credit";
  try {
    const { data, saved } = await generatePlan({ client: svc, ownerId, workspaceId: wsId, input: inputs.input, brand: inputs.brand, evidence: inputs.evidence });
    if (saved && (await alertsEnabled(svc))) {
      await recordAlerts(svc, { userId: ownerId, workspaceId: wsId }, [
        planReadyAlert({ id: saved.id, headline: data.headline ?? "", posts: data.weeklyPlan?.length ?? 0, weekLabel: comingWeekLabel(now, tz) }),
      ]);
    }
    return "generated";
  } catch (e) {
    if (usage.usage.used != null) await releaseUsage(svc, ent, "content_plan").catch(() => null);
    throw e;
  }
}

/** One cron call: every owner whose Sunday plan is due now. `force` builds for everyone eligible, on any day (manual trigger). */
export async function runWeeklyPlans(svc: Supa, now: Date = new Date(), budgetMs = 280_000, force = false): Promise<WeeklyPlanRun> {
  const run: WeeklyPlanRun = { owners: 0, due: 0, generated: 0, skipped: { not_due: 0, not_entitled: 0, already_this_week: 0, no_account: 0, too_few_posts: 0, no_credit: 0, out_of_time: 0 }, errors: 0 };
  const deadline = Date.now() + budgetMs;
  const ids = await owners(svc);
  run.owners = ids.length;
  for (const ownerId of ids) {
    // A plan takes one to three minutes; stop starting new ones near the limit
    // (the next call, 15 minutes on, picks up where this one stopped).
    if (Date.now() > deadline - 180_000) { run.skipped.out_of_time++; continue; }
    try {
      const r = await generateWeeklyPlanFor(svc, ownerId, now, force);
      if (r !== "not_due") run.due++;
      if (r === "generated") run.generated++;
      else run.skipped[r]++;
    } catch (e) {
      run.errors++;
      console.error(`[weekly-plan] ${ownerId}:`, e instanceof Error ? e.message : e);
    }
  }
  return run;
}
