// A daily ceiling on what SOCIA's automatic jobs (weekly plans, automatic comment replies, daily insights,
// niche scans) may spend on AI, across every account (Noah, 2026-11-23: a weekly plan that kept failing was
// tried again every 15 minutes overnight and used a whole day's top-up). Each AI call made inside a job
// adds its cost to today's total (lib/aiUsage.ts); a job checks the total before each piece of work and
// stops for the day at the ceiling, and the admins hear about it once that day.
//
// The total lives in api_rate_counters (supabase/ai-assistants.sql), so no new table is needed. The
// ceiling is JOB_AI_DAILY_CAP_USD (default $15). Nothing here throws into the job it guards. Server only.
import { AsyncLocalStorage } from "node:async_hooks";
import { createServiceClient } from "./supabase/service";
import { raiseAdminAlarm } from "./providerAlarm";

export const DEFAULT_JOB_CAP_USD = 15;

/** Today's ceiling in dollars: JOB_AI_DAILY_CAP_USD when it is a positive number, the default otherwise. Pure. */
export function jobCapUsd(raw = process.env.JOB_AI_DAILY_CAP_USD): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_JOB_CAP_USD;
}

/** The counter's key and window for a UTC day. Pure. */
export function jobSpendKey(now: Date): { key: string; windowStart: string } {
  const day = now.toISOString().slice(0, 10);
  return { key: `jobs:ai-micro-usd:${day}`, windowStart: `${day}T00:00:00.000Z` };
}

const store = new AsyncLocalStorage<{ job: string }>();

/** Run `fn` as an automatic job: the AI it calls counts toward today's job total. */
export function runAsJob<T>(job: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ job }, fn);
}

/** The job the current code runs inside, if any. */
export const currentJob = (): string | null => store.getStore()?.job ?? null;

/** What automatic jobs have spent today, in dollars; null when it can't be read. */
export async function jobSpendToday(now = new Date()): Promise<number | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const { key, windowStart } = jobSpendKey(now);
  try {
    const { data, error } = await svc.from("api_rate_counters").select("count").eq("key", key).eq("window_start", windowStart).maybeSingle();
    if (error) throw error;
    return Number((data as { count?: number } | null)?.count ?? 0) / 1_000_000;
  } catch (e) {
    console.error("[job-budget] total unreadable:", (e as Error)?.message ?? e);
    return null;
  }
}

/** Add one AI call's cost (millionths of a dollar) to today's job total. Best effort, never throws. */
export async function addJobSpend(micros: number, now = new Date()): Promise<void> {
  if (!(micros > 0)) return;
  const svc = createServiceClient();
  if (!svc) return;
  const { key, windowStart } = jobSpendKey(now);
  try {
    const { data } = await svc.from("api_rate_counters").select("count").eq("key", key).eq("window_start", windowStart).maybeSingle();
    const next = Math.min(2_000_000_000, Number((data as { count?: number } | null)?.count ?? 0) + Math.round(micros));
    const { error } = await svc.from("api_rate_counters").upsert({ key, window_start: windowStart, count: next }, { onConflict: "key,window_start" });
    if (error) throw error;
  } catch (e) {
    console.error("[job-budget] not recorded:", (e as Error)?.message ?? e);
  }
}

/**
 * Whether automatic jobs must stop for today: the total has reached the ceiling, or it can't be read (a
 * job that can't see its spending doesn't spend). Raises the admins' alert the first time each day.
 */
export async function jobBudgetSpent(job: string, now = new Date()): Promise<boolean> {
  const spent = await jobSpendToday(now);
  const cap = jobCapUsd();
  if (spent != null && spent < cap) return false;
  const day = now.toISOString().slice(0, 10);
  raiseAdminAlarm({
    fingerprint: `job-budget:${day}`,
    platform: "jobs",
    title: spent == null ? "Automatic jobs paused: spending unreadable" : "Automatic jobs reached today's AI limit",
    body: spent == null
      ? `SOCIA couldn't read what its automatic jobs spent today, so ${job} and the other jobs stopped until it can. Manual AI features keep working.`
      : `SOCIA's automatic jobs (weekly plans, automatic replies, insights, niche scans) spent $${spent.toFixed(2)} on AI today, the daily limit of $${cap.toFixed(2)}. They stop until tomorrow (UTC); manual AI features keep working. If this was expected, raise JOB_AI_DAILY_CAP_USD in Vercel; if not, check the spend page.`,
    detail: `${job} stopped at $${spent?.toFixed(2) ?? "unknown"} of $${cap.toFixed(2)}`,
    now,
  });
  return true;
}

/** Run a whole job as a job (its AI counts toward today's total), unless today's ceiling is already reached. */
export async function budgetedJob<T>(job: string, fn: () => Promise<T>, now = new Date()): Promise<T | { stopped: "job_budget" }> {
  if (await jobBudgetSpent(job, now)) return { stopped: "job_budget" };
  return runAsJob(job, fn);
}
