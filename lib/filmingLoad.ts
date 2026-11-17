// The filming sessions for the brand in ctx: its routine, its latest Content
// Plan and today in the owner's time zone, laid out by lib/filmingPlan.ts.
// Reads only. Server only.
import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { getProfile } from "./profile";
import { scopeToWorkspace } from "./workspaces";
import { planWeekStart } from "./dailyRecs";
import { localDay, safeZone } from "./postingStreak";
import { filmingLine, filmingPlan, nextSession, unplacedWhy, type FilmPost, type FilmSession, type FilmingPlan } from "./filmingPlan";
import type { CreationStyle, FilmingSlot } from "./routine";

const DAY = 86_400_000;

export type FilmingView = {
  /** The person has told SIO which days they film. */
  hasFilmingDays: boolean;
  filming: FilmingSlot[];
  style: CreationStyle | null;
  today: string;
  planId: string | null;
  /** The Monday of the week the plan is for. */
  planMonday: string | null;
  line: string | null;
  next: { session: FilmSession; isToday: boolean } | null;
  sessions: FilmSession[];
  unplaced: { title: string; publish: string; why: string }[];
  left_out: FilmingPlan["left_out"];
  total: number;
};

export async function filmingFor(ctx: Ctx, now: Date = new Date()): Promise<FilmingView> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const routine = profile?.brand_detail?.growth?.routine ?? null;
  // The owner's own time zone (components/TimezoneSync.tsx keeps it on their profile row).
  const own = await ctx.client.from("profiles").select("brand_detail").eq("user_id", ctx.ownerId).maybeSingle();
  const tz = safeZone((own.data as { brand_detail?: { timezone?: string } } | null)?.brand_detail?.timezone);
  const today = localDay(now, tz)!;
  const base: FilmingView = { hasFilmingDays: Boolean(routine?.filming?.length), filming: routine?.filming ?? [], style: routine?.style ?? null, today, planId: null, planMonday: null, line: null, next: null, sessions: [], unplaced: [], left_out: { animated: 0, claude: 0 }, total: 0 };
  const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data, created_at").eq("user_id", ctx.ownerId), ctx.workspace?.id).order("created_at", { ascending: false }).limit(1);
  const row = ((data ?? []) as { id: string; created_at: string; data: { weeklyPlan?: FilmPost[] } | null }[])[0];
  if (!row) return base;
  const planMonday = new Date(planWeekStart(row.created_at, tz) * DAY).toISOString().slice(0, 10);
  // A plan whose week is over has nothing left to film.
  if (new Date(Date.parse(`${planMonday}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10) < today) return { ...base, planId: row.id, planMonday };
  const plan = filmingPlan({ routine, posts: row.data?.weeklyPlan ?? [], planMonday, today });
  return {
    ...base, planId: row.id, planMonday,
    line: base.hasFilmingDays ? filmingLine(plan, today) : null,
    next: nextSession(plan, today),
    sessions: plan.sessions,
    unplaced: plan.unplaced.map((u) => ({ title: u.item.title, publish: u.item.publish, why: unplacedWhy(u) })),
    left_out: plan.left_out,
    total: plan.total,
  };
}
