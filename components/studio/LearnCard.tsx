"use client";

// Learn: what the posts made in Content Studio did once published, against
// the account's own median, and the lessons the settled ones support. The
// same results reach SOCIA's next post ideas and cuts. Hidden until at least
// one Studio post has been published.
import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import type { StudioLessons, StudioOutcome } from "@/lib/studioClips/learn";

type LearnData = { outcomes: StudioOutcome[]; lessons: StudioLessons };

/** undefined = every Studio post in the workspace; null = nothing to load yet. */
export function useStudioLearn(projectId?: string | null): LearnData | null {
  const [data, setData] = useState<LearnData | null>(null);
  useEffect(() => {
    if (projectId === null) { setData(null); return; }
    let live = true;
    fetch(`/api/studio/learn${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.outcomes) setData(j as LearnData); })
      .catch(() => {});
    return () => { live = false; };
  }, [projectId]);
  return data;
}

/** The chip for one post idea's published result (or its scheduled state). */
export function ResultChip({ o }: { o: StudioOutcome }) {
  if (o.result) {
    const tone = !o.result.measured || o.result.multiplier == null ? "wait" : o.result.multiplier >= 1.2 ? "up" : o.result.multiplier < 0.8 ? "down" : "even";
    return <span className={`cb-badge result ${tone}`} title={o.result.text}>{o.result.measured ? o.result.short : "Measuring"}</span>;
  }
  if (o.status === "scheduled" || o.status === "publishing") return <span className="cb-badge result wait">Scheduled</span>;
  return null;
}

export default function LearnCard() {
  const data = useStudioLearn();
  if (!data) return null;
  const published = data.outcomes.filter((o) => o.result);
  if (!published.length) return null;
  const l = data.lessons;
  return (
    <section className="ov-card cbl" aria-labelledby="cbl-h">
      <h3 id="cbl-h"><LineChart size={15} /> What your Studio posts did</h3>
      <p className="cbl-muted">{l.summary} Each is compared with your own typical post on that platform.</p>
      {l.lessons.length > 0 && (
        <ul className="cbl-lessons">{l.lessons.map((x) => <li key={x}>{x}</li>)}</ul>
      )}
      <ul className="cbl-posts">
        {published.slice(0, 8).map((o) => (
          <li key={o.buildId}>
            <div>
              <b>{o.title}</b>
              <small>{o.projectTitle} · {Math.round(o.features.lengthSec)} s{o.features.captions ? " · captions" : ""}{o.features.look !== "off" ? " · picture corrected" : ""}</small>
            </div>
            <ResultChip o={o} />
          </li>
        ))}
      </ul>
      <p className="cbl-muted">SOCIA uses these results when it suggests your next post ideas and cuts. <Link href="/calendar">See them in the Calendar</Link></p>
    </section>
  );
}
