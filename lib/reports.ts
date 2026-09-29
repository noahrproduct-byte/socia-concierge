// Period reports: a deterministic summary of a workspace's performance over a
// window, built from the same numbers the dashboard uses. Nothing here is
// generated prose or estimated: every figure is measured, deltas are against
// the previous equal period, and anything a platform did not provide is left
// out rather than shown as zero.
//
// The builder is pure (it takes already-fetched data), so it is unit-tested and
// reused by the page, the CSV export and the print/client view.

import { buildKpis, fmtNum, type Kpi } from "./overview";
import { engagementOf } from "./metrics";
import type { IgMediaItem } from "./instagramSync";
import type { DailySnapshot } from "./dashboardMetrics";

export type ReportPlatform = "instagram" | "youtube";

export type ReportTopPost = {
  caption: string;
  date: string | null;
  engagements: number;
  permalink: string | null;
  multiplier: number | null;
};

export type ReportSection = {
  platform: ReportPlatform;
  label: string;
  /** Metric rows for this platform. */
  metrics: { label: string; value: string; raw: number | null; deltaText: string | null; positive: boolean | null; note: string }[];
  topPosts: ReportTopPost[];
};

export type Report = {
  workspaceName: string;
  handle: string | null;
  periodLabel: string;
  /** The window length in days. */
  days: number;
  generatedAt: string;
  /** Deterministic "what changed" lines, drawn only from real deltas. */
  summary: string[];
  sections: ReportSection[];
};

export type ReportPeriod = { id: string; label: string; days: number; now: Date; custom?: boolean };

const DAY = 86400000;
const dateStr = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dateStrY = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** A window's human label, e.g. "Sep 1 – Sep 30, 2026". */
export function periodLabel(days: number, now: Date): string {
  const from = new Date(now.getTime() - (days - 1) * DAY);
  return `${dateStr(from)} – ${dateStrY(now)}`;
}

function igMetrics(kpis: Kpi[]): ReportSection["metrics"] {
  return kpis.map((k) => ({ label: k.label, value: k.value, raw: k.raw, deltaText: k.deltaText, positive: k.positive, note: k.note }));
}

function igTopPosts(media: IgMediaItem[], days: number, now: Date, baseline: number | null, limit = 5): ReportTopPost[] {
  const since = now.getTime() - days * DAY;
  const inRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  return [...inRange]
    .sort((a, b) => engagementOf(b) - engagementOf(a))
    .slice(0, limit)
    .map((m) => ({
      caption: (m.caption || "").split("\n")[0].slice(0, 60) || "(no caption)",
      date: m.timestamp ? new Date(m.timestamp).toISOString() : null,
      engagements: engagementOf(m),
      permalink: m.permalink ?? null,
      multiplier: baseline && baseline > 0 ? Math.round((engagementOf(m) / baseline) * 10) / 10 : null,
    }));
}

/** Deterministic summary lines from the Instagram KPIs' real deltas. */
function summaryLines(kpis: Kpi[], days: number): string[] {
  const out: string[] = [];
  const period = `the previous ${days} days`;
  for (const k of kpis) {
    if (k.id === "posts") continue;
    if (k.deltaText && k.deltaPct != null) {
      const dir = k.positive ? "up" : "down";
      out.push(`${k.label} ${dir} ${Math.abs(Math.round(k.deltaPct))}% vs ${period} (${k.value}).`);
    }
  }
  const posts = kpis.find((k) => k.id === "posts");
  if (posts && posts.raw != null) out.push(`${posts.raw} post${posts.raw === 1 ? "" : "s"} published in the period.`);
  return out;
}

export function buildReport(input: {
  workspaceName: string;
  now: Date;
  days: number;
  instagram?: { handle: string | null; media: IgMediaItem[]; daily: DailySnapshot[]; followers: number | null; baseline: number | null } | null;
  youtube?: { title: string | null; views: number | null; minutes: number | null; subs: number | null } | null;
  platform?: ReportPlatform | "all";
}): Report {
  const { workspaceName, now, days } = input;
  const want = input.platform ?? "all";
  const sections: ReportSection[] = [];
  let summary: string[] = [];
  let handle: string | null = null;

  if (input.instagram && (want === "all" || want === "instagram")) {
    const ig = input.instagram;
    handle = ig.handle;
    const kpis = buildKpis({ media: ig.media, daily: ig.daily, followers: ig.followers, days, now });
    sections.push({ platform: "instagram", label: ig.handle ? `Instagram · @${ig.handle}` : "Instagram", metrics: igMetrics(kpis), topPosts: igTopPosts(ig.media, days, now, ig.baseline) });
    summary = summaryLines(kpis, days);
  }

  if (input.youtube && (want === "all" || want === "youtube")) {
    const yt = input.youtube;
    const metrics: ReportSection["metrics"] = [
      { label: "Views", value: yt.views != null ? fmtNum(yt.views) : "—", raw: yt.views, deltaText: null, positive: null, note: `last ${days} days` },
      { label: "Watch time (min)", value: yt.minutes != null ? fmtNum(yt.minutes) : "—", raw: yt.minutes, deltaText: null, positive: null, note: `last ${days} days` },
      { label: "New subscribers", value: yt.subs != null ? fmtNum(yt.subs) : "—", raw: yt.subs, deltaText: null, positive: null, note: `last ${days} days` },
    ];
    sections.push({ platform: "youtube", label: yt.title ? `YouTube · ${yt.title}` : "YouTube", metrics, topPosts: [] });
  }

  return { workspaceName, handle, periodLabel: periodLabel(days, now), days, generatedAt: now.toISOString(), summary, sections };
}

/** CSV for the whole report: one metrics block per platform, then top posts. RFC-4180 quoting. */
export function reportToCsv(report: Report): string {
  const q = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(q(`SOCIA report — ${report.workspaceName}`));
  lines.push(q(`Period: ${report.periodLabel} (${report.days} days)`));
  lines.push("");
  for (const sec of report.sections) {
    lines.push(q(sec.label));
    lines.push(["Metric", "Value", "Change", "Period"].map(q).join(","));
    for (const m of sec.metrics) lines.push([m.label, m.value, m.deltaText ?? "", m.note].map(q).join(","));
    if (sec.topPosts.length) {
      lines.push("");
      lines.push(q(`${sec.label} — top posts`));
      lines.push(["Rank", "Caption", "Date", "Engagements", "vs baseline"].map(q).join(","));
      sec.topPosts.forEach((p, i) => lines.push([
        i + 1, p.caption, p.date ? new Date(p.date).toLocaleDateString("en-US") : "", p.engagements, p.multiplier != null ? `${p.multiplier}x` : "",
      ].map(q).join(",")));
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Presets a plan may pick from. Weekly/monthly gate at the page; this is the shape. */
export function presetPeriod(id: string, now = new Date()): ReportPeriod {
  switch (id) {
    case "week": return { id, label: "This week", days: 7, now };
    case "month": return { id, label: "This month", days: 30, now };
    case "7": return { id, label: "7 days", days: 7, now };
    case "90": return { id, label: "90 days", days: 90, now };
    case "30": default: return { id: "30", label: "30 days", days: 30, now };
  }
}

/** A custom from/to (both ISO days) into a period ending at `to` (clamped to today). */
export function customPeriod(from: string, to: string, today = new Date()): ReportPeriod | null {
  const f = new Date(`${from}T00:00:00Z`).getTime();
  const t0 = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(f) || Number.isNaN(t0) || f > t0) return null;
  const end = Math.min(t0, Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Math.max(1, Math.round((end - f) / DAY) + 1);
  return { id: "custom", label: `${dateStr(new Date(f))} – ${dateStrY(new Date(end))}`, days, now: new Date(end + DAY - 1), custom: true };
}
