"use client";

// Best times to post, from the account's own posts (weekday × hour engagement
// in the viewer's time zone). Says "Not enough data yet" below five posts.

import { useEffect, useMemo, useState } from "react";
import { buildAudience, hourLabel, DOW, type CalPost } from "@/lib/audience";

export default function BestTimes({ posts }: { posts: CalPost[] }) {
  const aud = useMemo(() => buildAudience(posts), [posts]);
  const [day, setDay] = useState<number | null>(null);
  useEffect(() => { setDay(aud.peak?.day ?? 1); }, [aud.peak?.day]);
  if (!aud.enough || day == null) {
    return (
      <div className="ov-empty small">
        <b>Not enough data yet</b>
        <p>SOCIA needs at least five dated posts with engagement to see when your audience responds. You have {aud.postCount}.</p>
      </div>
    );
  }
  const row = aud.days[day];
  const best = aud.bestHour(day);
  return (
    <div className="ov-times">
      <div className="ov-times-days" role="tablist" aria-label="Weekday">
        {DOW.map((d, i) => (
          <button key={d} type="button" role="tab" aria-selected={day === i} className={`${day === i ? "on" : ""}${aud.bestDays.includes(i) ? " best" : ""}`} onClick={() => setDay(i)}>{d}</button>
        ))}
      </div>
      <div className="ov-times-bars" aria-label={`Engagement by hour on ${DOW[day]}`}>
        {row.map((v, h) => (
          <span key={h} className={`bar${h === best ? " peak" : ""}`} style={{ height: `${Math.max(6, Math.round(v * 100))}%` }} title={`${hourLabel(h)}: ${Math.round(v * 100)}% of peak`} />
        ))}
      </div>
      <div className="ov-times-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
      <p className="ov-times-note">Best on {DOW[day]}: <b>{hourLabel(best)}</b>{aud.peak ? <> · overall peak <b>{DOW[aud.peak.day]} {hourLabel(aud.peak.hour)}</b></> : null} · from {aud.postCount} posts</p>
    </div>
  );
}
