import type { Slice } from "@/lib/overview";
import { fmtNum } from "@/lib/overview";

/** SVG donut with a legend. Slices are real shares of a real total. */
export default function Donut({ slices, total, centerLabel, size = 132 }: { slices: Slice[]; total: number; centerLabel: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="ov-donut">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${centerLabel}: ${fmtNum(total)}`}>
        <circle cx="50" cy="50" r={r} className="ov-donut-track" fill="none" strokeWidth="10" />
        {slices.map((s) => {
          const len = Math.max(0, s.share) * c;
          const el = (
            <circle key={s.label} cx="50" cy="50" r={r} fill="none" strokeWidth="10"
              className={`ov-donut-seg ${s.tone}`}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
        <text x="50" y="47" textAnchor="middle" className="ov-donut-num">{fmtNum(total)}</text>
        <text x="50" y="60" textAnchor="middle" className="ov-donut-lab">{centerLabel}</text>
      </svg>
      <ul className="ov-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <i className={`dot ${s.tone}`} />
            <span>{s.label}</span>
            <b>{Math.round(s.share * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
