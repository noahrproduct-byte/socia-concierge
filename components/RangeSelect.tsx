"use client";

// Date-range control. A real dropdown that changes the page's ?range= so the
// server recomputes the user's windowed metrics — same behaviour the chip
// links had, in the control shape the toolbar uses.

import { useRouter } from "next/navigation";

export default function RangeSelect({ days, compact = false }: { days: number; compact?: boolean }) {
  const router = useRouter();
  return (
    <label className={`lb-sel${compact ? " compact" : ""}`}>
      {compact ? null : <span>Date:</span>}
      <select value={days} onChange={(e) => router.push(`/competitors?range=${e.target.value}`)} aria-label="Date range">
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
      </select>
    </label>
  );
}
