"use client";

// Plan > Strategy: the brand's Growth Strategy (lib/strategy.ts). Written by
// SOCIA on first open from the Growth Profile and the account's own numbers,
// then the person's to edit. Rewriting replaces it (once a day) and asks
// first when it holds their edits.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw, Plus, X } from "lucide-react";
import { Button, ConfirmDialog, Field, Input, Textarea } from "@/components/system";
import type { ExperimentStatus, GrowthStrategy, StrategyExperiment, StrategyMilestone, StrategyPillar } from "@/lib/strategy";
import { MIN_TESTS, VERDICT_LABEL, type ExperimentRow } from "@/lib/experiments";
import "./strategy.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function StrategyView({ initial, experiments = [], canManage }: { initial: GrowthStrategy | null; experiments?: ExperimentRow[]; canManage: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const tried = useRef(false);

  const write = async (regenerate: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regenerate }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Couldn't write the strategy just now.");
      setS(j.strategy);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  // A supported experiment becomes a pillar, citing its result; the experiment is done.
  const makePillar = async (id: string, hypothesis: string, interpretation: string) => {
    if (!s) return;
    const name = hypothesis.replace(/\.$/, "").slice(0, 60);
    await patch({
      pillars: [...s.pillars, { name, why: `From your experiment: ${interpretation.split(". ")[0]}.`.slice(0, 240) }],
      experiments: s.experiments.map((e) => (e.id === id ? { ...e, status: "done" as const } : e)),
    }, "Couldn't add the pillar. Try again.");
  };
  const patch = async (body: Partial<GrowthStrategy>, failure: string) => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/strategy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(j?.error ?? failure);
    setS(j.strategy);
    router.refresh();
  };

  const setStatus = async (id: string, status: ExperimentStatus) => {
    if (!s) return;
    await patch({ experiments: s.experiments.map((e) => (e.id === id ? { ...e, status } : e)) }, "Couldn't update the experiment. Try again.");
  };

  useEffect(() => {
    if (initial || tried.current) return;
    tried.current = true;
    void write(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (!s) {
    return (
      <section className="gs">
        {busy ? (
          <p className="gs-note" role="status">Writing your strategy from your Growth Profile, your posts and SOCIA&apos;s findings.</p>
        ) : (
          <>
            {err && <p className="s-error" role="alert">{err}</p>}
            <Button onClick={() => write(false)}>Write my strategy</Button>
          </>
        )}
      </section>
    );
  }

  if (editing) return <StrategyEditor s={s} onCancel={() => setEditing(false)} onSaved={(n) => { setS(n); setEditing(false); router.refresh(); }} />;

  return (
    <section className="gs">
      <div className="gs-bar">
        <p className="gs-note">
          Written by SOCIA on {day(s.generated_at)}{s.edited_at ? `, edited ${day(s.edited_at)}` : ""}. Weekly plans are built from it.
        </p>
        {canManage && (
          <div className="gs-actions">
            <Button size="sm" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden /> Edit</Button>
            <Button size="sm" variant="ghost" busy={busy} onClick={() => (s.edited_at ? setConfirm(true) : write(true))}><RefreshCw size={14} aria-hidden /> Rewrite</Button>
          </div>
        )}
      </div>
      {err && <p className="s-error" role="alert">{err}</p>}

      <div className="gs-grid">
        <article className="gs-card gs-wide">
          <h3>Primary objective</h3>
          <p className="gs-lead">{s.primary_objective}</p>
          {s.secondary_objectives.length > 0 && (
            <>
              <h4>Also working toward</h4>
              <ul>{s.secondary_objectives.map((o) => <li key={o}>{o}</li>)}</ul>
            </>
          )}
        </article>

        <article className="gs-card">
          <h3>Audience</h3>
          <p>{s.audience || "Not described yet."}</p>
        </article>

        <article className="gs-card">
          <h3>Posts a week</h3>
          <p className="gs-lead">{s.frequency.posts_per_week}</p>
          {s.frequency.why && <p className="gs-sub">{s.frequency.why}</p>}
        </article>

        <article className="gs-card gs-wide">
          <h3>Content pillars</h3>
          {s.pillars.length ? (
            <dl className="gs-pillars">{s.pillars.map((p) => <div key={p.name}><dt>{p.name}</dt><dd>{p.why}</dd></div>)}</dl>
          ) : <p>None yet.</p>}
        </article>

        <article className="gs-card gs-wide">
          <h3>Priorities</h3>
          {s.priorities.length ? <ol>{s.priorities.map((p) => <li key={p}>{p}</li>)}</ol> : <p>None yet.</p>}
        </article>

        <article className="gs-card gs-wide">
          <h3>Experiments</h3>
          {s.experiments.length ? (
            <ul className="gs-exp">
              {s.experiments.map((e) => {
                const r = experiments.find((x) => x.id === e.id)?.result;
                const status = e.status ?? "running";
                return (
                  <li key={e.id ?? e.hypothesis}>
                    <div className="gs-exp-head">
                      <b>{e.hypothesis}</b>
                      <span className="gs-chip">{status === "running" ? "Running" : status === "done" ? "Done" : "Stopped"}</span>
                      {r && <span className={`gs-chip gs-v-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>}
                    </div>
                    <span>Test: {e.test}</span>
                    <span>Measure: {e.measure}</span>
                    {r && (
                      <>
                        <p className="gs-exp-counts">{r.planned} planned, {r.published} published, {r.measured} measured{r.medianMultiplier != null ? `; median ${r.medianMultiplier}x your median` : ""}</p>
                        <p>{r.interpretation}</p>
                        <p className="gs-sub">Next: {r.nextAction}</p>
                        {r.tests.length > 0 && (
                          <ul className="gs-tests">
                            {r.tests.slice(0, 6).map((t, i) => (
                              <li key={i}>
                                {t.permalink ? <a href={t.permalink} target="_blank" rel="noreferrer">{t.title}</a> : <span>{t.title}</span>}
                                <small>{t.day}, {t.state === "published" ? (t.multiplier != null ? `${t.multiplier}x your median${t.early ? ", still settling" : ""}` : "measuring") : t.state === "unscheduled" ? "not on the Calendar yet" : t.state}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {!e.id && <p className="gs-sub">Rewrite or edit the strategy to start tracking this experiment.</p>}
                    {canManage && e.id && (
                      <div className="gs-actions">
                        {status === "running" ? (
                          <>
                            {r?.verdict === "supported" && <Button size="sm" busy={busy} onClick={() => makePillar(e.id!, e.hypothesis, r.interpretation)}>Make it a pillar</Button>}
                            <Button size="sm" variant="ghost" busy={busy} onClick={() => setStatus(e.id!, "done")}>Mark done</Button>
                            <Button size="sm" variant="ghost" busy={busy} onClick={() => setStatus(e.id!, "stopped")}>Stop</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" busy={busy} onClick={() => setStatus(e.id!, "running")}>Run again</Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p>None running.</p>}
          <p className="gs-note">SOCIA measures each test post by the number it can read on that platform (interactions on Instagram and Facebook, views on YouTube) against your own median, once it settles; {MIN_TESTS} are needed before it reads a result. That can differ from the measure named above.</p>
        </article>

        <article className="gs-card gs-wide">
          <h3>Milestones</h3>
          {s.milestones.length ? (
            <ul className="gs-miles">
              {s.milestones.map((m) => (
                <li key={m.label}>
                  <span className="gs-when">{m.by ? dateLabel(m.by) : "No date"}</span>
                  <span><b>{m.label}</b> <small>{m.measure}</small></span>
                </li>
              ))}
            </ul>
          ) : <p>None yet.</p>}
        </article>
      </div>

      {s.based_on.length > 0 && (
        <p className="gs-note">
          SOCIA wrote it from: {s.based_on.join("; ")}. To change what it rests on, update <Link href="/settings#growth">your Growth Profile</Link> and rewrite.
        </p>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Rewrite the strategy?"
        body="SOCIA writes a new strategy from your current profile and numbers. Your edits are replaced."
        confirmLabel="Rewrite"
        onConfirm={() => write(true)}
        busy={busy}
      />
    </section>
  );
}

/** One field per part; lists one line per item. Pillars, experiments and milestones are rows. */
function StrategyEditor({ s, onCancel, onSaved }: { s: GrowthStrategy; onCancel: () => void; onSaved: (s: GrowthStrategy) => void }) {
  const [d, setD] = useState(s);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
  const set = <K extends keyof GrowthStrategy>(k: K, v: GrowthStrategy[K]) => setD((x) => ({ ...x, [k]: v }));
  const setRow = <T,>(k: "pillars" | "experiments" | "milestones", i: number, patch: Partial<T>) =>
    setD((x) => ({ ...x, [k]: (x[k] as T[]).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const dropRow = (k: "pillars" | "experiments" | "milestones", i: number) => setD((x) => ({ ...x, [k]: (x[k] as unknown[]).filter((_, j) => j !== i) }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/strategy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) return setErr(j?.error ?? "Couldn't save your changes. Try again.");
    onSaved(j.strategy);
  };

  return (
    <form className="gs gs-edit" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field label="Primary objective"><Input value={d.primary_objective} onChange={(e) => set("primary_objective", e.target.value)} maxLength={200} /></Field>
      <Field label="Also working toward" hint="One per line."><Textarea rows={3} defaultValue={d.secondary_objectives.join("\n")} onChange={(e) => set("secondary_objectives", lines(e.target.value))} /></Field>
      <Field label="Audience"><Textarea rows={2} value={d.audience} onChange={(e) => set("audience", e.target.value)} maxLength={300} /></Field>
      <div className="gs-row2">
        <Field label="Posts a week"><Input type="number" min={1} max={21} value={d.frequency.posts_per_week} onChange={(e) => set("frequency", { ...d.frequency, posts_per_week: Number(e.target.value) })} /></Field>
        <Field label="Why that many"><Input value={d.frequency.why} onChange={(e) => set("frequency", { ...d.frequency, why: e.target.value })} maxLength={300} /></Field>
      </div>

      <fieldset className="gs-set">
        <legend>Content pillars</legend>
        {d.pillars.map((p, i) => (
          <div className="gs-rowx" key={i}>
            <Input aria-label={`Pillar ${i + 1} name`} value={p.name} onChange={(e) => setRow<StrategyPillar>("pillars", i, { name: e.target.value })} maxLength={60} />
            <Input aria-label={`Pillar ${i + 1} reason`} value={p.why} onChange={(e) => setRow<StrategyPillar>("pillars", i, { why: e.target.value })} maxLength={240} />
            <Button size="sm" variant="ghost" aria-label={`Remove pillar ${i + 1}`} onClick={() => dropRow("pillars", i)}><X size={14} aria-hidden /></Button>
          </div>
        ))}
        {d.pillars.length < 6 && <Button size="sm" variant="ghost" onClick={() => set("pillars", [...d.pillars, { name: "", why: "" }])}><Plus size={14} aria-hidden /> Add a pillar</Button>}
      </fieldset>

      <Field label="Priorities" hint="In order, one per line."><Textarea rows={3} defaultValue={d.priorities.join("\n")} onChange={(e) => set("priorities", lines(e.target.value))} /></Field>

      <fieldset className="gs-set">
        <legend>Experiments</legend>
        {d.experiments.map((x, i) => (
          <div className="gs-rowx gs-rowx3" key={i}>
            <Input aria-label={`Experiment ${i + 1} hypothesis`} placeholder="Hypothesis" value={x.hypothesis} onChange={(e) => setRow<StrategyExperiment>("experiments", i, { hypothesis: e.target.value })} maxLength={240} />
            <Input aria-label={`Experiment ${i + 1} test`} placeholder="Test" value={x.test} onChange={(e) => setRow<StrategyExperiment>("experiments", i, { test: e.target.value })} maxLength={240} />
            <Input aria-label={`Experiment ${i + 1} measure`} placeholder="Measure" value={x.measure} onChange={(e) => setRow<StrategyExperiment>("experiments", i, { measure: e.target.value })} maxLength={200} />
            <Button size="sm" variant="ghost" aria-label={`Remove experiment ${i + 1}`} onClick={() => dropRow("experiments", i)}><X size={14} aria-hidden /></Button>
          </div>
        ))}
        {d.experiments.length < 4 && <Button size="sm" variant="ghost" onClick={() => set("experiments", [...d.experiments, { hypothesis: "", test: "", measure: "" }])}><Plus size={14} aria-hidden /> Add an experiment</Button>}
      </fieldset>

      <fieldset className="gs-set">
        <legend>Milestones</legend>
        {d.milestones.map((m, i) => (
          <div className="gs-rowx gs-rowx3" key={i}>
            <Input aria-label={`Milestone ${i + 1}`} placeholder="Milestone" value={m.label} onChange={(e) => setRow<StrategyMilestone>("milestones", i, { label: e.target.value })} maxLength={160} />
            <Input aria-label={`Milestone ${i + 1} date`} type="date" value={m.by ?? ""} onChange={(e) => setRow<StrategyMilestone>("milestones", i, { by: e.target.value || null })} />
            <Input aria-label={`Milestone ${i + 1} measure`} placeholder="Measure" value={m.measure} onChange={(e) => setRow<StrategyMilestone>("milestones", i, { measure: e.target.value })} maxLength={200} />
            <Button size="sm" variant="ghost" aria-label={`Remove milestone ${i + 1}`} onClick={() => dropRow("milestones", i)}><X size={14} aria-hidden /></Button>
          </div>
        ))}
        {d.milestones.length < 5 && <Button size="sm" variant="ghost" onClick={() => set("milestones", [...d.milestones, { label: "", by: null, measure: "" }])}><Plus size={14} aria-hidden /> Add a milestone</Button>}
      </fieldset>

      {err && <p className="s-error" role="alert">{err}</p>}
      <div className="gs-actions">
        <Button type="submit" variant="primary" busy={busy}>Save strategy</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
