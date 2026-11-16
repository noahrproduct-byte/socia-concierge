// The strategy step's real work, one step after another, each reported as it
// starts and as it finishes (lib/onboardingBuild.ts). Nothing here waits for
// effect: a step ends when its read or its model call ends. Server only.
import type { Ctx } from "./context";
import { getEntitlements } from "./entitlements";
import { readNow, recordStartingPoints, currentGoalValues } from "./briefingLoad";
import { listGoals } from "./growthStore";
import { runInsights } from "./intel/runIntel";
import { listTracked } from "./trackedCompetitors";
import { competitorScopeId } from "./workspaces";
import { generateStrategy, readStrategy, saveStrategy } from "./strategyLoad";
import { GOAL_PLATFORM_NAME, type GrowthProfile } from "./growth";
import { buildReveal, postsInLast, strongestPosts, type BuildEvent, type Reveal } from "./onboardingBuild";

type Emit = (e: BuildEvent) => void;

export async function runStrategyBuild(ctx: Ctx, emit: Emit, now: Date = new Date()): Promise<Reveal> {
  // 1. The accounts: each connected platform's own numbers.
  emit({ type: "stage", id: "accounts", state: "start" });
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const { src, rows } = await readNow(ctx, ent);
  const connected = rows.filter((r) => r.connected);
  const read = connected.filter((r) => r.audience != null || r.views != null || r.contentPublished != null);
  emit({
    type: "stage", id: "accounts", state: "done", ok: read.length > 0,
    lines: connected.length
      ? connected.map((r) => (r.audience != null || r.views != null || r.contentPublished != null
        ? `${GOAL_PLATFORM_NAME[r.platform]}: ${r.label}${r.audience != null ? `, ${r.audience.toLocaleString("en-US")} ${r.audienceLabel}` : ""}`
        : `${GOAL_PLATFORM_NAME[r.platform]} is connected, but no numbers came back yet.`))
      : ["No account is connected, so there were no numbers to read."],
  });

  // 2. The recent posts, and where the goal starts.
  emit({ type: "stage", id: "content", state: "start" });
  const media = src.ig?.media ?? [];
  const { goals } = await listGoals(ctx);
  await recordStartingPoints(ctx, goals).catch(() => goals);
  const intel = await runInsights(ctx, "onboarding").catch(() => null);
  const recent = postsInLast(media, 30, now);
  const contentLines = media.length
    ? [
        `Read ${media.length} of your Instagram posts, ${recent} from the last 30 days.`,
        ...(intel?.tableReady ? [intel.found ? `${intel.found} ${intel.found === 1 ? "pattern" : "patterns"} found in them, each saved with its evidence.` : "Nothing stood out in them yet. SOCIA looks again as more posts come in."] : []),
      ]
    : ["No posts could be read yet, so the strategy rests on your account details and your goal."];
  emit({ type: "stage", id: "content", state: "done", ok: media.length > 0, lines: contentLines, items: strongestPosts(media) });

  // 3. The niche: the competitors already tracked for this brand.
  emit({ type: "stage", id: "niche", state: "start" });
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id).catch(() => null);
  const tracked = await listTracked(ctx.client, ctx.ownerId, "handle", { workspaceId: cwid }).catch(() => []);
  const handles = (tracked as { handle?: string | null }[]).map((t) => t.handle).filter((h): h is string => Boolean(h));
  const niche = src.profile?.niche ?? null;
  emit({
    type: "stage", id: "niche", state: "done", ok: handles.length > 0,
    lines: [
      ...(niche ? [`Your niche: ${niche}.`] : []),
      handles.length
        ? `${handles.length} ${handles.length === 1 ? "competitor is" : "competitors are"} tracked for this brand: ${handles.slice(0, 5).map((h) => `@${h}`).join(", ")}${handles.length > 5 ? " and more" : ""}.`
        : "No competitors are tracked yet, so this strategy uses your own account only. Add them in Discover and SOCIA brings them in.",
    ],
  });

  // 4. The strategy: written once from those facts, or read back when it is already there.
  emit({ type: "stage", id: "strategy", state: "start" });
  let strategy = await readStrategy(ctx).catch(() => null);
  let wrote = false;
  if (!strategy && process.env.ANTHROPIC_API_KEY) {
    strategy = await generateStrategy(ctx, now).catch(() => null);
    if (strategy) wrote = await saveStrategy(ctx, strategy).catch(() => false);
  }
  emit({
    type: "stage", id: "strategy", state: "done", ok: Boolean(strategy),
    lines: strategy
      ? [`${wrote ? "Wrote" : "Read"} your strategy: ${strategy.pillars.length} content ${strategy.pillars.length === 1 ? "pillar" : "pillars"}, ${strategy.frequency.posts_per_week} ${strategy.frequency.posts_per_week === 1 ? "post" : "posts"} a week, ${strategy.priorities.length} priorities.`]
      : ["The strategy couldn't be written just now. You can write it from Plan, under Strategy, at any time."],
  });

  const nowValues = await currentGoalValues(ctx).catch(() => ({}));
  const { goals: saved } = await listGoals(ctx);
  const primary = saved.find((g) => g.kind === "primary" && (g.status ?? "active") === "active") ?? null;
  const daily = ((src.ig?.daily ?? []) as { day?: string; followers_gained?: number | null }[]).filter((d) => d.day && typeof d.followers_gained === "number");
  const since = now.getTime() - 30 * 86_400_000;
  const window = daily.filter((d) => Date.parse(`${d.day}T12:00:00Z`) >= since);
  const growth = (src.profile?.brand_detail?.growth ?? null) as GrowthProfile | null;
  return buildReveal({
    mainGoal: growth?.main_goal ?? null,
    goal: primary,
    nowValues,
    strategy,
    gained: window.length ? window.reduce((n, d) => n + (d.followers_gained as number), 0) : null,
    gainedDays: window.length,
    has: { animated: (ent.config.meters.animated_videos ?? 0) > 0, competitors: handles.length > 0 },
    today: now.toISOString().slice(0, 10),
  });
}
