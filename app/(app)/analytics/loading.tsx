import { Card, KpiStrip, Skeleton } from "@/components/system";
import "./analytics.css";

// Shown while the server gathers the Analytics data. The same frame as the
// page (title, platform tabs, query bar, KPI row, one chart card, two cards)
// in flat grey bars, so nothing jumps when the numbers land.
export default function Loading() {
  return (
    <div className="an-stack" aria-busy="true" aria-live="polite">
      <span className="s-sr">Loading analytics</span>
      <div className="s-title">
        <div className="s-stack">
          <Skeleton variant="title" width={140} />
          <Skeleton variant="text" width={420} />
          <Skeleton variant="meta" width={220} />
        </div>
      </div>
      <div className="s-tabs an-skel-tabs" aria-hidden>
        {[96, 72, 76, 64, 60].map((w, i) => (
          <Skeleton key={i} variant="text" width={w} />
        ))}
      </div>
      <div className="s-query" aria-hidden>
        <div className="s-query-item">
          <Skeleton variant="meta" width={40} />
          <Skeleton variant="value" width={150} />
        </div>
        <div className="s-query-item">
          <Skeleton variant="meta" width={110} />
          <Skeleton variant="value" width={150} />
        </div>
      </div>
      <KpiStrip cols={4}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="s-kpi s-stack" aria-hidden>
            <Skeleton variant="meta" width={80} />
            <Skeleton variant="value" width={96} />
            <Skeleton variant="meta" width={120} />
          </div>
        ))}
      </KpiStrip>
      <Card aria-hidden>
        <div className="s-card-head">
          <Skeleton variant="text" width={160} />
          <Skeleton variant="meta" width={90} />
        </div>
        <Skeleton variant="block" />
      </Card>
      <div className="an-two" aria-hidden>
        <Card className="s-stack">
          <Skeleton variant="text" width={140} />
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="70%" />
        </Card>
        <Card className="s-stack">
          <Skeleton variant="text" width={140} />
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="70%" />
        </Card>
      </div>
    </div>
  );
}
