"use client";

// The "All Platforms" overview. Combined numbers appear ONLY where the server
// said the combination is valid (audience, content, directional engagement);
// there is no combined "views" by design. The platform table keeps each
// platform's own native metrics, and the views graph overlays only the
// platforms that actually have a real daily series.

import "@/app/(app)/analytics/analytics.css";
import { useState } from "react";
import MultiLineChart, { type OverlayLine } from "./ov/MultiLineChart";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CardSource,
  KpiCell,
  KpiStrip,
  PlatformMark,
  SegmentedControl,
  TableWrap,
  Unavailable,
} from "@/components/system";
import { fmtNum, type Granularity } from "@/lib/overview";
import type { AllPlatformsData, PlatformSummary } from "@/lib/metrics/allPlatforms";

const GROUPING = [
  { value: "day" as const, label: "Daily" },
  { value: "week" as const, label: "Weekly" },
];

/** Every platform the presence list names gets a row, connected or not. */
function rowsOf(data: AllPlatformsData): PlatformSummary[] {
  const seen = new Set(data.platforms.map((s) => s.platform));
  const missing: PlatformSummary[] = data.presence
    .filter((p) => !seen.has(p.platform))
    .map((p) => ({ platform: p.platform, connected: p.connected, label: p.label, audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null }));
  return [...data.platforms, ...missing];
}

function PlatformRow({ s, onOpen }: { s: PlatformSummary; onOpen: (p: string) => void }) {
  const off = `Connect ${s.label} to see it here and in the All-Platforms totals`;
  const cell = (v: number | null, reason: string) => (!s.connected ? <Unavailable reason={off} compact /> : v != null ? fmtNum(v) : <Unavailable reason={reason} compact />);
  return (
    <tr>
      <td className="id">
        <PlatformMark platform={s.platform} brand={s.connected} /> {s.label}
        <span className="sub">{s.connected ? "Connected" : "Not connected"}</span>
      </td>
      <td className="num key" data-label="Posted">{cell(s.contentPublished, "Not reported for this period")}</td>
      <td className="num" data-label="Audience">
        {cell(s.audience, "Not reported")}
        {s.connected && s.audience != null && s.audienceLabel && <span className="sub">{s.audienceLabel}</span>}
      </td>
      <td className="num" data-label="Views">{cell(s.views, s.viewsNote ?? "Not reported by the platform")}</td>
      <td className="num" data-label="Engagement">{cell(s.engagement, "Not reported for this period")}</td>
      <td className="act">
        {s.connected ? (
          <Button variant="ghost" size="sm" onClick={() => onOpen(s.platform)} aria-label={`View ${s.label} analytics`}>
            View analytics
          </Button>
        ) : (
          <ButtonLink href="/settings" size="sm" aria-label={`Connect ${s.label}`}>
            Connect
          </ButtonLink>
        )}
      </td>
    </tr>
  );
}

export default function AllPlatformsAnalytics({
  data,
  overlay,
  today,
  onOpen,
}: {
  data: AllPlatformsData;
  overlay: { lines: OverlayLine[]; note: string };
  today?: string;
  onOpen: (p: string) => void;
}) {
  const [gran, setGran] = useState<Granularity>("day");
  const hasOverlay = overlay.lines.some((l) => l.points.some((p) => p.value != null));
  const c = data.combined;
  const rows = rowsOf(data);
  const viewsNotes = rows.filter((s) => s.connected && s.views != null && s.viewsNote).map((s) => `${s.label}: ${s.viewsNote}`);

  return (
    <section className="an-stack" aria-label="All platforms analytics">
      <KpiStrip cols={3}>
        <KpiCell label="Total audience" value={c.audience.value != null ? fmtNum(c.audience.value) : null} reason="None of your connected platforms reported an audience." note={c.audience.note} />
        <KpiCell label="Content published" value={c.contentPublished.value != null ? String(c.contentPublished.value) : null} reason="None of your connected platforms reported posts for this period." note={c.contentPublished.note} />
        <KpiCell label="Engagement" value={c.engagement.value != null ? fmtNum(c.engagement.value) : null} reason="None of your connected platforms reported engagement for this period." note={c.engagement.note} />
      </KpiStrip>

      <Card flush>
        <CardHeader title="Platforms" period={`${data.connectedCount} connected`} />
        <TableWrap>
          <table className="s-table s-table--stack">
            <thead>
              <tr>
                <th scope="col">Platform</th>
                <th scope="col" className="num">Posted</th>
                <th scope="col" className="num">Audience</th>
                <th scope="col" className="num">Views</th>
                <th scope="col" className="num">Engagement</th>
                <th scope="col" className="act">
                  <span className="s-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <PlatformRow key={s.platform} s={s} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </TableWrap>
        <CardSource className="an-flush-foot">
          Each platform reports its own metrics, so views stay per platform and are never added up. A dash means the platform did not report that number for this period, not zero. Connect a platform to see it here and in the totals above.
          {viewsNotes.length > 0 && <> {viewsNotes.join(" ")}</>}
        </CardSource>
      </Card>

      <Card>
        <CardHeader
          title="Views over time"
          actions={<SegmentedControl className="s-seg--sm" label="Grouping" options={GROUPING} value={gran} onChange={(v) => setGran(v)} />}
        />
        {hasOverlay ? (
          <>
            <MultiLineChart lines={overlay.lines} granularity={gran} unit="views" today={today} height={280} />
            <CardSource>{overlay.note}</CardSource>
          </>
        ) : (
          <div className="s-empty">
            <b>No daily views series yet</b>
            <p>{overlay.note}</p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="SOCIA insights" />
        <ul className="an-unavail">
          {data.insights.map((i) => (
            <li key={i.id}>
              <b>{i.title}</b>
              <span>{i.body}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
