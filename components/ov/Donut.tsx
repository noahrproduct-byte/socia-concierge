import "@/app/styles/charts.css";
import type { Slice } from "@/lib/overview";
import { fmtNum } from "@/lib/overview";

/**
 * A ring of three to five parts with its legend as a table (.s-ring in
 * app/styles/charts.css). Slices are real shares of a real total; the parts
 * take the data hue, then neutrals, in order.
 */
export default function Donut({ slices, total, centerLabel, size = 132 }: { slices: Slice[]; total: number; centerLabel: string; size?: number }) {
  // The viewBox is the drawn size, so the centre text is its real 16px and 12px.
  const half = size / 2, sw = Math.max(8, Math.round(size * 0.09)), r = half - sw / 2 - 1, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="s-ring">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${centerLabel}: ${fmtNum(total)}. ${slices.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`} className="s-ring-svg">
        <circle cx={half} cy={half} r={r} className="s-ring-track" fill="none" strokeWidth={sw} />
        {slices.map((s, i) => {
          const len = Math.max(0, s.share) * c;
          const el = (
            <circle key={s.label} cx={half} cy={half} r={r} fill="none" strokeWidth={sw}
              className="s-ring-seg" data-series={(i % 5) + 1}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${half} ${half})`} strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
        <text x={half} y={half + 1} textAnchor="middle" className="s-ring-total">{fmtNum(total)}</text>
        <text x={half} y={half + 18} textAnchor="middle" className="s-ring-label">{centerLabel}</text>
      </svg>
      <ul className="s-ring-legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <i data-series={(i % 5) + 1} aria-hidden />
            <span>{s.label}</span>
            <b>{fmtNum(s.value)}</b>
            <small>{Math.round(s.share * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
