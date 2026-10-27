// The Reports screen and its client-ready print view, laid out on the design
// system. Presentation only: app/(app)/reports/page.tsx resolves the plan
// gates, the period and the report, and passes every href and lock in.

import Link from "next/link";
import { Download, Lock, Printer } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import CustomRange from "@/components/reports/CustomRange";
import AutoPrint from "@/components/reports/AutoPrint";
import {
  ButtonLink,
  Card,
  CardHeader,
  CardSource,
  Empty,
  KpiCell,
  KpiStrip,
  PageTitle,
  PlatformMark,
  StatusPill,
  TableWrap,
  Unavailable,
  buttonClass,
} from "@/components/system";
import type { Report, ReportPlatform, ReportSection } from "@/lib/reports";
import "@/app/(app)/analytics/analytics.css";

const DASH = String.fromCharCode(0x2014);

/** A feature the plan does not include: its name and where to get it. */
export type ReportLock = { plan: string; href: string };
export type PeriodOption = { id: string; label: string; href: string; selected: boolean; lock: ReportLock | null };
export type PlatformOption = { id: ReportPlatform | "all"; label: string; href: string; selected: boolean };

/** A locked control: a quiet link to the plan that opens it, with the plan named. */
function LockedLink({ label, lock }: { label: string; lock: ReportLock }) {
  return (
    <ButtonLink href={lock.href} variant="ghost" size="sm" aria-label={`${label} is on ${lock.plan}. See plans`}>
      <Lock aria-hidden />
      {label} · {lock.plan}
    </ButtonLink>
  );
}

function Metrics({ section }: { section: ReportSection }) {
  return (
    <KpiStrip cols={Math.min(section.metrics.length, 5)}>
      {section.metrics.map((m) => (
        <KpiCell
          key={m.label}
          label={m.label}
          value={m.raw == null ? null : m.value}
          reason="Not reported for this period"
          delta={m.deltaText ? { text: m.deltaText, tone: m.positive === false ? "bad" : m.positive ? "good" : undefined } : undefined}
          note={m.note || undefined}
        />
      ))}
    </KpiStrip>
  );
}

function TopPosts({ section }: { section: ReportSection }) {
  if (!section.topPosts.length) return null;
  return (
    <TableWrap>
      <table className="s-table s-table--stack">
        <thead>
          <tr>
            <th>Top posts</th>
            <th className="num">Engagements</th>
            <th className="num">vs typical</th>
          </tr>
        </thead>
        <tbody>
          {section.topPosts.map((p, i) => (
            <tr key={i}>
              <td className="id">
                <span className="an-clamp">
                  <span className="an-rank">{String(i + 1).padStart(2, "0")}</span>
                  {p.permalink ? (
                    <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="s-link">
                      {p.caption}
                    </a>
                  ) : (
                    p.caption
                  )}
                </span>
                {p.date && <span className="sub">{new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              </td>
              <td className="num key" data-label="Engagements">
                {p.engagements.toLocaleString("en-US")}
              </td>
              <td className="num" data-label="vs typical">
                {p.multiplier != null ? (
                  <StatusPill tone={p.multiplier >= 1 ? "positive" : "neutral"}>{p.multiplier}× vs typical</StatusPill>
                ) : (
                  <Unavailable reason="No typical post to compare with yet" compact />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

/** The summary and one card per platform. Shared by the screen and the print view. */
export function ReportBody({ report }: { report: Report }) {
  return (
    <>
      <Card>
        <CardHeader title="Summary" period={report.periodLabel} />
        {report.summary.length ? (
          <ul className="an-list">
            {report.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <Empty>Not enough history yet for a period-over-period summary. It fills in as SOCIA records more days.</Empty>
        )}
      </Card>

      {report.sections.length ? (
        report.sections.map((sec) => (
          <Card key={sec.platform} className="an-stack">
            <CardHeader
              title={
                <span className="an-title-mark">
                  <PlatformMark platform={sec.platform} />
                  {sec.label}
                </span>
              }
              period={report.periodLabel}
            />
            <Metrics section={sec} />
            <TopPosts section={sec} />
          </Card>
        ))
      ) : (
        <Card>
          <Empty>Connect a platform to see its report. Everything here is measured from your real numbers.</Empty>
        </Card>
      )}
    </>
  );
}

/** The client-ready print view (Pro): a clean, branded document in the light theme. */
export function ReportPrint({ report, wsName }: { report: Report; wsName: string }) {
  return (
    <main className="an-print an-stack" data-theme="light">
      <AutoPrint />
      <header className="an-print-head">
        <div className="an-print-brand">
          <BrandMark size={26} />
          <span>{wsName}</span>
        </div>
        <div className="an-print-meta">
          <b>Performance report</b>
          <span>{report.periodLabel}</span>
        </div>
      </header>
      <ReportBody report={report} />
      <footer className="an-print-foot">
        Generated by SOCIA on {new Date(report.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Every figure is measured from the account&apos;s own data; anything a platform did not provide is omitted, never shown as zero.
      </footer>
    </main>
  );
}

export function ReportScreen({
  wsName,
  report,
  periods,
  custom,
  platforms,
  exportAction,
  printAction,
}: {
  wsName: string;
  report: Report;
  periods: PeriodOption[];
  /** The custom range control, or the plan that opens it. */
  custom: { from?: string; to?: string; platform: string; maxDays: number } | { lock: ReportLock };
  /** The platform filter, or null when the plan reads the combined report only. */
  platforms: PlatformOption[] | null;
  exportAction: { href: string } | { lock: ReportLock };
  printAction: { href: string } | { lock: ReportLock };
}) {
  const open = periods.filter((p) => !p.lock);
  const locked = periods.filter((p) => p.lock);
  return (
    <div className="an-stack">
      <PageTitle
        title="Reports"
        next={report.summary[0] ?? `Performance summary for ${wsName}.`}
        meta={
          <span>
            {wsName} · {report.periodLabel}
          </span>
        }
        actions={
          <>
            {"href" in exportAction ? (
              <a className={buttonClass("secondary")} href={exportAction.href}>
                <Download aria-hidden /> Export CSV
              </a>
            ) : (
              <LockedLink label="Export" lock={exportAction.lock} />
            )}
            {"href" in printAction ? (
              <a className={buttonClass("secondary")} href={printAction.href} target="_blank" rel="noopener">
                <Printer aria-hidden /> Client report
              </a>
            ) : (
              <LockedLink label="Client report" lock={printAction.lock} />
            )}
          </>
        }
      />

      <div className="s-query" role="group" aria-label="Report scope">
        <div className="s-query-item">
          <small>Period</small>
          {open.length > 0 && (
            <nav className="s-seg an-seg-links" aria-label="Report period">
              {open.map((p) => (
                <Link key={p.id} href={p.href} aria-current={p.selected ? "page" : undefined} data-selected={p.selected ? "" : undefined}>
                  {p.label}
                </Link>
              ))}
            </nav>
          )}
          {locked.map((p) => (
            <LockedLink key={p.id} label={p.label} lock={p.lock!} />
          ))}
        </div>
        <div className="s-query-item">
          <small>Custom</small>
          {"lock" in custom ? <LockedLink label="Custom range" lock={custom.lock} /> : <CustomRange from={custom.from} to={custom.to} platform={custom.platform} maxDays={custom.maxDays} />}
        </div>
        {platforms && (
          <div className="s-query-item">
            <small>Platform</small>
            <nav className="s-seg an-seg-links" aria-label="Platform">
              {platforms.map((p) => (
                <Link key={p.id} href={p.href} aria-current={p.selected ? "page" : undefined} data-selected={p.selected ? "" : undefined}>
                  {p.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>

      <ReportBody report={report} />

      <CardSource>
        Report values come from the same calculations the dashboard uses. Anything a platform doesn&apos;t provide is shown as {DASH}, never as zero.{" "}
        <Link href="/api/export" className="s-link">
          Export all account data (JSON)
        </Link>
      </CardSource>
    </div>
  );
}
