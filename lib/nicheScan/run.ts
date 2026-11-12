// The niche scan job (lib/nicheScan/plan.ts): started when a brand connects
// an account or finishes onboarding, run in steps by whichever invocation
// claims it (the status route a person is polling, or the scheduled job,
// supabase/niche-scan-cron.sql), its state saved after every step in
// intelligence_jobs.result. Service role; server only.

import { createServiceClient } from "../supabase/service";
import { brandWorkspace, nicheScopeId, type Ctx } from "../context";
import { workspacesByIds, scopeToWorkspace } from "../workspaces";
import { getEntitlements, canUseFeature } from "../entitlements";
import { spendState } from "../aiSpend";
import { scheduleBackground } from "../background";
import { appOrigin } from "../oauth/config";
import { listTracked } from "../trackedCompetitors";
import { isOwnAccount } from "../ownAccounts";
import { igCompetitorRows } from "../igCompetitorData";
import { channelStats, ytConfigured } from "../youtube";
import { igPosts, ytPosts } from "../trendSignalsLoad";
import { isProven, rankTrendingReels, type TrendAccount } from "../trendSignals";
import type { NichePost } from "../nicheTrends";
import { nicheVetted } from "../discovery";
import { storeInsights } from "../intel/insightStore";
import { loadDiscoveryInputs, readStoredDiscovery, runFreshDiscovery } from "../discoveryRun";
import {
  NICHE_SCAN_KIND, SCAN_SIZES, initialState, mergeReels, nextBatch, pickReels, progressView, readState, stepFits,
  type ScanAccount, type ScanProgress, type ScanSize, type ScanState, type ScanStatus,
} from "./plan";
import { buildPlaybook, isFresh, patternCount, playbookInsights, playbookKey, playbookPrompt, readPlaybook, type Playbook, type WatchedReel } from "./playbook";
import { studyBatch, writeTemplates } from "./study";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** One invocation's working time; the routes that run a step allow 300 s. */
export const SLICE_MS = 240_000;
/** A claimed job is left alone this long; after that, another invocation may pick it up. */
export const LEASE_MS = 280_000;
/** A job that hasn't finished after this many steps-in-a-row gives up. */
export const MAX_SLICES = 16;
/** A discovery run younger than this is reused instead of paying for a new one. */
const DISCOVERY_REUSE_MS = 24 * 3_600_000;
/** A job not finished after this long is marked failed. */
const JOB_MAX_AGE_MS = 6 * 3_600_000;

type JobRow = { id: string; user_id: string; workspace_id: string | null; status: ScanStatus; attempts: number; started_at: string | null; created_at: string; finished_at: string | null; result: unknown; error: string | null };
const JOB_COLS = "id, user_id, workspace_id, status, attempts, started_at, created_at, finished_at, result, error";

/** The context a background step runs with: the brand's owner, through the service role. */
async function ctxFor(svc: Supa, userId: string, workspaceId: string | null): Promise<Ctx | null> {
  const ws = workspaceId ? (await workspacesByIds(svc, [workspaceId])).get(workspaceId) ?? null : null;
  if (workspaceId && (!ws || ws.suspended)) return null;
  return { viewerId: userId, ownerId: userId, workspace: ws, role: "owner", client: svc, isOwner: true };
}

async function latestJob(svc: Supa, ownerId: string, workspaceId: string | null): Promise<JobRow | null> {
  const base = svc.from("intelligence_jobs").select(JOB_COLS).eq("user_id", ownerId).eq("kind", NICHE_SCAN_KIND);
  // Without a workspace (before the workspaces migration) only the brand's own rows: workspace_id is null.
  const { data, error } = await (workspaceId ? base.eq("workspace_id", workspaceId) : base.is("workspace_id", null))
    .order("created_at", { ascending: false }).limit(1);
  if (error) return null;
  return ((data ?? []) as JobRow[])[0] ?? null;
}

export async function readStoredPlaybook(client: Supa, scopeId: string): Promise<{ playbook: Playbook | null; updatedAt: string | null }> {
  try {
    const { data } = await client.from("niche_trends").select("data, updated_at").eq("niche", playbookKey(scopeId)).maybeSingle();
    return { playbook: readPlaybook(data?.data), updatedAt: (data?.updated_at as string | undefined) ?? null };
  } catch {
    return { playbook: null, updatedAt: null };
  }
}

/** Ask the scheduled job's route to run a step now, in its own invocation. Best effort. */
function kick(jobId: string): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return;
  scheduleBackground("niche-scan kick", () =>
    fetch(`${appOrigin()}/api/jobs/niche-scan?job=${encodeURIComponent(jobId)}`, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null),
  );
}

/**
 * Start a scan for this brand unless one is already running or its playbook
 * is fresh (a manual start ignores freshness). Never throws: a brand without
 * the jobs table, or without a service key, just doesn't get one.
 */
export async function startNicheScan(ctx: Ctx, trigger: "onboarding" | "manual" | "cron", opts: { force?: boolean; now?: Date } = {}): Promise<string | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const now = opts.now ?? new Date();
  const wsId = ctx.workspace?.id ?? null;
  try {
    const job = await latestJob(svc, ctx.ownerId, wsId);
    if (job && (job.status === "queued" || job.status === "running") && now.getTime() - Date.parse(job.created_at) < JOB_MAX_AGE_MS) {
      kick(job.id);
      return job.id;
    }
    if (!opts.force) {
      const { playbook } = await readStoredPlaybook(svc, nicheScopeId(ctx));
      if (isFresh(playbook, now)) return null;
    }
    const ent = await getEntitlements(svc, ctx.ownerId).catch(() => null);
    const size: ScanSize = ent && canUseFeature(ent, "niche_intelligence") ? "full" : "lite";
    const niche = brandWorkspace(ctx)?.niche ?? null;
    const { data, error } = await svc.from("intelligence_jobs")
      .insert({ user_id: ctx.ownerId, workspace_id: wsId, kind: NICHE_SCAN_KIND, trigger, status: "queued", attempts: 0, result: initialState(size, niche, now) })
      .select("id").single();
    if (error || !data) return null;
    const id = String((data as { id: string }).id);
    kick(id);
    return id;
  } catch (e) {
    console.error("[niche-scan] start", (e as Error)?.message ?? e);
    return null;
  }
}

/** Claim a job for one invocation: only when nobody holds it. */
async function claim(svc: Supa, id: string, now: Date): Promise<JobRow | null> {
  const { data: rows } = await svc.from("intelligence_jobs").select(JOB_COLS).eq("id", id).limit(1);
  const job = ((rows ?? []) as JobRow[])[0];
  if (!job || (job.status !== "queued" && job.status !== "running")) return null;
  const leaseCut = new Date(now.getTime() - LEASE_MS).toISOString();
  const { data } = await svc.from("intelligence_jobs")
    .update({ status: "running", started_at: now.toISOString(), attempts: (job.attempts ?? 0) + 1 })
    .eq("id", id).in("status", ["queued", "running"]).or(`started_at.is.null,started_at.lt.${leaseCut}`)
    .select(JOB_COLS);
  return ((data ?? []) as JobRow[])[0] ?? null;
}

async function save(svc: Supa, id: string, state: ScanState): Promise<void> {
  await svc.from("intelligence_jobs").update({ result: state }).eq("id", id);
}

async function finish(svc: Supa, id: string, state: ScanState, error?: string): Promise<void> {
  await svc.from("intelligence_jobs").update({
    status: error ? "failed" : "done", finished_at: new Date().toISOString(), started_at: null, result: state,
    ...(error ? { error: error.slice(0, 500) } : {}),
  }).eq("id", id);
}

/** Let the next invocation pick the job up straight away. */
async function release(svc: Supa, id: string): Promise<void> {
  await svc.from("intelligence_jobs").update({ started_at: null }).eq("id", id);
}

const handleOf = (h: string) => h.replace(/^@/, "").toLowerCase();

/** One step of the current phase. Mutates and returns the state. */
async function step(ctx: Ctx, state: ScanState, now: Date): Promise<ScanState> {
  const cfg = SCAN_SIZES[state.size];
  switch (state.phase) {
    case "discover": {
      const inputs = await loadDiscoveryInputs(ctx);
      state.niche = inputs.profile.niche ?? state.niche;
      state.scope = inputs.wsId;
      if (!inputs.profile.niche) {
        state.notes.push("SOCIA needs your niche to research it. Add it in Settings, then research again.");
        state.phase = "write";
        return state;
      }
      let doc = await readStoredDiscovery(ctx.client, ctx.ownerId, inputs.wsId, inputs.own);
      const age = doc?.ranAt ? now.getTime() - Date.parse(doc.ranAt) : Infinity;
      // A Free brand gets one discovery run and keeps it (the Discover page's rule); paid plans refresh a day-old one.
      if (!doc || (state.size === "full" && age > DISCOVERY_REUSE_MS)) {
        try {
          doc = await runFreshDiscovery(ctx, inputs);
          if (doc.sources.youtube === "failed") state.notes.push("YouTube search didn't answer this time.");
          if (doc.sources.web !== "ok") state.notes.push("Web search for Instagram accounts didn't answer this time.");
        } catch (e) {
          state.notes.push("Finding new accounts didn't work this time; SOCIA used the accounts it already knew.");
          console.error("[niche-scan] discover", (e as Error)?.message ?? e);
        }
      }
      const tracked = await listTracked<{ platform: string; handle: string }>(ctx.client, ctx.ownerId, "platform, handle", { workspaceId: inputs.wsId }).catch(() => []);
      const pick = (platform: "instagram" | "youtube", max: number): ScanAccount[] => [...new Set([
        ...tracked.filter((t) => t.platform === platform).map((t) => t.handle),
        ...(doc?.accounts ?? []).filter((a) => a.platform === platform && a.handle).map((a) => a.handle!),
      ].map(handleOf))].filter((h) => h && !isOwnAccount(inputs.own, { handle: h })).slice(0, max).map((handle) => ({ platform, handle }));
      state.accounts = [...pick("instagram", cfg.igAccounts), ...(ytConfigured() ? pick("youtube", cfg.ytAccounts) : [])];
      state.counts.accounts = state.accounts.length;
      state.phase = "read";
      return state;
    }
    case "read": {
      const ig = state.accounts.filter((a) => a.platform === "instagram");
      if (state.igRead < ig.length) {
        // Business Discovery reads ten accounts per call (lib/igCompetitorData.ts caches each for six hours).
        const batch = ig.slice(state.igRead, state.igRead + 10).map((a) => a.handle);
        const res = await igCompetitorRows(ctx.client, ctx.ownerId, batch).catch(() => null);
        state.igRead += batch.length;
        if (!res?.enabled) {
          if (!state.notes.some((n) => n.startsWith("Instagram"))) state.notes.push("Instagram accounts couldn't be read: SOCIA needs a connected Facebook Page or its research account.");
        } else {
          const accounts: TrendAccount[] = res.competitors.filter((c) => c.found).map((c) => ({ platform: "instagram", name: (c.displayName ?? `@${c.handle}`).trim(), handle: c.handle, avatar: c.profilePicture ?? null, posts: igPosts(c) }));
          state.counts.accountsRead += accounts.length;
          state.reels = mergeReels(state.reels, rankTrendingReels(accounts, [], now));
        }
        state.counts.reelsRead = state.reels.length;
        return state;
      }
      if (!state.ytRead) {
        const yt = state.accounts.filter((a) => a.platform === "youtube");
        const stats = await Promise.all(yt.map((a) => channelStats(a.handle).catch(() => null)));
        const accounts: TrendAccount[] = stats.filter((s): s is NonNullable<typeof s> => Boolean(s?.found)).map((s) => ({ platform: "youtube", name: (s.title ?? `@${s.handle}`).trim(), handle: s.handle, avatar: s.avatar ?? null, posts: ytPosts(s) }));
        state.counts.accountsRead += accounts.length;
        // The Shorts discovery found, with the numbers YouTube published (web-research links carry none and can't be ranked).
        const content: NichePost[] = await (async () => {
          try {
            const { data } = await scopeToWorkspace(ctx.client.from("discovered_content")
              .select("content_url, platform, account_name, account_handle, title, thumbnail_url, views, likes, comments, published_at, content_type, multiplier, data_source, relevance_reasons")
              .eq("user_id", ctx.ownerId), state.scope ?? null).in("content_type", ["short", "reel"]).limit(120);
            return ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted).filter((r) => r.views != null || r.multiplier != null).map((r) => ({
              url: String(r.content_url), platform: String(r.platform), accountName: (r.account_name as string) ?? null, accountHandle: (r.account_handle as string) ?? null,
              title: (r.title as string) ?? null, thumb: (r.thumbnail_url as string) ?? null,
              views: (r.views as number) ?? null, likes: (r.likes as number) ?? null, comments: (r.comments as number) ?? null,
              publishedAt: (r.published_at as string) ?? null, multiplier: r.multiplier != null ? Number(r.multiplier) : null,
              relevanceScore: 0, tags: [], format: r.content_type === "short" ? "Short" : "Reel", why: null, dataSource: String(r.data_source ?? "youtube_api"),
            }));
          } catch { return []; }
        })();
        state.reels = mergeReels(state.reels, rankTrendingReels(accounts, content, now));
        state.counts.reelsRead = state.reels.length;
        state.ytRead = true;
        return state;
      }
      state.phase = "pick";
      return state;
    }
    case "pick": {
      state.picked = pickReels(state.reels, state.size);
      state.counts.proven = state.reels.filter(isProven).length;
      state.counts.toWatch = state.picked.length;
      if (!state.reels.length) state.notes.push("SOCIA couldn't find recent public Reels in your niche to read yet.");
      state.phase = state.picked.length ? "watch" : "write";
      return state;
    }
    case "watch": {
      const batch = nextBatch(state);
      if (!batch.length) { state.phase = "write"; return state; }
      const watched = await studyBatch(ctx.ownerId, state.niche, batch);
      for (const w of watched) state.watched[w.id] = w;
      state.counts.watched = Object.keys(state.watched).length;
      state.counts.withFrames = Object.values(state.watched).filter((w) => (w as { read?: string }).read === "frames").length;
      if (!nextBatch(state).length) state.phase = "write";
      return state;
    }
    case "write": {
      const watched = Object.values(state.watched) as WatchedReel[];
      const templates = watched.length ? await writeTemplates(ctx.ownerId, state.niche, watched).catch(() => ({ texts: [], hooks: [] })) : { texts: [], hooks: [] };
      const playbook = buildPlaybook({ niche: state.niche, now, watched, read: state.picked, accountsRead: state.counts.accountsRead, texts: templates.texts, hooks: templates.hooks, notes: state.notes });
      playbook.scanned.reels = state.counts.reelsRead;
      await ctx.client.from("niche_trends").upsert({ niche: playbookKey(nicheScopeId(ctx)), data: playbook, updated_at: playbook.builtAt }, { onConflict: "niche" });
      await storeInsights(ctx, ["niche_scan"], playbookInsights(playbook), now).catch(() => null);
      state.counts.patterns = patternCount(playbook);
      state.phase = "done";
      return state;
    }
    default:
      return state;
  }
}

/** Over the plan's monthly AI ceiling: the steps that call a model stop here. */
async function overBudget(ownerId: string): Promise<boolean> {
  const svc = createServiceClient();
  if (!svc) return false;
  const ent = await getEntitlements(svc, ownerId).catch(() => null);
  if (!ent) return false;
  const s = await spendState(ownerId, ent).catch(() => null);
  return Boolean(s?.over);
}

/**
 * Run steps of one job until it is done or this invocation's time is up,
 * saving after every step. Returns the job's phase afterwards, or null when
 * someone else holds it.
 */
export async function runSlice(svc: Supa, jobId: string, budgetMs = SLICE_MS): Promise<ScanState["phase"] | null> {
  const started = Date.now();
  const now = new Date();
  const job = await claim(svc, jobId, now);
  if (!job) return null;
  let state = readState(job.result) ?? initialState("lite", null, now);
  if (job.attempts > MAX_SLICES || now.getTime() - Date.parse(job.created_at) > JOB_MAX_AGE_MS) {
    await finish(svc, jobId, state, "The research took too long and stopped.");
    return state.phase;
  }
  const ctx = await ctxFor(svc, job.user_id, job.workspace_id);
  if (!ctx) { await finish(svc, jobId, state, "This brand is paused or was removed."); return state.phase; }
  try {
    let checkedBudget = false;
    while (state.phase !== "done" && stepFits(state.phase, budgetMs - (Date.now() - started))) {
      if ((state.phase === "watch" || state.phase === "write") && !checkedBudget) {
        checkedBudget = true;
        if (await overBudget(ctx.ownerId)) {
          if (state.phase === "watch") {
            state.notes.push("This month's AI allowance ran out, so SOCIA studied fewer Reels.");
            state.picked = state.picked.filter((r) => r.id in state.watched);
            state.counts.toWatch = state.picked.length;
            state.phase = "write";
          }
        }
      }
      state = await step(ctx, state, new Date());
      await save(svc, jobId, state);
    }
    if (state.phase === "done") await finish(svc, jobId, state);
    else await release(svc, jobId);
    return state.phase;
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[niche-scan] step", state.phase, msg);
    // A failed step is tried again by the next invocation, up to MAX_SLICES in all.
    await save(svc, jobId, state).catch(() => null);
    await release(svc, jobId).catch(() => null);
    return state.phase;
  }
}

/** Jobs waiting for an invocation: not held, not too old. */
export async function waitingJobs(svc: Supa, now: Date, limit = 3): Promise<string[]> {
  const leaseCut = new Date(now.getTime() - LEASE_MS).toISOString();
  const since = new Date(now.getTime() - JOB_MAX_AGE_MS).toISOString();
  const { data, error } = await svc.from("intelligence_jobs").select("id")
    .eq("kind", NICHE_SCAN_KIND).in("status", ["queued", "running"]).gte("created_at", since)
    .or(`started_at.is.null,started_at.lt.${leaseCut}`).order("created_at", { ascending: true }).limit(limit);
  return error ? [] : ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/** Close jobs that ran out of time without finishing. */
export async function closeStale(svc: Supa, now: Date): Promise<void> {
  const since = new Date(now.getTime() - JOB_MAX_AGE_MS).toISOString();
  await svc.from("intelligence_jobs").update({ status: "failed", finished_at: now.toISOString(), error: "The research took too long and stopped." })
    .eq("kind", NICHE_SCAN_KIND).in("status", ["queued", "running"]).lt("created_at", since);
}

/** Brands whose playbook is older than a week: up to `limit`, oldest first. */
export async function duePlaybooks(svc: Supa, now: Date, limit = 3): Promise<{ userId: string; workspaceId: string | null }[]> {
  const cut = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await svc.from("niche_trends").select("niche, updated_at").like("niche", "%:playbook:v1").lt("updated_at", cut).order("updated_at", { ascending: true }).limit(limit);
  if (error) return [];
  return ((data ?? []) as { niche: string }[]).map((r) => {
    const parts = r.niche.replace(/:playbook:v1$/, "").split(":");
    return { userId: parts[0], workspaceId: parts[1] ?? null };
  }).filter((b) => /^[0-9a-f-]{36}$/i.test(b.userId));
}

/** Start the weekly refresh for a brand from the scheduled job. */
export async function refreshBrand(svc: Supa, b: { userId: string; workspaceId: string | null }): Promise<string | null> {
  const ctx = await ctxFor(svc, b.userId, b.workspaceId);
  return ctx ? startNicheScan(ctx, "cron", { force: true }) : null;
}

export type ScanView = { jobId: string | null; progress: ScanProgress | null; playbook: Playbook | null; playbookAt: string | null; niche: string | null };

/**
 * What the card shows for the active brand: the latest scan's progress and
 * the stored playbook. A scan waiting for an invocation gets one here, so a
 * person watching the card keeps it moving.
 */
export async function readScan(ctx: Ctx, opts: { continueRun?: boolean } = {}): Promise<ScanView> {
  const svc = createServiceClient() ?? ctx.client;
  const [job, stored] = await Promise.all([latestJob(svc, ctx.ownerId, ctx.workspace?.id ?? null), readStoredPlaybook(svc, nicheScopeId(ctx))]);
  const state = readState(job?.result);
  if (job && opts.continueRun !== false && (job.status === "queued" || job.status === "running")) {
    const held = job.started_at && Date.now() - Date.parse(job.started_at) < LEASE_MS;
    if (!held && createServiceClient()) scheduleBackground("niche-scan step", () => runSlice(svc, job.id));
  }
  return {
    jobId: job?.id ?? null,
    progress: job ? progressView(state, job.status, state?.startedAt ?? job.created_at) : null,
    playbook: stored.playbook,
    playbookAt: stored.updatedAt,
    niche: state?.niche ?? stored.playbook?.niche ?? brandWorkspace(ctx)?.niche ?? null,
  };
}

/** The playbook as prompt text for the editor, ideas and plans; "" when there is none. */
export async function playbookText(client: Supa, scopeId: string): Promise<string> {
  const { playbook } = await readStoredPlaybook(client, scopeId);
  return playbookPrompt(playbook);
}

/**
 * The playbook text for a brand known only by owner and workspace id: the
 * workspace's own playbook, else the default brand's (its key is the owner's
 * id alone). Read with the service role when there is one.
 */
export async function playbookTextFor(client: Supa, ownerId: string, workspaceId: string | null | undefined): Promise<string> {
  const db = createServiceClient() ?? client;
  if (workspaceId) {
    const scoped = await playbookText(db, `${ownerId}:${workspaceId}`).catch(() => "");
    if (scoped) return scoped;
  }
  return playbookText(db, ownerId).catch(() => "");
}
