"use client";

// Custom date range for reports (Growth+). Two dates; Apply navigates to the
// report for that window. Server-validated (lib/reports.customPeriod) and
// clamped to the plan's history, so this only gathers the input.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";

export default function CustomRange({ from, to, platform, maxDays }: { from?: string; to?: string; platform?: string; maxDays: number }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const earliest = new Date(Date.now() - maxDays * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? today);

  function apply() {
    if (!f || !t || f > t) return;
    const p = platform && platform !== "all" ? `&platform=${platform}` : "";
    router.push(`/reports?from=${f}&to=${t}${p}`);
  }

  return (
    <div className="rep-custom" role="group" aria-label="Custom date range">
      <CalendarRange size={14} className="rep-custom-ico" />
      <input type="date" value={f} min={earliest} max={t || today} onChange={(e) => setF(e.target.value)} aria-label="From" />
      <span className="rep-custom-dash">to</span>
      <input type="date" value={t} min={f || earliest} max={today} onChange={(e) => setT(e.target.value)} aria-label="To" />
      <button type="button" className="btn-secondary sm" onClick={apply} disabled={!f || !t || f > t}>Apply</button>
    </div>
  );
}
