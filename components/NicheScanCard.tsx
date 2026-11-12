"use client";

// The niche scan on the Dashboard and in Studio (lib/nicheScan): while SOCIA
// researches what goes viral in the brand's niche, each phase with the real
// count the job has reached (never an estimate or a moving bar); then the
// playbook, every pattern with the Reels behind it, linked.

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Button, Card, CardHeader, CardSource } from "@/components/system";
import type { ScanView } from "@/lib/nicheScan/run";
import type { Evidence, Pattern, Playbook, TextTemplate } from "@/lib/nicheScan/playbook";

const POLL_MS = 5000;

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null);
const basis = (p: { reels: number; accounts: number; medianMultiplier?: number | null }) =>
  `${p.reels} Reels, ${p.accounts} accounts${p.medianMultiplier != null ? `, median ${p.medianMultiplier}× their usual` : ""}`;

function Proof({ evidence }: { evidence: Evidence[] }) {
  return (
    <span className="s-niche-proof">
      {evidence.slice(0, 3).map((e) => (
        <a key={e.url} href={e.url} target="_blank" rel="noreferrer noopener">
          {e.account}
          {e.multiplier != null ? ` ${e.multiplier}×` : ""}
          <ExternalLink size={12} aria-hidden />
        </a>
      ))}
    </span>
  );
}

function PatternList({ title, items }: { title: string; items: Pattern[] }) {
  if (!items.length) return null;
  return (
    <div className="s-niche-group">
      <h3>{title}</h3>
      <ul>
        {items.map((p) => (
          <li key={p.key}>
            <span className="s-niche-what">{p.label}</span>
            <span className="s-niche-basis">{basis(p)}</span>
            <Proof evidence={p.evidence} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplateList({ title, items }: { title: string; items: TextTemplate[] }) {
  if (!items.length) return null;
  return (
    <div className="s-niche-group">
      <h3>{title}</h3>
      <ul>
        {items.map((t) => (
          <li key={t.template}>
            <span className="s-niche-what">&ldquo;{t.template}&rdquo;</span>
            <span className="s-niche-basis">{basis(t)}; for example &ldquo;{t.examples[0]}&rdquo;</span>
            <Proof evidence={t.evidence} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaybookView({ p }: { p: Playbook }) {
  const empty = !p.formats.length && !p.texts.length && !p.hooks.length && !p.ctas.length;
  return (
    <>
      {empty ? (
        <p className="s-niche-lead">
          SOCIA read {p.scanned.reels} Reels and Shorts from {p.scanned.accounts} accounts, and nothing repeated across two or more accounts yet. It will look again next week.
        </p>
      ) : (
        <>
          <TemplateList title="On-screen text that works" items={p.texts} />
          <PatternList title="Formats that took off" items={p.formats} />
          <TemplateList title="Opening lines that worked" items={p.hooks} />
          <PatternList title="Calls to action that worked" items={p.ctas} />
          <PatternList title="Did badly for their own accounts" items={p.avoid} />
        </>
      )}
      {p.notes.length > 0 && <p className="s-niche-note">{p.notes.join(" ")}</p>}
      <CardSource>
        From {p.scanned.studied} studied of {p.scanned.reels} Reels and Shorts by {p.scanned.accounts} accounts in your niche, read through Instagram&rsquo;s and YouTube&rsquo;s official data on {day(p.builtAt)}. Other accounts&rsquo; results, not a forecast for yours. SOCIA&rsquo;s editor and plans follow it.
      </CardSource>
    </>
  );
}

export default function NicheScanCard({ compact = false }: { compact?: boolean }) {
  const [view, setView] = useState<ScanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/niche-scan", { cache: "no-store" });
      if (res.ok) setView((await res.json()) as ScanView);
    } catch {
      /* the next poll tries again */
    }
  }, []);

  const running = view?.progress && (view.progress.status === "queued" || view.progress.status === "running");
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/niche-scan", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError((j as { error?: string }).error ?? "SOCIA couldn't start the research. Try again in a few minutes.");
      else setView(j as ScanView);
    } finally {
      setStarting(false);
    }
  };

  if (!view) return null;
  const niche = view.niche ? view.niche.toLowerCase() : "your niche";
  const p = view.progress;

  if (running && p) {
    return (
      <Card className="s-niche" aria-live="polite">
        <CardHeader title={`Researching what goes viral in ${niche}`} />
        <p className="s-niche-lead">SOCIA is reading public Reels and Shorts in your niche and studying the ones that took off. This takes a few minutes; you can leave this page.</p>
        <ol className="s-niche-steps">
          {p.steps.map((s) => (
            <li key={s.id} className={`s-niche-step is-${s.state}`}>
              <span className="s-niche-mark" aria-hidden>
                {s.state === "done" ? <Check size={14} /> : s.state === "active" ? <Loader2 size={14} className="s-spin" /> : null}
              </span>
              <span>{s.label}</span>
              {s.detail && <span className="s-niche-basis">{s.detail}</span>}
            </li>
          ))}
        </ol>
      </Card>
    );
  }

  if (view.playbook) {
    return (
      <Card className="s-niche">
        <CardHeader title={`What goes viral in ${niche}`} period={`Read ${day(view.playbookAt ?? view.playbook.builtAt)}`} actions={compact ? undefined : <Button size="sm" variant="secondary" onClick={start} disabled={starting}>{starting ? "Starting" : "Research again"}</Button>} />
        {p?.status === "failed" && <p className="s-niche-note">The last research run stopped before it finished; this is the playbook from before.</p>}
        <PlaybookView p={view.playbook} />
        {error && <p className="s-niche-note" role="alert">{error}</p>}
      </Card>
    );
  }

  if (compact) return null;
  return (
    <Card className="s-niche">
      <CardHeader title="What goes viral in your niche" />
      <p className="s-niche-lead">
        {p?.status === "failed"
          ? "The last research run stopped before it finished. Start it again and SOCIA picks up the public Reels in your niche from the beginning."
          : "SOCIA reads public Reels and Shorts in your niche, studies the ones that took off and writes a playbook its editor and plans follow. It takes a few minutes."}
      </p>
      <div>
        <Button size="sm" onClick={start} disabled={starting}>{starting ? "Starting" : "Research my niche"}</Button>
      </div>
      {error && <p className="s-niche-note" role="alert">{error}</p>}
    </Card>
  );
}
