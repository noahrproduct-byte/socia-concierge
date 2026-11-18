// The admin spend page's arithmetic (app/(app)/admin/spend): what SOCIA's AI
// has cost this month, where the month is heading, and how big each
// provider's automatic top-up should be. Facts come from lib/spendLoad.ts;
// everything here is pure. A fact that couldn't be read stays null and the
// page says so; it is never shown as zero.
import { PLANS, type PlanId } from "./plans";

export type SpendFacts = {
  now: Date;
  /** ai_spend this month: Claude, transcription, music and voiceovers, in millionths of a dollar. Null: not readable. */
  aiMonthMicros: number | null;
  aiMonthCalls: number | null;
  aiLastMonthMicros: number | null;
  /** The accounts that cost the most this month. */
  topAccounts: { userId: string; email: string | null; plan: PlanId; micros: number; capUsd: number }[] | null;
  /** AI Studio generations finished this month: when, the provider's quoted price, the model. Null: not readable. */
  generations: { at: string; usd: number; model: string }[] | null;
  /** Live paid subscriptions: plan and what each pays a month, in cents. Null: not readable. */
  subscriptions: { plan: PlanId; cents: number | null }[] | null;
  /** The last balance alarm, if any (lib/providerAlarm.ts). */
  lastAlarms: { provider: string; at: string }[] | null;
};

const DAY = 86_400_000;

/** How far through its month `now` is, in days (at least one hour), and the month's length. */
export function monthProgress(now: Date): { elapsed: number; days: number; start: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return { elapsed: Math.max(1 / 24, (now.getTime() - start.getTime()) / DAY), days, start };
}

/** The month's total at today's pace. */
export const forecastMonth = (soFar: number, now: Date): number => {
  const { elapsed, days } = monthProgress(now);
  return (soFar / elapsed) * days;
};

/** An automatic top-up worth about a week at this month's pace, rounded up to $5, at least $25. */
export const reloadFor = (monthForecast: number, now: Date): number => {
  const { days } = monthProgress(now);
  return Math.max(25, Math.ceil(((monthForecast / days) * 7) / 5) * 5);
};

/** Stripe with Managed Payments keeps about 7.1% plus 30 cents of each payment. */
export const paymentFees = (cents: number): number => Math.round(cents * 0.071 + 30);

export type SpendSummary = {
  ai: { month: number; forecast: number; lastMonth: number | null; calls: number | null; reload: number } | null;
  higgsfield: { month: number; forecast: number; count: number; reload: number; days: { day: string; usd: number; count: number }[]; models: { model: string; usd: number; count: number }[] } | null;
  revenue: { monthly: number; afterFees: number; subscriptions: number; byPlan: { plan: PlanId; count: number; monthly: number }[] } | null;
  /** AI forecast (both lines) as a share of revenue after fees; null when either side is unknown or there's no revenue. */
  costShare: number | null;
  topAccounts: SpendFacts["topAccounts"];
  lastAlarms: SpendFacts["lastAlarms"];
};

export function summarizeSpend(f: SpendFacts): SpendSummary {
  const now = f.now;
  const ai = f.aiMonthMicros == null ? null : (() => {
    const month = f.aiMonthMicros / 1_000_000;
    const forecast = forecastMonth(month, now);
    return { month, forecast, lastMonth: f.aiLastMonthMicros == null ? null : f.aiLastMonthMicros / 1_000_000, calls: f.aiMonthCalls, reload: reloadFor(forecast, now) };
  })();

  const higgsfield = f.generations == null ? null : (() => {
    const month = f.generations.reduce((s, g) => s + g.usd, 0);
    const forecast = forecastMonth(month, now);
    // The last seven days, oldest first, including days with nothing.
    const days: { day: string; usd: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
      const on = f.generations.filter((g) => g.at.slice(0, 10) === d);
      days.push({ day: d, usd: on.reduce((s, g) => s + g.usd, 0), count: on.length });
    }
    const byModel = new Map<string, { usd: number; count: number }>();
    for (const g of f.generations) {
      const m = byModel.get(g.model) ?? { usd: 0, count: 0 };
      byModel.set(g.model, { usd: m.usd + g.usd, count: m.count + 1 });
    }
    const models = [...byModel.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.usd - a.usd);
    return { month, forecast, count: f.generations.length, reload: reloadFor(forecast, now), days, models };
  })();

  const revenue = f.subscriptions == null ? null : (() => {
    const cents = f.subscriptions.map((s) => s.cents ?? Math.round(PLANS[s.plan].priceMonthly * 100));
    const monthly = cents.reduce((a, c) => a + c, 0) / 100;
    const afterFees = cents.reduce((a, c) => a + c - paymentFees(c), 0) / 100;
    const plans = new Map<PlanId, { count: number; monthly: number }>();
    f.subscriptions.forEach((s, i) => {
      const p = plans.get(s.plan) ?? { count: 0, monthly: 0 };
      plans.set(s.plan, { count: p.count + 1, monthly: p.monthly + cents[i] / 100 });
    });
    const byPlan = [...plans.entries()].map(([plan, v]) => ({ plan, ...v })).sort((a, b) => b.monthly - a.monthly);
    return { monthly, afterFees, subscriptions: f.subscriptions.length, byPlan };
  })();

  const costShare = ai && higgsfield && revenue && revenue.afterFees > 0 ? (ai.forecast + higgsfield.forecast) / revenue.afterFees : null;
  return { ai, higgsfield, revenue, costShare, topAccounts: f.topAccounts, lastAlarms: f.lastAlarms };
}

/** "$12.34", or "$0.07" for small amounts. */
export const usd = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
