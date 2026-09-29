import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, ShieldCheck, ArrowRight, Lock, Printer, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import BrandMark from "@/components/BrandMark";
import CustomRange from "@/components/reports/CustomRange";
import AutoPrint from "@/components/reports/AutoPrint";
import { getEntitlements, maxHistoryDays, clampDays, canUseFeature } from "@/lib/entitlements";
import { PLANS, PLAN_ORDER, planRank, minPlanWithFeature, pricingHref, type FeatureKey, type PlanId } from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadReport } from "@/lib/reportData";
import { presetPeriod, customPeriod, type Report, type ReportSection, type ReportPlatform } from "@/lib/reports";
import "./reports.css";
import "@/components/planRange.css";

export const metadata = { title: "Reports — SOCIA" };

type Search = { range?: string; from?: string; to?: string; platform?: string; print?: string };

const PRESETS = [
  { id: "week", label: "This week", days: 7, feature: "weekly_summary" as FeatureKey },
  { id: "month", label: "This month", days: 30, feature: "monthly_summary" as FeatureKey },
  { id: "90", label: "90 days", days: 90, feature: "monthly_summary" as FeatureKey },
];

const lockPlan = (feature: FeatureKey): PlanId => minPlanWithFeature(feature) ?? "starter";
/** The cheapest plan whose history window reaches `days`. */
const planForDays = (days: number): PlanId => PLAN_ORDER.find((id) => PLANS[id].limits.analytics_history_days >= days) ?? "pro";
/** The higher-rank of two plans. */
const higherPlan = (a: PlanId, b: PlanId): PlanId => (planRank(a) >= planRank(b) ? a : b);

function MetricGrid({ section }: { section: ReportSection }) {
  return (
    <div className="rep-metrics">
      {section.metrics.map((m) => (
        <div key={m.label} className="rep-metric">
          <span className="rep-metric-label">{m.label}</span>
          <b className={m.raw == null ? " dim" : ""}>{m.value}</b>
          <span className="rep-metric-note">
            {m.deltaText && <em className={m.positive === false ? "down" : "up"}>{m.deltaText}</em>} {m.note}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopPosts({ section }: { section: ReportSection }) {
  if (!section.topPosts.length) return null;
  return (
    <ol className="rep-top">
      {section.topPosts.map((p, i) => (
        <li key={i}>
          <span className="rep-top-rank">{String(i + 1).padStart(2, "0")}</span>
          <span className="rep-top-meta">
            <b>{p.caption}</b>
            <small>{p.date ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""} · {p.engagements.toLocaleString("en-US")} engagements</small>
          </span>
          {p.multiplier != null && <em className={p.multiplier >= 1 ? "up" : "down"}>{p.multiplier}× vs typical</em>}
        </li>
      ))}
    </ol>
  );
}

function ReportBody({ report }: { report: Report }) {
  return (
    <>
      <section className="rep-summary-card">
        <div className="rep-card-head"><h2><TrendingUp size={15} /> Summary</h2><span>{report.periodLabel}</span></div>
        {report.summary.length ? (
          <ul className="rep-summary">{report.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
        ) : (
          <p className="rep-empty">Not enough history yet for a period-over-period summary. It fills in as SOCIA records more days.</p>
        )}
      </section>

      {report.sections.length ? report.sections.map((sec) => (
        <section key={sec.platform} className="rep-section">
          <div className="rep-card-head"><h2>{sec.label}</h2></div>
          <MetricGrid section={sec} />
          {sec.topPosts.length > 0 && (
            <>
              <h3 className="rep-sub">Top posts</h3>
              <TopPosts section={sec} />
            </>
          )}
        </section>
      )) : (
        <section className="rep-section"><p className="rep-empty">Connect a platform to see its report. Everything here is measured from your real numbers.</p></section>
      )}
    </>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const report = await loadReport(ctx.client, ctx.ownerId, wsName, period, platform);

  // ---- Client-ready print view (Pro): a clean, branded document, no shell ----
  if (sp.print === "1" && gate.client) {
    return (
      <main className="rep-print">
        <AutoPrint />
        <header className="rep-print-head">
          <div className="rep-print-brand"><BrandMark size={26} /><span>{wsName}</span></div>
          <div className="rep-print-meta"><b>Performance report</b><span>{report.periodLabel}</span></div>
        </header>
        <ReportBody report={report} />
        <footer className="rep-print-foot">Generated by SOCIA on {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Every figure is measured from the account&apos;s own data; anything a platform did not provide is omitted, never shown as zero.</footer>
      </main>
    );
  }

  const printHref = `/reports?print=1${customActive ? `&from=${sp.from}&to=${sp.to}` : `&range=${period.id}`}${platform !== "all" ? `&platform=${platform}` : ""}`;
  const exportHref = `/api/reports/export?${customActive ? `from=${sp.from}&to=${sp.to}` : `range=${period.id}`}${platform !== "all" ? `&platform=${platform}` : ""}`;

  const PlatformTab = ({ id, label }: { id: ReportPlatform | "all"; label: string }) => (
    <Link href={`/reports?platform=${id}${customActive ? `&from=${sp.from}&to=${sp.to}` : `&range=${period.id}`}`} className={platform === id ? "on" : ""}>{label}</Link>
  );

  return (
    <AppShell active="reports" userEmail={user.email}>
      <PageHeader
        title="Reports"
        sub={<>Performance summary for {wsName} · {report.periodLabel}</>}
        actions={
          <div className="rep-actions">
            <div className="ov-seg" role="group" aria-label="Report period">
              {PRESETS.map((p) => {
                const featureLocked = !canUseFeature(ent, p.feature);
                const historyLocked = p.days > maxDays;
                if (featureLocked || historyLocked) {
                  const plan = higherPlan(featureLocked ? lockPlan(p.feature) : "free", historyLocked ? planForDays(p.days) : "free");
                  const planName = PLANS[plan].name;
                  return (
                    <span key={p.id} className="range-locked" aria-disabled title={`${p.label} on ${planName}`}>
                      {p.label}<Link href={pricingHref(plan)}>{planName}</Link>
                    </span>
                  );
                }
                return <Link key={p.id} href={`/reports?range=${p.id}`} className={!customActive && period.id === p.id ? "on" : ""}>{p.label}</Link>;
              })}
            </div>

            {gate.custom
              ? <CustomRange from={customActive ? sp.from : undefined} to={customActive ? sp.to : undefined} platform={platform} maxDays={maxDays} />
              : <Link href={pricingHref(lockPlan("custom_date_ranges"))} className="rep-lockchip"><Lock size={12} /> Custom range · {PLANS[lockPlan("custom_date_ranges")].name}</Link>}

            {gate.export
              ? <a className="ov-btn ghost" href={exportHref}><Download size={14} /> Export CSV</a>
              : <Link href={pricingHref(lockPlan("report_exports"))} className="rep-lockchip"><Lock size={12} /> Export · {PLANS[lockPlan("report_exports")].name}</Link>}

            {gate.client
              ? <a className="ov-btn ghost" href={printHref} target="_blank" rel="noopener"><Printer size={14} /> Client report</a>
              : <Link href={pricingHref(lockPlan("client_reports"))} className="rep-lockchip"><Lock size={12} /> Client report · {PLANS[lockPlan("client_reports")].name}</Link>}
          </div>
        }
      />

      {gate.platform && (
        <div className="ov-seg rep-platforms" role="group" aria-label="Platform">
          <PlatformTab id="all" label="All platforms" />
          <PlatformTab id="instagram" label="Instagram" />
          <PlatformTab id="youtube" label="YouTube" />
        </div>
      )}

      <ReportBody report={report} />

      <p className="dsh-trust">
        <ShieldCheck size={13} /> Report values come from the same calculations the dashboard uses. Anything a platform doesn&apos;t provide is shown as &quot;—&quot;, never as zero.
        {" "}<Link href="/api/export" className="dsh-link">Export all account data (JSON) <ArrowRight size={12} /></Link>
      </p>
    </AppShell>
  );
}
