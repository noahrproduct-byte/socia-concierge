// The posting streak for the brand in ctx, server side: the posts SOCIA can
// see on its connected accounts, its target history and its finished weeks
// (supabase/posting-streak.sql), and the writing of both. The rules are in
// lib/postingStreak.ts. Everything is written through the service role, since
// a streak earns AI credits. Before the tables exist `ready` is false and the
// caller falls back to the older streak. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import type { getEntitlements } from "./entitlements";
import { createServiceClient } from "./supabase/service";
import { loadSources } from "./api/sources";
import { getProfile } from "./profile";
import type { FbPost } from "./facebookSync";
import type { TtVideo } from "./tiktokAuth";
import {
  PROTECTED_FAILURES, STREAK_LOOKBACK_WEEKS, addDays, canFinalize, canPlanBreak, localDay, postingDaysByWeek, safeZone, streakOf, targetChangeNeeded, targetForWeek, weekLine, weekStartOf, weeksView,
  type LedgerWeek, type PostingStreak, type TargetChange,
} from "./postingStreak";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;
type Ent = Awaited<ReturnType<typeof getEntitlements>>;

const PLATFORM_NAME = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" } as const;

/** One brand's rows: its workspace, or the default brand's (no workspace id). The query builder's own types are too deep to pass through a generic. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoped = (q: any, wsId: string | null): any => (wsId ? q.eq("workspace_id", wsId) : q.is("workspace_id", null));

/** The owner's time zone, as their browser last reported it (components/TimezoneSync.tsx). */
async function ownerZone(svc: Supa, ownerId: string): Promise<string> {
  const { data } = await svc.from("profiles").select("brand_detail").eq("user_id", ownerId).maybeSingle();
  return safeZone((data as { brand_detail?: { timezone?: string } } | null)?.brand_detail?.timezone);
}

/**
 * When the brand's posts went out, from every connected account SOCIA reads
 * plus the posts SOCIA itself published, and the days SOCIA failed to
 * publish through no fault of the person's. A platform that can't be read
 * contributes nothing; it never invents a posting day.
 */
async function seenPosts(svc: Supa, ctx: Ctx, ent: Ent, since: Date): Promise<{ times: string[]; platforms: string[] }> {
  const wsId = ctx.workspace?.id ?? null;
  const times: string[] = [];
  const platforms: string[] = [];
  const src = await loadSources(ctx, ent, { days: 60 }).catch(() => null);
  if (src?.ig) { platforms.push(PLATFORM_NAME.instagram); for (const m of src.ig.media) if (m.timestamp && !m.collab_owner) times.push(m.timestamp); }
  if (src?.fb) { platforms.push(PLATFORM_NAME.facebook); for (const p of ((src.fb.snap as { posts?: FbPost[] }).posts ?? [])) if (p.created_time) times.push(p.created_time); }
  if (src?.yt) { platforms.push(PLATFORM_NAME.youtube); for (const v of src.yt.topVideos ?? []) if (v.publishedAt) times.push(v.publishedAt); }
  if (src?.tt) { platforms.push(PLATFORM_NAME.tiktok); for (const v of (Array.isArray(src.tt.videos) ? (src.tt.videos as TtVideo[]) : [])) if (v.createdAt) times.push(v.createdAt); }
  // What SOCIA published itself, in case a platform read is behind.
  const pub = await scoped(svc.from("scheduled_posts").select("published_at").eq("user_id", ctx.ownerId).eq("status", "published").gte("published_at", since.toISOString()), wsId).limit(500);
  for (const r of ((pub.data ?? []) as { published_at: string | null }[])) if (r.published_at) times.push(r.published_at);
  // A day SOCIA or the platform let a scheduled post down counts as a posting day.
  const failed = await scoped(svc.from("post_destinations").select("scheduled_at, error_code").eq("user_id", ctx.ownerId).eq("status", "failed").in("error_code", PROTECTED_FAILURES).gte("scheduled_at", since.toISOString()), wsId).limit(200);
  for (const r of ((failed.data ?? []) as { scheduled_at: string | null }[])) if (r.scheduled_at) times.push(r.scheduled_at);
  return { times, platforms };
}

async function readHistory(svc: Supa, ownerId: string, wsId: string | null): Promise<{ ready: boolean; history: TargetChange[] }> {
  const { data, error } = await scoped(svc.from("posting_targets").select("days, effective_from").eq("user_id", ownerId), wsId).order("effective_from", { ascending: true }).order("created_at", { ascending: true });
  if (error) return { ready: false, history: [] };
  return { ready: true, history: (data ?? []) as TargetChange[] };
}

type LedgerRow = { id: string; week_start: string; target: number; days: number; qualified: boolean; is_break: boolean; finalized_at: string | null };
async function readLedger(svc: Supa, ownerId: string, wsId: string | null, from: string): Promise<{ ready: boolean; rows: LedgerRow[] }> {
  const { data, error } = await scoped(svc.from("posting_weeks").select("id, week_start, target, days, qualified, is_break, finalized_at").eq("user_id", ownerId), wsId).gte("week_start", from).order("week_start", { ascending: true });
  if (error) return { ready: false, rows: [] };
  return { ready: true, rows: (data ?? []) as LedgerRow[] };
}
const asLedger = (r: LedgerRow): LedgerWeek => ({ week_start: r.week_start, target: r.target, days: r.days, qualified: r.qualified, is_break: r.is_break, finalized: Boolean(r.finalized_at) });

/**
 * Records a change of posting target when the brand's saved routine no longer
 * matches its history. The start date is worked out here, from today in the
 * owner's time zone, so nothing a browser sends can backdate it.
 */
export async function syncPostingTarget(ctx: Ctx, chosen: number | null | undefined, now: Date = new Date()): Promise<void> {
  const svc = createServiceClient();
  if (!svc || !chosen) return;
  const wsId = ctx.workspace?.id ?? null;
  const h = await readHistory(svc, ctx.ownerId, wsId);
  if (!h.ready) return;
  const today = localDay(now, await ownerZone(svc, ctx.ownerId))!;
  const change = targetChangeNeeded(chosen, h.history, today);
  if (!change) return;
  // A second change in the same week replaces the first: only the last choice starts on Monday.
  await scoped(svc.from("posting_targets").delete().eq("user_id", ctx.ownerId), wsId).eq("effective_from", change.effective_from);
  const latest = h.history.filter((x) => x.effective_from < change.effective_from).pop();
  if (latest ? latest.days !== change.days : change.days !== 1) await svc.from("posting_targets").insert({ user_id: ctx.ownerId, workspace_id: wsId, days: change.days, effective_from: change.effective_from });
}

export type BrandStreak = {
  /** False before supabase/posting-streak.sql has run: nothing below is meaningful then. */
  ready: boolean;
  streak: PostingStreak;
  /** What SIO says about this week. */
  line: string;
  /** This week on the calendar: its Monday, today, and the days with a post so far (the person's own time zone). */
  week: { start: string; today: string; posted: string[] };
  /** A target chosen but not started yet. */
  next: { days: number; from: string } | null;
  /** The accounts whose posts count, by name. */
  platforms: string[];
  breaks: { thisWeek: boolean; nextWeek: boolean; canPlanThis: boolean; canPlanNext: boolean };
};

/**
 * The brand's streak as it stands, writing down any week that has finished
 * since the last look and recording a changed target.
 */
export async function brandStreak(ctx: Ctx, ent: Ent, now: Date = new Date()): Promise<BrandStreak | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const wsId = ctx.workspace?.id ?? null;
  const tz = await ownerZone(svc, ctx.ownerId);
  const today = localDay(now, tz)!;
  const cur = weekStartOf(today);
  const from = addDays(cur, -7 * (STREAK_LOOKBACK_WEEKS - 1));
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const chosen = profile?.brand_detail?.growth?.routine?.post_days ?? null;
  await syncPostingTarget(ctx, chosen, now).catch(() => undefined);
  const [h, led, seen] = await Promise.all([readHistory(svc, ctx.ownerId, wsId), readLedger(svc, ctx.ownerId, wsId, from), seenPosts(svc, ctx, ent, new Date(now.getTime() - 70 * 86_400_000))]);
  const empty: PostingStreak = { weeks: 0, longest: 0, strip: [], thisWeek: { days: 0, target: 1, qualified: false, is_break: false } };
  if (!h.ready || !led.ready) return { ready: false, streak: empty, line: "", week: { start: cur, today, posted: [] }, next: null, platforms: seen.platforms, breaks: { thisWeek: false, nextWeek: false, canPlanThis: false, canPlanNext: false } };

  const live = postingDaysByWeek(seen.times, tz);
  const weeks = weeksView({ today, ledger: led.rows.map(asLedger), history: h.history, live });
  // Write down every week that is over and not yet written, but only weeks SOCIA can really see:
  // from the week of the oldest post the platforms returned (their lists are cut off at some number of
  // posts, so anything older is unknown, not empty), and never when no account could be read at all.
  const seenDays = seen.times.map((t) => localDay(t, tz)).filter((d): d is string => Boolean(d)).sort();
  const seenFrom = seen.platforms.length && seenDays.length ? weekStartOf(seenDays[0]) : null;
  for (const w of weeks) {
    if (w.current || !canFinalize(w.week_start, now, tz)) continue;
    const row = led.rows.find((r) => r.week_start === w.week_start);
    if (row?.finalized_at) continue;
    if (!row && (!seenFrom || w.week_start < seenFrom)) continue;
    const values = { target: w.target, days: Math.min(7, w.days), qualified: w.qualified && !w.is_break, is_break: w.is_break, finalized_at: now.toISOString(), updated_at: now.toISOString() };
    const res = row
      ? await svc.from("posting_weeks").update(values).eq("id", row.id)
      : await svc.from("posting_weeks").insert({ user_id: ctx.ownerId, workspace_id: wsId, week_start: w.week_start, ...values });
    if (res.error) console.error("[streak] week not written:", res.error.message);
  }
  const streak = streakOf(weeks);
  const nextStart = addDays(cur, 7);
  const upcoming = h.history.filter((x) => x.effective_from > cur).pop();
  const nextRow = led.rows.find((r) => r.week_start === nextStart);
  const all = led.rows.map(asLedger);
  return {
    ready: true,
    streak,
    line: weekLine(streak.thisWeek),
    week: { start: cur, today, posted: [...(live.get(cur) ?? [])].sort() },
    next: upcoming && upcoming.days !== targetForWeek(cur, h.history) ? { days: upcoming.days, from: upcoming.effective_from } : null,
    platforms: seen.platforms,
    breaks: {
      thisWeek: streak.thisWeek.is_break,
      nextWeek: Boolean(nextRow?.is_break),
      // This week can become a break only while it hasn't already qualified.
      canPlanThis: !streak.thisWeek.is_break && !streak.thisWeek.qualified && canPlanBreak(cur, all),
      canPlanNext: !nextRow?.is_break && canPlanBreak(nextStart, all),
    },
  };
}

/** Plan or cancel a break for this week or the next. Returns an error in words, or null. */
export async function setBreakWeek(ctx: Ctx, which: "this" | "next", on: boolean, now: Date = new Date()): Promise<string | null> {
  const svc = createServiceClient();
  if (!svc) return "SOCIA couldn't save that just now. Try again.";
  const wsId = ctx.workspace?.id ?? null;
  const tz = await ownerZone(svc, ctx.ownerId);
  const cur = weekStartOf(localDay(now, tz)!);
  const ws = which === "this" ? cur : addDays(cur, 7);
  const [h, led] = await Promise.all([readHistory(svc, ctx.ownerId, wsId), readLedger(svc, ctx.ownerId, wsId, addDays(cur, -7 * 12))]);
  if (!h.ready || !led.ready) return "Break weeks aren't available yet.";
  const row = led.rows.find((r) => r.week_start === ws);
  if (row?.finalized_at) return "That week is already over.";
  if (!on) {
    if (row?.is_break) await svc.from("posting_weeks").delete().eq("id", row.id);
    return null;
  }
  if (row?.is_break) return null;
  if (!canPlanBreak(ws, led.rows.map(asLedger))) return "You've planned two break weeks in the last twelve. That's the most a streak allows.";
  const res = await svc.from("posting_weeks").insert({ user_id: ctx.ownerId, workspace_id: wsId, week_start: ws, target: targetForWeek(ws, h.history), days: 0, qualified: false, is_break: true });
  return res.error ? "SOCIA couldn't save that just now. Try again." : null;
}
