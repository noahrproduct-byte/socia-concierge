"use client";

// Onboarding's strategy step: SOCIA builds the strategy for the goal just set,
// and this shows each real step as the server reports it (lib/onboardingBuild.ts:
// one event when a step starts, one when it ends, with what it found). No
// timer moves anything here. When the build is done the same screen becomes
// the reveal: where the account stands, the goal, three priorities, the week
// and the tools that fit. Coming back to this step asks again; a strategy
// that is already written is read back, not written twice.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Minus } from "lucide-react";
import { STAGES, type BuildEvent, type Reveal, type StageId, type StageItem } from "@/lib/onboardingBuild";

type StageState = { state: "wait" | "run" | "done"; ok: boolean; lines: string[]; items: StageItem[] };
const fresh = (): Record<StageId, StageState> => {
  const waiting = (): StageState => ({ state: "wait", ok: true, lines: [], items: [] });
  return { accounts: waiting(), content: waiting(), niche: waiting(), strategy: waiting() };
};

export default function StrategyStep({ onReady, headRef }: { onReady: (ready: boolean) => void; headRef: React.RefObject<HTMLHeadingElement | null> }) {
  const [stages, setStages] = useState(fresh);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setStages(fresh()); setReveal(null); setError(null); onReady(false);
    try {
      const res = await fetch("/api/onboarding/strategy", { method: "POST" });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "SOCIA couldn't start reading your accounts. Try again in a minute.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", finished = false;
      const take = (line: string) => {
        if (!line.trim()) return;
        const e = JSON.parse(line) as BuildEvent;
        if (e.type === "stage") {
          setStages((cur) => ({ ...cur, [e.id]: e.state === "start" ? { ...cur[e.id], state: "run" } : { state: "done", ok: e.ok, lines: e.lines, items: e.items ?? [] } }));
        } else if (e.type === "done") { finished = true; setReveal(e.reveal); onReady(true); }
        else if (e.type === "error") { finished = true; setError(e.message); onReady(true); }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) take(l);
      }
      if (buf) take(buf);
      // The connection ended without an answer: say so instead of waiting forever.
      if (!finished) throw new Error("The connection dropped before SOCIA finished. Try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "SOCIA couldn't finish just now. Try again.");
      onReady(true);
    }
  }, [onReady]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const building = !reveal && !error;
  return (
    <>
      <div className="ob-head">
        <h1 ref={headRef} tabIndex={-1}>{reveal ? (reveal.target ? `Your path to ${reveal.target}` : "Your strategy") : "SOCIA is building your strategy"}</h1>
        <p>{reveal ? "Built from your own account and what SOCIA could read about your niche. Nothing here is a promise of results." : "Each step below is real work on your accounts. It usually takes under a minute."}</p>
      </div>

      <ol className="obs-stages" aria-live="polite" aria-busy={building}>
        {STAGES.map((s) => {
          const st = stages[s.id];
          return (
            <li key={s.id} className={`is-${st.state}${st.state === "done" && !st.ok ? " is-none" : ""}`}>
              <span className="obs-mark" aria-hidden>
                {st.state === "run" ? <Loader2 size={14} className="spin" /> : st.state === "done" ? (st.ok ? <Check size={14} /> : <Minus size={14} />) : null}
              </span>
              <div className="obs-body">
                <b>{s.label}{st.state === "done" && <span className="sr-only">{st.ok ? " (done)" : " (nothing to read)"}</span>}</b>
                {st.lines.map((l, i) => <p key={i}>{l}</p>)}
                {st.items.length > 0 && (
                  <ul className="obs-items">
                    {st.items.map((it, i) => (
                      <li key={i}>
                        {/* The person's own post, from the platform: a plain img, since the address is the platform's. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.thumb ? <img src={it.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.hidden = true; }} /> : <span className="obs-nothumb" aria-hidden />}
                        <span><b>{it.label}</b><small>{it.note}</small></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="ob-err" role="alert">
          {error} <button type="button" className="ob-linkbtn" onClick={() => void run()}>Try again</button>
        </div>
      )}

      {reveal && (
        <div className="obs-reveal">
          <section>
            <h2>Your goal</h2>
            <p className="obs-lead">{reveal.goal.label}{reveal.goal.sentence ? `: ${reveal.goal.sentence}` : "."}</p>
            {reveal.goal.feasibility && <p className="obs-note">{reveal.goal.feasibility.line}</p>}
          </section>
          {reveal.start.length > 0 && (
            <section>
              <h2>Where you start</h2>
              <dl className="obs-start">
                {reveal.start.map((x) => <div key={x.label}><dt>{x.label}</dt><dd>{x.value}</dd><small>{x.where}</small></div>)}
              </dl>
            </section>
          )}
          {reveal.priorities.length > 0 && (
            <section>
              <h2>What to work on first</h2>
              <ol className="obs-priorities">{reveal.priorities.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </section>
          )}
          {reveal.week && (
            <section>
              <h2>Your week</h2>
              <p className="obs-lead">{reveal.week.posts} {reveal.week.posts === 1 ? "post" : "posts"} a week.</p>
              <p className="obs-note">{reveal.week.why}</p>
              {reveal.week.pillars.length > 0 && (
                <ul className="obs-pillars">{reveal.week.pillars.map((x) => <li key={x.name}><b>{x.name}</b><small>{x.why}</small></li>)}</ul>
              )}
            </section>
          )}
          <section>
            <h2>What you will use in SOCIA</h2>
            <ul className="obs-pillars">{reveal.tools.map((x) => <li key={x.name}><b>{x.name}</b><small>{x.what}</small></li>)}</ul>
          </section>
          {reveal.basedOn.length > 0 && (
            <section>
              <h2>What this is based on</h2>
              <ul className="obs-based">{reveal.basedOn.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          )}
          {!reveal.week && <p className="obs-note">The written strategy isn&apos;t ready yet. You can write it from Plan, under Strategy, once you&apos;re in.</p>}
        </div>
      )}
    </>
  );
}
