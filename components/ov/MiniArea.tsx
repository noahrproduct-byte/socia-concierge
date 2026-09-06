import { fmtNum, type SeriesPoint } from "@/lib/overview";

/** Compact area chart (audience growth). Gaps stay gaps: no interpolation. */
export default function MiniArea({ points, height = 90 }: { points: SeriesPoint[]; height?: number }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) {
    return <div className="ov-empty small">SOCIA has recorded {vals.length === 1 ? "one day" : "no days"} of follower history so far. The line appears once there are two.</div>;
  }
  const W = 400, H = height, pad = 6;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2 - 14);
  const segs: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (cur.length) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${x(i)},${y(p.value)}`);
  });
  if (cur.length) segs.push(cur.join(" "));
  const firstIdx = points.findIndex((p) => p.value != null);
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p.value != null);
  const area = segs.length === 1 ? `${x(firstIdx)},${H - 14} ${segs[0]} ${x(lastIdx)},${H - 14}` : null;
  const labels = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
  return (
    <div className="ov-mini">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Followers from ${fmtNum(vals[0])} to ${fmtNum(vals[vals.length - 1])}`}>
        <defs>
          <linearGradient id="ov-mini-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area && <polygon points={area} fill="url(#ov-mini-fill)" />}
        {segs.map((s, i) => <polyline key={i} points={s} fill="none" className="ov-mini-line" />)}
      </svg>
      <div className="ov-mini-axis">
        {labels.map((p, i) => <span key={i}>{new Date(p.day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>)}
      </div>
    </div>
  );
}
