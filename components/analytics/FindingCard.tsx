"use client";

// One stored finding (lib/intel/insight.ts), laid out so its certainty is
// never overstated: what the data shows, then possible explanations marked
// as interpretation or hypothesis, how sure SOCIA is and why, what the data
// can't show, and the recommended action with what it will teach. Owners
// and Admins (onChange set) can dismiss it or mark it resolved.

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/system";
import { GOAL_PLATFORM_NAME } from "@/lib/growth";
import { confidenceWord, type StoredInsight } from "@/lib/intel/insight";

const fmt = (v: number | null, unit?: string) =>
  v == null ? "not reported" : unit === "percent" ? `${v}%` : unit === "multiple" ? `${v}x` : unit === "hours" ? `${v} h` : v.toLocaleString("en-US");

export default function FindingCard({ f, onChange }: { f: StoredInsight; onChange?: (id: string, status: StoredInsight["status"]) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(status: "dismissed" | "resolved") {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/intel/insights/${encodeURIComponent(f.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const j = await r?.json().catch(() => null);
      setErr(j?.error ?? "Couldn't update this finding. Try again.");
      return;
    }
    onChange?.(f.id, status);
  }

  const read = f.source.retrievedAt ? new Date(f.source.retrievedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <article className={`fc fc-${f.category}`}>
      <header className="fc-head">
        <span className="fc-kind">{f.category === "diagnostic" ? "Possible problem" : f.category === "content" ? "Content pattern" : f.category === "performance" ? "Performance" : f.category === "goal" ? "Goal" : "Niche"}{f.platform ? `, ${GOAL_PLATFORM_NAME[f.platform]}` : ""}</span>
        <span className="fc-conf">{confidenceWord(f.confidence)}</span>
      </header>
      <h3>{f.title}</h3>

      <section className="fc-sec">
        <h4>What the data shows</h4>
        <p>{f.observation}</p>
        {f.metrics.length > 0 && (
          <dl className="fc-metrics">
            {f.metrics.map((m, i) => (
              <div key={i}>
                <dt>{m.label}</dt>
                <dd><b>{fmt(m.value, m.unit)}</b> <small>{m.basis}</small></dd>
              </div>
            ))}
          </dl>
        )}
        {f.source.data.length > 0 && (
          <ul className="fc-data">{f.source.data.map((d, i) => <li key={i}>{d}</li>)}</ul>
        )}
        {f.posts.length > 0 && (
          <ul className="fc-posts">
            {f.posts.map((p) => (
              <li key={p.id}>
                {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer">{p.title || "Open the post"} <ExternalLink size={12} aria-hidden /></a> : <span>{p.title}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {f.explanations.length > 0 && (
        <section className="fc-sec">
          <h4>What might explain it</h4>
          <ul className="fc-expl">
            {f.explanations.map((e, i) => (
              <li key={i}><span className={`fc-tag fc-tag-${e.type}`}>{e.type === "hypothesis" ? "Hypothesis" : "Interpretation"}</span> {e.text}</li>
            ))}
          </ul>
        </section>
      )}

      {f.recommendation && (
        <section className="fc-sec fc-rec">
          <h4>What to do</h4>
          <p><b>{f.recommendation.action}</b></p>
          <p className="fc-sub">Why: {f.recommendation.why}</p>
          {f.recommendation.learning && <p className="fc-sub">What it will show: {f.recommendation.learning}</p>}
        </section>
      )}

      {f.limitations.length > 0 && (
        <section className="fc-sec">
          <h4>What this can&apos;t tell</h4>
          <ul className="fc-limits">{f.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}

      <footer className="fc-foot">
        <small>{read ? `Data read ${read}. ` : ""}Confidence {f.confidence} of 100.</small>
        <div className="fc-actions">
          {f.recommendation?.href && (f.recommendation.href.startsWith("/") ? <Link href={f.recommendation.href} className="s-link">Act on it</Link> : <a href={f.recommendation.href} target="_blank" rel="noreferrer" className="s-link">Open the post</a>)}
          {f.recommendation && <Link href={`/tool?note=${encodeURIComponent(f.recommendation.action)}`} className="s-link">Add to plan</Link>}
          {onChange && (
            <>
              <Button size="sm" variant="ghost" busy={busy} onClick={() => set("resolved")}>Mark resolved</Button>
              <Button size="sm" variant="ghost" busy={busy} onClick={() => set("dismissed")}>Dismiss</Button>
            </>
          )}
        </div>
      </footer>
      {err && <p className="s-error" role="alert">{err}</p>}
    </article>
  );
}
