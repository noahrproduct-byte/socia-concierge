import { redirect } from "next/navigation";
import { getViewer } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, maxHistoryDays, clampDays, canUseFeature } from "@/lib/entitlements";
import { PLANS, PLAN_ORDER, planRank, minPlanWithFeature, pricingHref, type FeatureKey, type PlanId } from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadReport } from "@/lib/reportData";
import { presetPeriod, customPeriod, type ReportPlatform } from "@/lib/reports";
import { ReportPrint, ReportScreen, type PeriodOption, type PlatformOption, type ReportLock } from "./ReportView";

export const metadata = { title: "Reports · SOCIA" };

type Search = { range?: string; from?: string; to?: string; platform?: string; print?: string };

const PRESETS = [
  { id: "week", label: "This week", days: 7, feature: "weekly_summary" as FeatureKey },
  { id: "month", label: "This month", days: 30, feature: "monthly_summary" as FeatureKey },
  { id: "90", label: "90 days", days: 90, feature: "monthly_summary" as FeatureKey },
];

const lockPlan = (feature: FeatureKey): PlanId => minPlanWithFeature(feature);
/** The cheapest plan whose history window reaches `days`. */
const planForDays = (days: number): PlanId => PLAN_ORDER.find((id) => PLANS[id].limits.analytics_history_days >= days) ?? "pro";
/** The higher-rank of two plans. */
const higherPlan = (a: PlanId, b: PlanId): PlanId => (planRank(a) >= planRank(b) ? a : b);
/** A locked control's plan name and where to get it. */
const lockOf = (plan: PlanId): ReportLock => ({ plan: PLANS[plan].name, href: pricingHref(plan) });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);
  const [ent, ws] = await Promise.all([getEntitlements(ctx.client, ctx.ownerId), getActiveWorkspace(supabase, user.id)]);
  const sp = await searchParams;

  const maxDays = maxHistoryDays(ent);
  const gate = {
    weekly: canUseFeature(ent, "weekly_summary"),
    custom: canUseFeature(ent, "custom_date_ranges"),
    platform: canUseFeature(ent, "platform_reports"),
    export: canUseFeature(ent, "report_exports"),
    client: canUseFeature(ent, "client_reports"),
  };
  const wsName = ws?.name ?? "My brand";

  // Resolve the platform filter (Growth+). Locked plans see the combined report.
  const reqPlatform = sp.platform === "instagram" || sp.platform === "youtube" ? (sp.platform as ReportPlatform) : "all";
  const platform: ReportPlatform | "all" = gate.platform ? reqPlatform : "all";

  // Resolve the period. Custom (Growth+) wins when valid; otherwise a preset,
  // with a week request on a plan without weekly_summary falling back to month.
  const now = new Date();
  let period = presetPeriod(sp.range === "week" && !gate.weekly ? "month" : (sp.range ?? "month"), now);
  let customActive = false;
  if (sp.from && sp.to && gate.custom) {
    const c = customPeriod(sp.from, sp.to, now);
    if (c) { period = c; customActive = true; }
  }
  period = { ...period, days: clampDays(ent, period.days) };

  const report = await loadReport(ctx.client, ctx.ownerId, wsName, period, platform, ctx.workspace?.id ?? undefined);

  // ---- Client-ready print view (Pro): a clean, branded document ----
  if (sp.print === "1" && gate.client) {
    return <ReportPrint report={report} wsName={wsName} />;
  }

  const printHref = `/reports?print=1${customActive ? `&from=${sp.from}&to=${sp.to}` : `&range=${period.id}`}${platform !== "all" ? `&platform=${platform}` : ""}`;
  const exportHref = `/api/reports/export?${customActive ? `from=${sp.from}&to=${sp.to}` : `range=${period.id}`}${platform !== "all" ? `&platform=${platform}` : ""}`;

  // A preset outside the plan (feature or history window) names the plan that opens it.
  const periods: PeriodOption[] = PRESETS.map((p) => {
    const featureLocked = !canUseFeature(ent, p.feature);
    const historyLocked = p.days > maxDays;
    const lock = featureLocked || historyLocked ? lockOf(higherPlan(featureLocked ? lockPlan(p.feature) : "free", historyLocked ? planForDays(p.days) : "free")) : null;
    return { id: p.id, label: p.label, href: `/reports?range=${p.id}`, selected: !customActive && period.id === p.id, lock };
  });

  const platformHref = (id: ReportPlatform | "all") => `/reports?platform=${id}${customActive ? `&from=${sp.from}&to=${sp.to}` : `&range=${period.id}`}`;
  const platforms: PlatformOption[] | null = gate.platform
    ? ([["all", "All platforms"], ["instagram", "Instagram"], ["youtube", "YouTube"]] as const).map(([id, label]) => ({ id, label, href: platformHref(id), selected: platform === id }))
    : null;

  return (
    <ReportScreen
      wsName={wsName}
      report={report}
      periods={periods}
      custom={gate.custom ? { from: customActive ? sp.from : undefined, to: customActive ? sp.to : undefined, platform, maxDays } : { lock: lockOf(lockPlan("custom_date_ranges")) }}
      platforms={platforms}
      exportAction={gate.export ? { href: exportHref } : { lock: lockOf(lockPlan("report_exports")) }}
      printAction={gate.client ? { href: printHref } : { lock: lockOf(lockPlan("client_reports")) }}
    />
  );
}
