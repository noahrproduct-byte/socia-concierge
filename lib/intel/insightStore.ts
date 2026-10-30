// Reads and writes the shared intelligence store (supabase/intelligence.sql)
// for the brand in ctx, always scoped to its workspace. One finding per
// fingerprint: a re-run updates it in place; a finding its producer no
// longer sees is marked superseded (never deleted); one the person dismissed
// stays dismissed. Before the migration has run every call reports
// tableReady: false and changes nothing.
//
// Server only.

import type { Ctx } from "../context";
import { scopeToWorkspace } from "../workspaces";
import { isMissingTableError } from "../publishing/db";
import { cleanDraft, type InsightDraft, type StoredInsight } from "./insight";

const wsOf = (ctx: Ctx) => ctx.workspace?.id ?? null;
const COLS = "id, fingerprint, producer, category, platform, title, observation, metrics, posts, period_start, period_end, explanations, confidence, limitations, recommendation, source, status, created_at, updated_at, last_seen_at";

type Row = Record<string, unknown>;
const toStored = (r: Row): StoredInsight => ({
  id: String(r.id),
  fingerprint: String(r.fingerprint),
  producer: String(r.producer),
  category: r.category as StoredInsight["category"],
  platform: (r.platform as StoredInsight["platform"]) ?? null,
  title: String(r.title),
  observation: String(r.observation),
  metrics: (r.metrics as StoredInsight["metrics"]) ?? [],
  posts: (r.posts as StoredInsight["posts"]) ?? [],
  periodStart: (r.period_start as string | null) ?? null,
  periodEnd: (r.period_end as string | null) ?? null,
  explanations: (r.explanations as StoredInsight["explanations"]) ?? [],
  confidence: Number(r.confidence) || 0,
  limitations: (r.limitations as string[]) ?? [],
  recommendation: (r.recommendation as StoredInsight["recommendation"]) ?? null,
  source: (r.source as StoredInsight["source"]) ?? { rule: "", data: [], retrievedAt: null },
  status: r.status as StoredInsight["status"],
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  lastSeenAt: String(r.last_seen_at),
});

const toRow = (d: InsightDraft, now: string) => ({
  fingerprint: d.fingerprint,
  producer: d.producer,
  category: d.category,
  platform: d.platform,
  title: d.title,
  observation: d.observation,
  metrics: d.metrics,
  posts: d.posts,
  period_start: d.periodStart,
  period_end: d.periodEnd,
  explanations: d.explanations,
  confidence: d.confidence,
  limitations: d.limitations,
  recommendation: d.recommendation,
  source: d.source,
  updated_at: now,
  last_seen_at: now,
});

export async function listInsights(ctx: Ctx, opts: { status?: StoredInsight["status"]; limit?: number } = {}): Promise<{ tableReady: boolean; insights: StoredInsight[] }> {
  try {
    const { data, error } = await scopeToWorkspace(
      ctx.client.from("insights").select(COLS).eq("user_id", ctx.ownerId),
      wsOf(ctx),
    ).eq("status", opts.status ?? "active").order("confidence", { ascending: false }).order("updated_at", { ascending: false }).limit(opts.limit ?? 50);
    if (error) return { tableReady: !isMissingTableError(error), insights: [] };
    return { tableReady: true, insights: ((data ?? []) as Row[]).map(toStored) };
  } catch {
    return { tableReady: false, insights: [] };
  }
}

/**
 * Store one run's findings for the given producers. Returns how many were
 * added, updated and superseded, or tableReady: false before the migration.
 */
/** One producer's active findings for a brand, for readers without a full Ctx (plan writer, Ask SOCIA). Empty on any error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function activeFindings(client: any, ownerId: string, workspaceId: string | null | undefined, producer: string, limit = 10): Promise<StoredInsight[]> {
  try {
    const { data, error } = await scopeToWorkspace(client.from("insights").select(COLS).eq("user_id", ownerId), workspaceId)
      .eq("producer", producer).eq("status", "active").order("confidence", { ascending: false }).limit(limit);
    return error ? [] : ((data ?? []) as Row[]).map(toStored);
  } catch {
    return [];
  }
}

export async function storeInsights(ctx: Ctx, producers: string[], drafts: InsightDraft[], now = new Date()): Promise<{ tableReady: boolean; added: number; updated: number; superseded: number }> {
  const at = now.toISOString();
  const clean = drafts.map(cleanDraft).filter((d): d is InsightDraft => d !== null);
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("insights").select("id, fingerprint, producer, status").eq("user_id", ctx.ownerId),
    wsOf(ctx),
  ).in("producer", producers);
  if (error) return { tableReady: !isMissingTableError(error), added: 0, updated: 0, superseded: 0 };
  const existing = new Map(((data ?? []) as { id: string; fingerprint: string; status: string }[]).map((r) => [r.fingerprint, r]));

  let added = 0, updated = 0, superseded = 0;
  for (const d of clean) {
    const row = toRow(d, at);
    const prev = existing.get(d.fingerprint);
    if (prev) {
      // Dismissed stays dismissed; anything else found again is active again.
      const status = prev.status === "dismissed" ? "dismissed" : "active";
      const { error: e } = await scopeToWorkspace(ctx.client.from("insights").update({ ...row, status }).eq("user_id", ctx.ownerId), wsOf(ctx)).eq("id", prev.id);
      if (!e) updated++;
    } else {
      const { error: e } = await ctx.client.from("insights").insert({ ...row, user_id: ctx.ownerId, workspace_id: wsOf(ctx), status: "active", created_at: at });
      if (!e) added++;
    }
  }
  const seen = new Set(clean.map((d) => d.fingerprint));
  const stale = [...existing.values()].filter((r) => r.status === "active" && !seen.has(r.fingerprint)).map((r) => r.id);
  if (stale.length) {
    const { error: e } = await scopeToWorkspace(ctx.client.from("insights").update({ status: "superseded", updated_at: at }).eq("user_id", ctx.ownerId), wsOf(ctx)).in("id", stale);
    if (!e) superseded = stale.length;
  }
  return { tableReady: true, added, updated, superseded };
}

export async function setInsightStatus(ctx: Ctx, id: string, status: "active" | "dismissed" | "resolved"): Promise<boolean> {
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("insights").update({ status, updated_at: new Date().toISOString() }).eq("user_id", ctx.ownerId),
    wsOf(ctx),
  ).eq("id", id).select("id");
  return !error && Boolean(data?.length);
}

/** A job record: created as running, finished with its result or error. */
export async function startJob(ctx: Ctx, kind: string, trigger: "onboarding" | "manual" | "cron"): Promise<string | null> {
  const { data, error } = await ctx.client
    .from("intelligence_jobs")
    .insert({ user_id: ctx.ownerId, workspace_id: wsOf(ctx), kind, trigger, status: "running", attempts: 1, started_at: new Date().toISOString() })
    .select("id")
    .single();
  return error || !data ? null : String((data as { id: string }).id);
}

export async function finishJob(ctx: Ctx, id: string | null, outcome: { ok: true; result: unknown } | { ok: false; error: string }): Promise<void> {
  if (!id) return;
  await scopeToWorkspace(
    ctx.client.from("intelligence_jobs").update({
      status: outcome.ok ? "done" : "failed",
      finished_at: new Date().toISOString(),
      ...(outcome.ok ? { result: outcome.result } : { error: outcome.error.slice(0, 500) }),
    }).eq("user_id", ctx.ownerId),
    wsOf(ctx),
  ).eq("id", id);
}
