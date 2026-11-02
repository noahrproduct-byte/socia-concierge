"use client";

// The Content Plan's report, in five sections (Noah, 2026-11-02):
//   01 Overview: the diagnosis, key findings, the three biggest priorities, the week in one line
//   02 Account audit: what's working, what's underperforming, the evidence, why it matters
//   03 Competitor insights: their patterns, the openings they leave, formats worth testing
//   04 Growth strategy: the brand's goals, priorities and pillars with why they matter
//   05 Weekly plan: Monday to Sunday (rendered by ContentPlanClient, with its controls)
// Everything here is read from the plan SOCIA wrote and the brand's saved
// Growth Strategy. Nothing is added or scored on the page.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Deliverable } from "@/lib/schema";
import type { GrowthStrategy } from "@/lib/strategy";
import { weekdayIndex } from "@/lib/scheduling";

export const PLAN_SECTIONS = [
  { id: "overview", num: "01", label: "Overview" },
  { id: "audit", num: "02", label: "Account audit" },
  { id: "competitors", num: "03", label: "Competitor insights" },
  { id: "strategy", num: "04", label: "Growth strategy" },
  { id: "week", num: "05", label: "Weekly plan" },
] as const;
export type PlanSectionId = (typeof PLAN_SECTIONS)[number]["id"];

// Older plans (and an occasionally wordy model) put production notes in
// `format`. Tags show a short label; the full text still renders elsewhere.
const FORMAT_LABELS: [RegExp, string][] = [
  [/reel|video|short/i, "Reel"],
  [/carousel|slides?/i, "Carousel"],
  [/stor(y|ies)/i, "Story"],
  [/static|photo|image|single/i, "Static"],
];
export function formatLabel(f: string): string {
  const s = f.trim();
  if (s.length <= 14) return s;
  for (const [re, label] of FORMAT_LABELS) if (re.test(s)) return label;
  return s.split(/[,;:.\u2013\u2014(]/)[0].trim().slice(0, 14);
}

/** Monday first, Sunday last; days the plan names oddly go to the end. */
export const weekOrder = (day: string): number => {
  const wd = weekdayIndex(day);
  return wd == null ? 99 : (wd + 6) % 7;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Counts of a list of labels, most common first: "4 Reels, 2 Carousels". */
function tally(labels: string[]): string {
  const m = new Map<string, number>();
  for (const l of labels.filter(Boolean)) m.set(l, (m.get(l) ?? 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${n} ${l}${n === 1 ? "" : "s"}`).join(", ");
}

/** The week in a sentence, from the plan itself (and the Calendar, when it has been put there). */
export function weekSummary(plan: Deliverable["weeklyPlan"], onCalendar: number | null): string | null {
  const live = plan.filter((p) => p.decision?.status !== "rejected");
  if (!live.length) return null;
  const days = live.map((p) => p.day.trim()).sort((a, b) => weekOrder(a) - weekOrder(b));
  const span = days.length > 1 ? `${days[0]} to ${days[days.length - 1]}` : days[0];
  const formats = tally(live.map((p) => formatLabel(p.format)));
  const platforms = Array.from(new Set(live.map((p) => p.platform?.trim()).filter(Boolean)));
  const approved = live.filter((p) => p.decision?.status === "approved").length;
  const mix = [formats, platforms.length ? `on ${platforms.join(" and ")}` : null].filter(Boolean).join(" ");
  const status = [approved ? `${approved} approved` : null, onCalendar ? `${onCalendar} on the Calendar` : null].filter(Boolean).join(", ");
  const cap = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}.`;
  return [`${plural(live.length, "post")}, ${span}.`, mix ? cap(mix) : null, status ? cap(status) : null].filter(Boolean).join(" ");
}

function SectionLead({ children }: { children: React.ReactNode }) {
  return <p className="cpl-sec-lead">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="cpl-sec-empty">{children}</p>;
}

// ---- 01 Overview -----------------------------------------------------------

export function OverviewSection({ data, onCalendar, onOpen }: { data: Deliverable; onCalendar: number | null; onOpen: (s: PlanSectionId) => void }) {
  const working = (data.strengths ?? []).slice(0, 2);
  const holding = (data.problems ?? []).slice(0, 2);
  const priorities = (data.topFixes ?? []).slice(0, 3);
  const week = weekSummary(data.weeklyPlan ?? [], onCalendar);
  return (
    <>
      <section className="cpl-rsec">
        <h3>Account diagnosis</h3>
        <p className="cpl-lede">{data.headline}</p>
        <p className="cpl-body">{data.auditSummary}</p>
      </section>

      {(working.length > 0 || holding.length > 0) && (
        <section className="cpl-rsec">
          <h3>Key findings</h3>
          <div className="cpl-findings">
            {working.length > 0 && (
              <div className="cpl-finding good">
                <b>Working</b>
                <ul>{working.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {holding.length > 0 && (
              <div className="cpl-finding bad">
                <b>Holding it back</b>
                <ul>{holding.map((p, i) => <li key={i}>{p.issue}</li>)}</ul>
              </div>
            )}
          </div>
          <button type="button" className="ov-link" onClick={() => onOpen("audit")}>The full audit <ArrowRight size={12} aria-hidden /></button>
        </section>
      )}

      {priorities.length > 0 && (
        <section className="cpl-rsec">
          <h3>{priorities.length === 3 ? "Three biggest priorities" : "Biggest priorities"}</h3>
          {priorities.map((f, i) => (
            <div className="cpl-item" key={i}>
              <h4><span className="cpl-rank">{i + 1}</span>{f.fix}</h4>
              <div className="cpl-item-meta">{f.why}</div>
            </div>
          ))}
        </section>
      )}

      {week && (
        <section className="cpl-rsec">
          <h3>This week</h3>
          <p className="cpl-body">{week}</p>
          <button type="button" className="ov-link" onClick={() => onOpen("week")}>Open the weekly plan <ArrowRight size={12} aria-hidden /></button>
        </section>
      )}
    </>
  );
}

// ---- 02 Account audit ------------------------------------------------------

export function AuditSection({ data }: { data: Deliverable }) {
  const ev = data.evidenceUsed;
  const evidence = ev
    ? [
        ev.posts > 0 ? `${plural(ev.posts, "of your posts", "of your posts")} with their real numbers` : null,
        ev.followers != null ? `Your follower count (${ev.followers.toLocaleString("en-US")})` : null,
        ev.windows ? "When your audience engages most" : null,
        ev.outcomes ? `What became of ${plural(ev.outcomes, "planned post")} from earlier plans` : null,
      ].filter((x): x is string => Boolean(x))
    : [];
  return (
    <>
      <SectionLead>What your own posts show: what to keep doing, what is costing you reach, and the numbers behind it.</SectionLead>
      <section className="cpl-rsec">
        <h3>What&apos;s working</h3>
        {data.strengths?.length ? (
          <ul className="cpl-list">{data.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        ) : (
          <Empty>This plan didn&apos;t find a strength it could back with your numbers.</Empty>
        )}
      </section>

      <section className="cpl-rsec">
        <h3>What&apos;s underperforming</h3>
        {data.problems?.length ? (
          data.problems.map((p, i) => (
            <div className="cpl-item" key={i}>
              <h4>{p.issue}</h4>
              <div className="cpl-item-meta">
                <b>Evidence:</b> {p.evidence}
                <br />
                <b>Why it matters:</b> {p.impact}
              </div>
            </div>
          ))
        ) : (
          <Empty>Nothing stood out as holding the account back.</Empty>
        )}
      </section>

      <section className="cpl-rsec">
        <h3>Performance evidence</h3>
        {evidence.length ? (
          <ul className="cpl-list">{evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : (
          <Empty>This plan was built from the brief you typed, not from account data. Connect an account for an audit from your real numbers.</Empty>
        )}
      </section>
    </>
  );
}

// ---- 03 Competitor insights -------------------------------------------------

export function CompetitorSection({ data }: { data: Deliverable }) {
  const comps = data.competitorInsights ?? [];
  if (!comps.length) {
    return (
      <Empty>
        No competitor data went into this plan. <Link href="/discover" className="ov-link">Track competitors in Discover</Link> and the next plan compares you with them.
      </Empty>
    );
  }
  // Formats competitors win with, and whether this week's plan already tests each.
  const planned = new Set((data.weeklyPlan ?? []).map((p) => formatLabel(p.format).toLowerCase()));
  const formats = Array.from(
    comps.reduce((m, c) => {
      const f = formatLabel(c.format);
      if (f) m.set(f, [...(m.get(f) ?? []), c.competitor]);
      return m;
    }, new Map<string, string[]>()),
  );
  return (
    <>
      <SectionLead>What is working for accounts like yours, and the openings they leave.</SectionLead>
      <section className="cpl-rsec">
        <h3>Patterns that work for them</h3>
        {comps.map((c, i) => (
          <div className="cpl-item" key={i}>
            <h4>{c.competitor}</h4>
            <div className="cpl-item-meta">
              <b>What&apos;s working:</b> {c.whatsWorking}
              <br />
              <b>Why it wins:</b> {c.whyItWins}
            </div>
          </div>
        ))}
      </section>

      <section className="cpl-rsec">
        <h3>Content opportunities</h3>
        <ul className="cpl-list">
          {comps.map((c, i) => <li key={i}>{c.gap} <span className="cpl-src">From {c.competitor}</span></li>)}
        </ul>
      </section>

      {formats.length > 0 && (
        <section className="cpl-rsec">
          <h3>Formats worth testing</h3>
          <ul className="cpl-list">
            {formats.map(([f, who]) => (
              <li key={f}>
                <b>{f}</b>: used by {who.join(", ")}.{" "}
                {planned.has(f.toLowerCase()) ? "This week's plan tests it." : "Not in this week's plan yet."}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---- 04 Growth strategy -----------------------------------------------------

export function StrategySection({ data, strategy, goal }: { data: Deliverable; strategy: GrowthStrategy | null; goal: string | null }) {
  const fixes = data.topFixes ?? [];
  return (
    <>
      <SectionLead>
        Where the brand is going and why. The goals and pillars come from your Growth Strategy; each weekly plan is built from it.{" "}
        <Link href="/plan/strategy" className="ov-link">{strategy ? "Edit the strategy" : "Write your Growth Strategy"}</Link>
      </SectionLead>

      <section className="cpl-rsec">
        <h3>Goals</h3>
        {strategy ? (
          <>
            <p className="cpl-lede">{strategy.primary_objective}</p>
            {strategy.secondary_objectives.length > 0 && <ul className="cpl-list">{strategy.secondary_objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>}
          </>
        ) : goal ? (
          <p className="cpl-lede">{goal}</p>
        ) : (
          <Empty>No goal saved yet. Add one in your Growth Strategy so plans aim at it.</Empty>
        )}
      </section>

      {fixes.length > 0 && (
        <section className="cpl-rsec">
          <h3>Strategic recommendations</h3>
          {fixes.map((f, i) => (
            <div className="cpl-item" key={i}>
              <h4><span className="cpl-rank">{i + 1}</span>{f.fix}</h4>
              <div className="cpl-item-meta">
                <b>Why it matters:</b> {f.why}
                <br />
                <b>What it should change:</b> {f.expectedImpact}
              </div>
            </div>
          ))}
        </section>
      )}

      {strategy && strategy.priorities.length > 0 && (
        <section className="cpl-rsec">
          <h3>Priorities</h3>
          <ul className="cpl-list">{strategy.priorities.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </section>
      )}

      {strategy && strategy.pillars.length > 0 && (
        <section className="cpl-rsec">
          <h3>Content pillars and why they matter</h3>
          {strategy.pillars.map((p, i) => (
            <div className="cpl-item" key={i}>
              <h4>{p.name}</h4>
              <div className="cpl-item-meta">{p.why}</div>
            </div>
          ))}
          {strategy.frequency.posts_per_week > 0 && (
            <p className="cpl-body"><b>{plural(strategy.frequency.posts_per_week, "post")} a week.</b> {strategy.frequency.why}</p>
          )}
        </section>
      )}

      {strategy && strategy.experiments.some((x) => (x.status ?? "running") === "running") && (
        <section className="cpl-rsec">
          <h3>Running experiments</h3>
          {strategy.experiments.filter((x) => (x.status ?? "running") === "running").map((x, i) => (
            <div className="cpl-item" key={x.id ?? i}>
              <h4>{x.hypothesis}</h4>
              <div className="cpl-item-meta">
                <b>Test:</b> {x.test}
                <br />
                <b>Measured by:</b> {x.measure}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
