// The first-week list and the posting streak, server side: what the account
// has really done, read from its own rows, and the perk when one is earned
// (lib/perks/core.ts holds the rules). The perk is written through the
// service role; browsers can't write that row. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { activeAccounts, listConnectedAccounts } from "@/lib/entitlements";
import { firstWeek, firstWeekRewardDue, perkUntil, streakFrom, streakRewardDue, type FirstSignals, type FirstWeek, type Streak } from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const VIDEO_METERS = ["content_studio", "content_build", "video_builds", "animated_videos"];
const ON_CALENDAR = ["scheduled", "publishing", "published"];

/** What the account has done so far, each answer from its own rows. A read that fails counts as not done, never as done. */
async function signals(svc: Supa, ownerId: string): Promise<FirstSignals> {
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { try { const r = await q; return r.error ? 0 : r.count ?? 0; } catch { return 0; } };
  const [accounts, plans, videos, posts] = await Promise.all([
    listConnectedAccounts(svc, ownerId).catch(() => []),
    count(svc.from("plans").select("id", { count: "exact", head: true }).eq("user_id", ownerId)),
    count(svc.from("usage_counters").select("meter", { count: "exact", head: true }).eq("user_id", ownerId).in("meter", VIDEO_METERS).gt("used", 0)),
    count(svc.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", ownerId).in("status", ON_CALENDAR)),
  ]);
  return { connect: activeAccounts(accounts).length > 0, plan: plans > 0, video: videos > 0, schedule: posts > 0 };
}

/** When posts were published through SOCIA in the last 16 weeks. */
async function publishedTimes(svc: Supa, ownerId: string, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 16 * 7 * 86_400_000).toISOString();
  const { data, error } = await svc.from("scheduled_posts").select("published_at, updated_at").eq("user_id", ownerId).eq("status", "published").gte("updated_at", since).limit(500);
  if (error) return [];
  return ((data ?? []) as { published_at: string | null; updated_at: string | null }[]).map((r) => r.published_at ?? r.updated_at).filter((x): x is string => Boolean(x));
}

type Row = { perk_until: string | null; first_week_at: string | null; streak_at: string | null };

/** The perk's own columns; `ready` is false before supabase/perks.sql has run. */
async function perkRow(svc: Supa, ownerId: string): Promise<{ ready: boolean; row: Row }> {
  const empty: Row = { perk_until: null, first_week_at: null, streak_at: null };
  const { data, error } = await svc.from("referral_bonuses").select("perk_until, first_week_at, streak_at").eq("user_id", ownerId).maybeSingle();
  if (error) return { ready: false, row: empty };
  return { ready: true, row: (data as Row | null) ?? empty };
}

/** Turns the perk on (or extends it) and notes what earned it. Returns the saved row, or null when it couldn't be written. */
async function give(svc: Supa, ownerId: string, row: Row, why: "first_week_at" | "streak_at", now: Date): Promise<Row | null> {
  const next: Row = { ...row, perk_until: perkUntil(row.perk_until, now), [why]: now.toISOString() };
  const patch = { perk_until: next.perk_until, [why]: next[why], updated_at: now.toISOString() };
  // The row may already hold this person's invitations or stay boost: change only the perk.
  const upd = await svc.from("referral_bonuses").update(patch).eq("user_id", ownerId).select("user_id");
  if (upd.error) return null;
  if (!upd.data?.length) {
    const ins = await svc.from("referral_bonuses").insert({ user_id: ownerId, ...patch });
    if (ins.error) return null;
  }
  return next;
}

export type PerkStatus = { firstWeek: FirstWeek; firstWeekRewarded: boolean; streak: Streak; streakRewarded: boolean; perkUntil: string | null };

/**
 * The account's first-week list and posting streak as they stand, giving the
 * perk when one has just been earned. Null when it can't be worked out (no
 * service role), in which case nothing is shown.
 */
export async function perkStatus(ownerId: string, createdAt: string | null | undefined, now: Date = new Date()): Promise<PerkStatus | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const [sig, times, saved] = await Promise.all([signals(svc, ownerId), publishedTimes(svc, ownerId, now), perkRow(svc, ownerId)]);
  let row = saved.row;
  const fw = firstWeek(sig, createdAt, row.first_week_at, now);
  const streak = streakFrom(times, now);
  let firstWeekRewarded = Boolean(row.first_week_at);
  let streakRewarded = false;
  if (saved.ready && firstWeekRewardDue(fw, createdAt, row.first_week_at, now)) {
    const next = await give(svc, ownerId, row, "first_week_at", now);
    if (next) { row = next; firstWeekRewarded = true; }
  }
  if (saved.ready && streakRewardDue(streak, row.streak_at, now)) {
    const next = await give(svc, ownerId, row, "streak_at", now);
    if (next) { row = next; streakRewarded = true; }
  }
  // The list is worked out again so a reward given just now shows in it.
  return { firstWeek: firstWeek(sig, createdAt, row.first_week_at, now), firstWeekRewarded, streak, streakRewarded, perkUntil: row.perk_until };
}
