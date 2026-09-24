"use client";

// Posting-time heatmap: weekday × 3-hour block, shaded by median performance
// relative to the account's typical post. A cell with no posts is blank (not a
// zero), and the shade scales to the account's own strongest window so it reads
// honestly per account. Hover gives the exact relative figure and sample size.

import type { Windows } from "@/lib/postingTimes";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];

export default function Heatmap({ windows }: { windows: Windows }) {
  const { cells, maxRel } = windows;
  const shade = (rel: number | null, n: number) => {
    if (n === 0 || rel == null) return { background: "var(--surface-muted)", opacity: 0.5 };
    const t = maxRel > 0 ? Math.min(1, Math.max(0.12, rel / maxRel)) : 0.12;
    return { background: `rgba(var(--primary-rgb), ${t.toFixed(2)})` };
  };
  return (
    <div className="uni-heat">
      <div className="uni-heat-cols">
        <span className="uni-heat-corner" />
        {BLOCKS.map((b) => <span key={b} className="uni-heat-coltick">{b}</span>)}
      </div>
      {cells.map((row, day) => (
        <div key={day} className="uni-heat-row">
          <span className="uni-heat-rowtick">{DOW[day]}</span>
          {row.map((c) => (
            <span
              key={c.block}
              className="uni-heat-cell"
              style={shade(c.rel, c.n)}
              title={c.n === 0 ? `${DOW[day]} ${BLOCKS[c.block]}: no posts` : `${DOW[day]} ${BLOCKS[c.block]}: ${c.rel != null ? `${c.rel >= 1 ? "+" : "−"}${Math.abs(Math.round((c.rel - 1) * 100))}% vs typical` : "—"} · ${c.n} post${c.n === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
