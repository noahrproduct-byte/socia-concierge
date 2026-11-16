"use client";

// Onboarding's strategy step: SOCIA builds the strategy for the goal just set,
// and this shows each real step as the server reports it (lib/onboardingBuild.ts:
// one event when a step starts, one when it ends, with what it found). No
// timer moves anything here. When the build is done the same screen becomes
// the reveal: where the account stands, the goal, three priorities, the week
// and the tools that fit. Coming back to this step asks again; a strategy
// that is already written is read back, not written twice.
import { useCallback, useEffect, useRef, useState } from "react";
import { STAGES, type BuildEvent, type Reveal, type StageId } from "@/lib/onboardingBuild";
import { toolCount } from "@/lib/onboardingTools";
import StageList, { afterEvent, readLines, waiting, type StageState } from "./StageList";

const fresh = (): Record<StageId, StageState> => ({ accounts: waiting(), content: waiting(), niche: waiting(), strategy: waiting() });

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
      let finished = false;
      await readLines<BuildEvent>(res, (e) => {
        if (e.type === "stage") setStages((cur) => ({ ...cur, [e.id]: afterEvent(cur[e.id], e) }));
        else if (e.type === "done") { finished = true; setReveal(e.reveal); onReady(true); }
        else if (e.type === "error") { finished = true; setError(e.message); onReady(true); }
      });
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

      <StageList stages={STAGES} states={stages} busy={building} />

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
          {reveal.tools.length > 0 && (() => {
            const count = toolCount(reveal.tools);
            return (
              <section className="obt">
                <h2>What you get in SOCIA</h2>
                <p className="obs-lead">{count.all} tools, all working from the strategy above.</p>
                <p className="obs-note">
                  {count.included === count.all ? "All of them are on your plan." : `${count.included} are on your plan now. The rest are marked with the plan they start on, and you choose a plan on the next step.`}
                </p>
                {reveal.tools.map((g) => (
                  <div key={g.group} className="obt-group">
                    <h3>{g.group}</h3>
                    <ul className="obt-list">
                      {g.tools.map((t) => (
                        <li key={t.name}>
                          <div className="obt-top"><b>{t.name}</b><span className={t.included ? "obt-from" : "obt-from is-up"}>{t.from}</span></div>
                          <small>{t.what}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })()}
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
