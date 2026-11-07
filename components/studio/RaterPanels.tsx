"use client";

// The Content Rater's results (Noah, 2026-11-06: "way too many things in one
// page"). Each tab shows one job: Analyze is the score, the outlook and what to
// fix first; Improve is the edits; Compare is one comparison at a time; Remake
// is other ways to make it. Caption, Audio and Prepare stay in StudioPanels.tsx.
// Every number shown is one SOCIA measured or read. The score is an editor's
// judgement and predicts nothing; the performance outlook is calculated from the
// account's own Reels (lib/outlook.ts) and states a view range only when its
// replay over those Reels holds up.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock, Copy, ExternalLink, FlaskConical } from "lucide-react";
import { CATEGORY_INFO, fmtT, type ApplyField, type Marker, type StudioAnalysis, type TopFix } from "@/lib/studio";
import { CONFIDENCE_LABEL, PRIORITY_LABEL, directionText, fmtSpan, type Direction, type PostRef } from "@/lib/studioVerdict";
import { CAPABILITY, type Moment } from "@/lib/studioFixes";
import { finding, nextStep, outlookFinding, type Lesson, type RaterOutcome } from "@/lib/raterLog";
import { BACKTEST_MIN, BASELINE_MIN, RECENT_N, SETTLE_DAYS, fmtViews, outlookFor, roundViews } from "@/lib/outlook";
import type { OutlookPayload } from "@/lib/outlookLoad";
import { MomentPreview, type FixOptions } from "./ImproveWalkthrough";
import { lineInUse } from "@/lib/studioLines";
import type { EdlText } from "@/lib/studioClips/types";
import { Bar, CountUp, Reveal, Ring } from "@/components/dashboard/motion";
import "@/app/(app)/dashboard/dashboard.css";
import "@/app/(app)/studio/studio.css";

type Working = { hook: string; cta: string; caption: string; onscreen: string[]; layers: EdlText[] };

const VERDICT: Record<string, [string, string]> = { better: ["Better", "success"], similar: ["Similar", "muted"], worse: ["Behind", "warning"], unknown: ["Not measurable", "muted"] };
const CAT_TONE = (s: number | null) => (s == null ? "na" : s >= 80 ? "good" : s >= 60 ? "ok" : "low");
const APPLY_LABEL: Record<ApplyField, string> = { hook: "Use this hook", cta: "Use this ending", caption: "Use this caption", onscreen: "Use this text" };
const REMOVE_LABEL: Record<ApplyField, string> = { hook: "Remove this hook", cta: "Remove this ending", caption: "Remove this caption", onscreen: "Remove this text" };

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="ov-btn ghost small" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }).catch(() => window.prompt("Copy this", text)); }}>
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : label}
    </button>
  );
}

/** One moment's time: tenths of a second in the first ten seconds, where two moments can share a whole second. */
const fmtAt = (t: number) => (t < 10 ? `${t.toFixed(1)}s` : fmtT(t));

/** Where a fix sits in the video: its range, or its moment, or nothing for a fix with no time. */
function fixWhen(f: TopFix): string | null {
  if (f.t == null) return null;
  return f.end != null && f.end > f.t ? fmtSpan(f.t, f.end) : fmtAt(f.t);
}

// ------------------------------------------------------------------ shared ----

/** One small choice of what to look at inside a tab, so a tab shows one thing at a time. */
function SubTabs<T extends string>({ label, items, on, set }: { label: string; items: [T, string][]; on: T; set: (v: T) => void }) {
  return (
    <div className="sd-pills" role="tablist" aria-label={label}>
      {items.map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={on === id} className={on === id ? "is-on" : ""} onClick={() => set(id)}>{name}</button>)}
    </div>
  );
}

/** Two values on one scale, each with its number: the bars are drawn to the larger of the two. */
function TwoBars({ a, b, label }: { a: { name: string; value: number }; b: { name: string; value: number }; label: string }) {
  const max = Math.max(a.value, b.value, 1);
  return (
    <div className="sd-two" role="img" aria-label={`${label}: ${a.name} ${fmtViews(a.value)} views, ${b.name} ${fmtViews(b.value)} views`}>
      <span>{a.name}</span><Bar share={a.value / max} tone="data" className="sd-two-bar" /><b>{fmtViews(a.value)}</b>
      <span>{b.name}</span><Bar share={b.value / max} tone="muted" className="sd-two-bar" /><b>{fmtViews(b.value)}</b>
    </div>
  );
}

/** What a used line now does, and the step that puts it in the post. A preview line is not in the file until the editor renders it. */
function LineStatus({ canHandoff, onToEditor }: { canHandoff: boolean; onToEditor: () => void }) {
  return (
    <div className="sd-linestatus" role="status">
      <p><Check size={13} aria-hidden /> On your preview now. Your file isn&apos;t changed until you put it on the video.</p>
      {canHandoff
        ? <button type="button" className="ov-btn primary small" onClick={onToEditor}>Put it on the video <ArrowRight size={12} /></button>
        : <p className="sd-note">Upload the original file to put it on the video.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ outlook ----

/** What the page knows about the account's Reels: still loading, failed, or the payload. */
export type OutlookState = { status: "loading" } | { status: "error" } | { status: "ready"; data: OutlookPayload };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const MOMENTUM_WORD = { above: "Above your earlier Reels", below: "Below your earlier Reels", level: "Level with your earlier Reels" } as const;

/**
 * The draft against the account's own Reels (lib/outlook.ts): its usual views
 * and range, and, only when the replay over those Reels passed, an index and a
 * view range. Every figure is calculated from stored view counts; the method
 * and the sample open below it.
 */
export function OutlookBlock({ state, caption, suggestion, onRetry }: { state: OutlookState; caption: string; suggestion: string | null; onRetry: () => void }) {
  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <section className="st-block sd-outlook" aria-labelledby="sd-outlook-h">
        <h3 id="sd-outlook-h">Performance outlook</h3>
        <p className="sd-note">Your Reel history could not be loaded, so there is nothing to compare this draft with. <button type="button" className="ov-link" onClick={onRetry}>Try again</button></p>
      </section>
    );
  }
  const { connected, handle, insightsOk, model } = state.data;
  const b = model.baseline, bt = model.backtest, mo = model.momentum;
  // Before a caption is written, the suggested one stands in.
  const own = caption.trim().length > 0;
  const read = own ? caption : suggestion ?? "";
  const f = outlookFor(model, read).forecast;
  const alt = f && own && suggestion && suggestion.trim() !== caption.trim() ? outlookFor(model, suggestion).forecast : null;
  return (
    <section className="st-block sd-outlook" aria-labelledby="sd-outlook-h">
      <div className="sd-ohead">
        <h3 id="sd-outlook-h">Performance outlook</h3>
        {connected && handle && <small>From @{handle}&apos;s own Reels on Instagram</small>}
      </div>

      {!connected && <p className="sd-note">No Instagram account is connected to this brand, so there are no Reels to compare this draft with. <Link href="/settings" className="ov-link">Connect one in Settings</Link></p>}

      {connected && !b && (
        <p className="sd-note">
          <b>Not enough account history for a reliable personalized forecast.</b>{" "}
          SOCIA compares with Reels that have been out {SETTLE_DAYS} days and have a view count: it has {model.reels.length} and needs {BASELINE_MIN}.
          {model.pending > 0 ? ` ${model.pending} newer ${model.pending === 1 ? "one is" : "ones are"} still in ${model.pending === 1 ? "its" : "their"} first week.` : ""}
          {insightsOk === false ? " Instagram is not sharing view counts for this account: reconnect it in Settings to allow insights." : ""}
        </p>
      )}

      {b && (
        <>
          <dl className="sd-ostats">
            {f ? (
              <>
                <div><dt>Virality index</dt><dd><b>{f.index}</b> of 100</dd><small>50 is your usual Reel. A position among your own Reels, not a probability.</small></div>
                <div><dt>Expected views</dt><dd><b>{fmtViews(f.low)} to {fmtViews(f.high)}</b></dd><small>Built to hold 8 times in 10; replayed on your Reels it held {Math.round((bt?.coverage ?? 0) * 100)}%.</small></div>
                <div><dt>Your usual</dt><dd><b>{fmtViews(b.median)}</b> views</dd><small>Median of your last {b.n} Reels.</small></div>
              </>
            ) : (
              <>
                <div><dt>Your usual</dt><dd><b>{fmtViews(b.median)}</b> views</dd><small>Median of your last {b.n} Reels.</small></div>
                <div><dt>Usual range</dt><dd><b>{fmtViews(roundViews(b.low))} to {fmtViews(roundViews(b.high))}</b></dd><small>Half of those Reels landed here.</small></div>
                <div>
                  <dt>Recent momentum</dt>
                  {mo
                    ? <><dd className="sd-oword">{MOMENTUM_WORD[mo.word]}</dd><TwoBars label="Median views" a={{ name: `Last ${mo.recentN}`, value: mo.recentMedian }} b={{ name: `${mo.earlierN} before`, value: mo.earlierMedian }} /></>
                    : <><dd className="sd-oword">Not measurable yet</dd><small>Needs {RECENT_N + BASELINE_MIN} settled Reels; you have {b.n}.</small></>}
                </div>
              </>
            )}
          </dl>

          {!f && <p className="sd-note"><b>Virality index: not shown yet.</b> SOCIA&apos;s model has to predict your past Reels better than your plain median before it may score a draft{bt && bt.n >= BACKTEST_MIN ? ", and so far it does not" : ", and there are too few Reels to test it on"}. The range above is your usual, not a forecast for this draft.</p>}
          {alt && f && (alt.index !== f.index || alt.low !== f.low || alt.high !== f.high) && <p className="sd-note"><b>With the suggested caption:</b> index {alt.index}, {fmtViews(alt.low)} to {fmtViews(alt.high)} views. Edits to the video itself raise the creative review; their effect on views can&apos;t be estimated from your history, so none is shown.</p>}

          <details className="sd-why">
            <summary>View supporting evidence</summary>
            <dl>
              <div><dt>Sample</dt><dd>{b.n} Reels posted {day(b.from)} to {day(b.to)}, each out at least {SETTLE_DAYS} days with a view count from Instagram.{model.pending > 0 ? ` ${model.pending} newer ${model.pending === 1 ? "one is" : "ones are"} left out until ${model.pending === 1 ? "it settles" : "they settle"}.` : ""} Collab Reels another account posted are left out.</dd></div>
              <div><dt>Your usual</dt><dd>Median {fmtViews(b.median)} views. Half of those Reels fell between {fmtViews(b.low)} and {fmtViews(b.high)}.</dd></div>
              {mo && <div><dt>Momentum</dt><dd>Your last {mo.recentN} Reels have a median of {fmtViews(mo.recentMedian)} views; the {mo.earlierN} before them, {fmtViews(mo.earlierMedian)}.</dd></div>}
              <div><dt>How the index works</dt><dd>The estimate starts at your median, moves half-way toward where your last {RECENT_N} Reels run, then by each caption pattern, weighted by how many Reels carry it, and is capped between half and double your median. The index is the share of your last {b.n} Reels with fewer views than that estimate.</dd></div>
              <div><dt>The check</dt><dd>{bt ? bt.why : "No Reel can be replayed yet."} It runs again each time, and the index is withdrawn if it stops passing.</dd></div>
              <div><dt>Not included</dt><dd>How each Reel&apos;s views grew over time (SOCIA has kept only the latest count), video length (Instagram does not provide it), and the picture and sound of past Reels.</dd></div>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ analyze ----

/** The creative readiness ring: fills once from empty, counts up once; the markup always carries the final number. */
function ScoreRing({ score }: { score: number }) {
  return (
    <Ring share={score / 100} size={110} stroke={9} tone={score >= 80 ? "good" : score >= 60 ? "ok" : "low"} label={`Creative readiness ${score} out of 100`}>
      <b><CountUp value={score} /></b>
      <small>of 100</small>
    </Ring>
  );
}

/** The first tab, and the short one: the score, each part of it, the outlook, and what to fix first. The detail is one tab away. */
export function AnalyzePanel({ a, onOpenEdit, outlook, onOutlookRetry, caption }: { a: StudioAnalysis; onOpenEdit: (i: number) => void; outlook: OutlookState | null; onOutlookRetry: () => void; caption: string }) {
  const [how, setHow] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const cat = a.categories.find((c) => c.id === openCat) ?? null;
  return (
    <div className="st-panel">
      <Reveal as="section" className="st-block sd-hero">
        <div className="st-score">
          <ScoreRing score={a.score.overall} />
          <div className="st-score-meta">
            <small>Creative readiness</small>
            <b>{a.score.label}</b>
            <p>{a.diagnosis || a.observed.summary}</p>
            <p className="st-score-note">A creative assessment of this draft, not a prediction of reach, views or virality.</p>
            <button type="button" className="ov-link" aria-expanded={how} onClick={() => setHow((v) => !v)}>How is this scored? <ChevronDown size={12} style={{ transform: how ? "rotate(180deg)" : undefined }} /></button>
          </div>
        </div>
        {how && (
          <div className="st-how">
            <p>SOCIA looks at {a.meta.frames} sampled frame{a.meta.frames === 1 ? "" : "s"}{a.meta.hadTranscript ? ", the transcript" : " (no transcript was provided)"} and your caption, then compares with your own top posts{a.competitors ? " and competitors' Reels" : ""}. Scores are an editor&apos;s judgement of what is visible, never a prediction of views or virality.</p>
            <ul>
              {a.categories.map((c) => (
                <li key={c.id}><b>{CATEGORY_INFO[c.id].label}</b> analyzes: {CATEGORY_INFO[c.id].analyzes.join("; ")}.</li>
              ))}
            </ul>
          </div>
        )}
        <ul className="sd-tiles" aria-label="The score, part by part. Choose one to read why.">
          {a.categories.map((c) => (
            <li key={c.id} className={`st-cat ${CAT_TONE(c.score)}`}>
              <button type="button" className={`sd-tile${openCat === c.id ? " is-on" : ""}`} aria-expanded={openCat === c.id} onClick={() => setOpenCat(openCat === c.id ? null : c.id)}>
                <span>{CATEGORY_INFO[c.id].label}</span>
                <b>{c.score == null ? "n/a" : c.score}</b>
                <Bar share={(c.score ?? 0) / 100} tone={c.score == null ? "muted" : "data"} className="st-cat-track" />
              </button>
            </li>
          ))}
        </ul>
        {cat && (
          <div className="st-cat-detail sd-tile-detail">
            <b>{CATEGORY_INFO[cat.id].label}</b>
            <p>{cat.explanation || "Not assessable from what was provided."}</p>
            {cat.evidence && <div className="ov-why-block"><small>Evidence</small><p>{cat.evidence}</p></div>}
            {cat.fix && <div className="ov-why-block rec"><small>Suggested fix</small><p>{cat.fix}</p></div>}
          </div>
        )}
      </Reveal>

      {outlook && <OutlookBlock state={outlook} caption={caption} suggestion={a.caption.suggestion} onRetry={onOutlookRetry} />}

      {a.planFit && (
        <section className="st-block">
          <h3>Against your planned post</h3>
          <p className="st-planfit"><b>{a.planFit.title}</b> {a.planFit.summary}</p>
        </section>
      )}

      {a.strengths && a.strengths.length > 0 && (
        <section className="st-block">
          <h3>What works</h3>
          <ul className="st-works">{a.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      {a.topFixes.length > 0 && (
        <section className="st-block">
          <h3>Highest-priority edits</h3>
          <ol className="sd-toprows">
            {a.topFixes.slice(0, 3).map((f, i) => {
              const priority = f.priority ?? (i === 0 ? "high" : "medium");
              return (
                <li key={`${f.title}-${i}`}>
                  <button type="button" onClick={() => onOpenEdit(i)}>
                    <span className="sd-toprow-n">{i + 1}</span>
                    <b>{f.title}</b>
                    <em className={`sd-prio is-${priority}`}>{PRIORITY_LABEL[priority]}</em>
                    <ArrowRight size={13} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ improve ----

const MARKER_WORD: Record<Marker["kind"], string> = { issue: "Issue", strong: "Strong", pacing: "Pacing", cta: "CTA", text: "Text" };
type Entry = { t: number; end: number | null; kind: Marker["kind"]; word: string; label: string; marker: number | null };

/** Everything the analysis placed in time, in order: its markers, its suggested cuts and the text it would add. */
function entriesOf(a: StudioAnalysis): Entry[] {
  const out: Entry[] = a.markers.map((m, i) => ({ t: m.t, end: null, kind: m.kind, word: MARKER_WORD[m.kind] ?? "Note", label: m.label, marker: i }));
  for (const c of a.cuts?.edits ?? []) out.push({ t: c.start, end: c.end, kind: "pacing", word: "Suggested edit", label: `${c.type === "trim" ? "Trim" : "Cut"} ${(c.end - c.start).toFixed(1)} s${c.reason ? `: ${c.reason}` : ""}`, marker: null });
  for (const o of a.onScreenText) out.push({ t: o.t, end: null, kind: "text", word: "Suggested edit", label: `Add on-screen text: ${o.text}`, marker: null });
  return out.sort((x, y) => x.t - y.t);
}

const RATING_WORD = (r: string) => (r === "needs" ? "Needs improvement" : r[0].toUpperCase() + r.slice(1));
const RATING_CHIP = (r: string) => (r === "strong" || r === "good" ? "success" : r === "needs" ? "warning" : "danger");

export type EditsProps = {
  a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; seek: (t: number) => void; setActive: (i: number | null) => void;
  /** The edit to open first: the one chosen on the Analyze tab. */
  focus: number;
  /** The edits SOCIA can make (lib/studioFixes.ts), each tied to the fix it carries out. */
  moments: Moment[];
  thumbs: { src: string; t: number }[];
  frame: { width: number; height: number } | null;
  durationSec: number;
  /** The file is at hand, so a fix can open the editor with it applied. */
  canHandoff: boolean;
  onFix: (m: Moment, o: FixOptions) => void;
  onCaption: () => void;
  onToEditor: () => void;
  /** The walkthrough of every edit along the video. */
  children?: ReactNode;
};

/** The Improve tab: one edit open at a time, problem beside fix, with the longer reading folded away. */
export function EditsPanel({ a, w, apply, seek, setActive, focus, moments, thumbs, frame, durationSec, canHandoff, onFix, onCaption, onToEditor, children }: EditsProps) {
  const [open, setOpen] = useState<number | null>(focus);
  const [preview, setPreview] = useState<number | null>(null);
  const inUse = (f: TopFix) => {
    if (!f.apply) return false;
    const { field, value } = f.apply;
    if (field === "onscreen") return w.onscreen.includes(value);
    return field === "caption" ? w.caption === value : lineInUse(w, field, value, a.kind === "video");
  };
  const entries = a.kind === "video" ? entriesOf(a) : [];
  const dur = Math.max(1, a.durationSec ?? 1);
  return (
    <div className="st-panel">
      <section className="st-block">
        <h3>Highest-priority edits</h3>
        <ol className="sd-edits">
          {a.topFixes.map((f, i) => {
            const when = fixWhen(f);
            const priority = f.priority ?? (i === 0 ? "high" : "medium");
            const m = moments.find((x) => x.fixIndex === i) ?? null;
            const on = inUse(f);
            // A line goes on the preview first; the editor is the next step, once it is in use.
            const isLine = a.kind === "video" && f.apply != null && f.apply.field !== "caption";
            const showEditor = m != null && m.capability !== "caption" && (!isLine || on);
            return (
              <li key={`${f.title}-${i}`} className={`sd-edit${open === i ? " is-open" : ""}`}>
                <button type="button" className="sd-edit-head" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span className="st-fix-num">{String(i + 1).padStart(2, "0")}</span>
                  <b>{f.title}</b>
                  {when && <small>{when}</small>}
                  <em className={`sd-prio is-${priority}`}>{PRIORITY_LABEL[priority]}</em>
                  <ChevronDown size={14} aria-hidden style={{ transform: open === i ? "rotate(180deg)" : undefined }} />
                </button>
                {open === i && (
                  <div className="sd-edit-body">
                    <div className="sd-pf">
                      <div className="is-problem"><small>Problem</small><p>{f.observed}</p></div>
                      <div className="is-fix"><small>Fix</small><p>{f.suggestion}</p></div>
                    </div>
                    {f.why && <p className="sd-edit-why">{f.why}</p>}
                    <div className="st-fix-actions">
                      {f.apply && <button type="button" className={`ov-btn ${on ? "ghost" : "primary"} small`} aria-pressed={on} onClick={() => apply(f.apply!.field, f.apply!.value)}>{on ? REMOVE_LABEL[f.apply.field] : APPLY_LABEL[f.apply.field]}</button>}
                      {f.t != null && a.kind === "video" && <button type="button" className="ov-btn ghost small" onClick={() => seek(f.t!)}><Clock size={12} /> Jump to {fmtT(f.t)}</button>}
                      {m && m.capability !== "caption" && <button type="button" className="ov-btn ghost small" aria-expanded={preview === i} onClick={() => setPreview(preview === i ? null : i)}>{preview === i ? "Hide the preview" : "Preview the change"}</button>}
                      {showEditor && <button type="button" className={`ov-btn ${f.apply && !on ? "ghost" : "primary"} small`} disabled={!canHandoff} onClick={() => onFix(m, { presetId: m.text?.presetId, cuts: m.cuts?.map(({ start, end }) => ({ start, end })) })}>{isLine ? "Put it on the video" : CAPABILITY[m.capability].label} <ArrowRight size={12} /></button>}
                      {m && m.capability === "caption" && <button type="button" className="ov-btn ghost small" onClick={onCaption}>Rewrite the caption <ArrowRight size={12} /></button>}
                    </div>
                    {on && isLine && !showEditor && <LineStatus canHandoff={canHandoff} onToEditor={onToEditor} />}
                    {on && isLine && showEditor && <p className="sd-note">On your preview now. Your file isn&apos;t changed until you put it on the video.</p>}
                    {on && f.apply && f.apply.field !== "caption" && a.kind !== "video" && <p className="sd-note">Added to your caption, in the Caption tab.</p>}
                    {on && f.apply?.field === "caption" && <p className="sd-note">Your caption now reads this, in the Caption tab.</p>}
                    {showEditor && !on && <p className="sd-note">{canHandoff ? `Opens the ${CAPABILITY[m.capability].where}${m.capability === "pauses" || m.capability === "text" ? " with this applied. Your original file is not changed" : ""}.` : "Upload the original file to apply this in the editor."}</p>}
                    {!m && !f.apply && priority !== "experiment" && a.kind === "video" && <p className="sd-note">This one is yours to make: SOCIA can&apos;t reshoot or re-record it.</p>}
                    {m && preview === i && <div className="sd-preview"><MomentPreview m={m} thumbs={thumbs} frame={frame} durationSec={durationSec} /></div>}
                    {f.evidence && (
                      <details className="sd-why">
                        <summary>Why SOCIA recommends this</summary>
                        <dl>
                          {f.evidence.account && <div><dt>Your posts</dt><dd>{f.evidence.account}</dd></div>}
                          {f.evidence.niche && <div><dt>Your niche</dt><dd>{f.evidence.niche}</dd></div>}
                          <div><dt>Confidence</dt><dd><b>{CONFIDENCE_LABEL[f.evidence.confidence]}.</b> {f.evidence.confidenceWhy}</dd></div>
                          {f.apply && <div><dt>Suggested line</dt><dd>{f.apply.value}</dd></div>}
                        </dl>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {children && (
        <details className="st-block sd-fold">
          <summary>Go through every edit with the video{moments.length > 0 ? ` (${moments.length})` : ""}</summary>
          {children}
        </details>
      )}

      {(a.segments.length > 0 || entries.length > 0) && (
        <details className="st-block sd-fold">
          <summary>See it on the timeline</summary>
          {a.segments.length > 0 && (
            <>
              <div className="sd-structure" aria-hidden>
                {a.segments.map((s, i) => <i key={i} className={`is-${s.rating}`} style={{ flexGrow: Math.max(0.1, s.end - s.start) }} />)}
              </div>
              <ul className="st-segs">
                {a.segments.map((s, i) => (
                  <li key={i} className={`st-seg ${s.rating}`}>
                    <button type="button" onClick={() => seek(s.start)}>
                      <span className="st-seg-time">{fmtT(s.start)} to {fmtT(Math.min(s.end, dur))}</span>
                      <span className="st-seg-body"><b>{s.label}</b><small>{s.reason}</small></span>
                      <em className={`ov-chip ${RATING_CHIP(s.rating)}`}>{RATING_WORD(s.rating)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {entries.length > 0 && (
            <>
              <h4 className="sd-sub">Moments</h4>
              <ul className="st-markers">
                {entries.map((e, i) => (
                  <li key={i}><button type="button" className={`st-marker ${e.kind}`} onClick={() => { seek(e.t); setActive(e.marker); }}><span>{e.end != null ? fmtSpan(e.t, e.end) : fmtAt(e.t)}</span><b>{e.label}</b><small>{e.word}</small></button></li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ compare ----

/** The real posts a comparison rests on, in Reel format with their numbers first, to open and watch. */
function ReelCards({ posts, mine }: { posts: PostRef[]; mine: boolean }) {
  return (
    <ul className="sd-reels">
      {posts.map((p) => {
        const [lead, ...rest] = (p.result || "No counts published").split(", ");
        const body = (
          <>
            <span className="sd-reel-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i aria-hidden />}
              <em>{p.id}</em>
            </span>
            <b className="sd-reel-lead">{lead}</b>
            {rest.length > 0 && <small>{rest.join(", ")}</small>}
            <small className="sd-reel-name">{mine ? p.title || "Untitled post" : p.account ?? "An account in your niche"}</small>
          </>
        );
        return (
          <li key={p.id}>
            {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.id}: ${p.title || p.account || "post"}`}>{body}</a> : <span>{body}</span>}
          </li>
        );
      })}
    </ul>
  );
}

type CompareRow = { label: string; current: string; theirs: string; verdict: string; refs?: string[] };

/** How the draft stands, counted from the rows below it. */
function Tally({ rows }: { rows: CompareRow[] }) {
  const count = (v: string) => rows.filter((r) => r.verdict === v).length;
  return (
    <dl className="sd-tally">
      {(["better", "similar", "worse"] as const).map((v) => <div key={v} className={`is-${v}`}><dd>{count(v)}</dd><dt>{VERDICT[v][0]}</dt></div>)}
    </dl>
  );
}

function CompareRows({ head, rows }: { head: string; rows: CompareRow[] }) {
  return (
    <ul className="sd-crows">
      {rows.map((r) => (
        <li key={r.label}>
          <header><b>{r.label}</b><em className={`ov-chip ${(VERDICT[r.verdict] ?? VERDICT.unknown)[1]}`}>{(VERDICT[r.verdict] ?? VERDICT.unknown)[0]}</em></header>
          <div className="sd-crow-sides">
            <div><small>This draft</small><p>{r.current || "Not seen"}</p></div>
            <div><small>{head}{r.refs?.length ? ` (${r.refs.join(", ")})` : ""}</small><p>{r.theirs || "Not seen"}</p></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

type CompareView = "yours" | "competitors" | "niche" | "platforms";

/** The Compare tab: one comparison at a time. */
export function ComparePanel({ a, onCompare, outlook, caption }: { a: StudioAnalysis; onCompare: () => void; outlook: OutlookState | null; caption: string }) {
  const [view, setView] = useState<CompareView>("yours");
  const model = outlook?.status === "ready" ? outlook.data.model : null;
  const own = caption.trim().length > 0;
  const shared = model ? outlookFor(model, own ? caption : a.caption.suggestion ?? "").shared : [];
  const winnerRows: CompareRow[] = a.compare ? a.compare.rows.map((r) => ({ label: r.label, current: r.current, theirs: r.winners, verdict: r.verdict, refs: r.refs })) : [];
  return (
    <div className="st-panel">
      <SubTabs<CompareView> label="What to compare with" on={view} set={setView} items={[["yours", "Your posts"], ["competitors", "Competitors"], ["niche", "Your niche"], ["platforms", "Platforms"]]} />

      {view === "yours" && (
        <>
          <section className="st-block sd-cmp">
            <div className="st-block-head"><h3>Compare to my winners</h3>{a.compare && <button type="button" className="ov-link" onClick={onCompare}>See examples <ArrowRight size={12} /></button>}</div>
            {a.compare ? (
              <>
                <Tally rows={winnerRows} />
                {a.compare.posts && a.compare.posts.length > 0 && <ReelCards posts={a.compare.posts} mine />}
                <CompareRows head="Your winners" rows={winnerRows} />
                <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.compare.summary}</p></div>
                <p className="ov-source">Compared with {a.compare.basis}. A pattern across {a.compare.sample} posts shows what they share, not what caused their results.</p>
              </>
            ) : <div className="ov-empty small">No synced posts to compare with yet. Connect Instagram and this fills in with your own top posts.</div>}
          </section>
          {shared.length > 0 && (
            <section className="st-block sd-cmp">
              <h3>What your own Reels show about {own ? "this caption" : "the suggested caption"}</h3>
              <ul className="sd-pats">
                {shared.map((p) => (
                  <li key={p.key}>
                    <p>Reels where the {p.label}</p>
                    <TwoBars label="Median views" a={{ name: `${p.withN} with it`, value: p.withMedian }} b={{ name: `${p.withoutN} others`, value: p.withoutMedian }} />
                  </li>
                ))}
              </ul>
              <p className="ov-source">Median views. Patterns in a few of your posts, not proof of why they did well: other things differed between them.</p>
            </section>
          )}
        </>
      )}

      {view === "competitors" && (
        <section className="st-block sd-cmp">
          <div className="st-block-head"><h3>Compare with competitors</h3><Link href="/discover" className="ov-link">Discover <ArrowRight size={12} /></Link></div>
          {a.competitors ? (
            <>
              <Tally rows={a.competitors.rows} />
              <ReelCards posts={a.competitors.posts} mine={false} />
              <CompareRows head="Their Reels" rows={a.competitors.rows} />
              {a.competitors.takeaways.length > 0 && (
                <>
                  <h4 className="sd-sub">What you could take from them</h4>
                  <ul className="st-list">{a.competitors.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
                </>
              )}
              {a.competitors.summary && <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.competitors.summary}</p></div>}
              <p className="ov-source">Compared with {a.competitors.basis}, with the numbers the platforms published. Their results, not a forecast for yours. Take the structure, never the wording.</p>
            </>
          ) : <div className="ov-empty small">No competitor Reels on file for this brand yet. Track a few accounts on Discover, and your next analysis compares this draft with their Reels that took off.</div>}
        </section>
      )}

      {view === "niche" && (
        <section className="st-block sd-cmp">
          <h3>Compare with niche</h3>
          {a.niche ? (
            <>
              <ul className="st-list">{a.niche.patterns.map((p) => <li key={p}>{p}</li>)}</ul>
              <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.niche.summary}</p></div>
              <p className="ov-source">Observed among {a.niche.basis}. Patterns, not guarantees.</p>
            </>
          ) : <div className="ov-empty small">No analysed niche content on file yet. Run discovery on Discover and this compares your draft with what is working around you.</div>}
        </section>
      )}

      {view === "platforms" && (
        <section className="st-block sd-cmp">
          <h3>Platform fit</h3>
          <ul className="sd-fits">
            {a.platformFit.map((p) => (
              <li key={p.platform}><small>{p.platform}</small><b className={`is-${p.fit}`}>{p.fit[0].toUpperCase() + p.fit.slice(1)}</b><p>{p.note}</p></li>
            ))}
          </ul>
          <p className="ov-source">Fit is an editor&apos;s read of length, opening and text against each format. SOCIA does not claim platform ranking rules.</p>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- remake ----

function DirectionCard({ d, inUse, onUse, canHandoff, onEditor }: { d: Direction; inUse: boolean; onUse: () => void; canHandoff: boolean; onEditor: () => void }) {
  return (
    <li className={`sd-dir${d.testFirst ? " is-first" : ""}`}>
      <header>
        <b>{d.name}</b>
        {d.testFirst && <span className="sd-dir-tag">Test this first</span>}
        {d.lengthSec != null && <small>about {d.lengthSec} seconds</small>}
      </header>
      <div className="sd-dir-open">
        <small>Opening line</small>
        <p>{d.opening}</p>
      </div>
      {d.approach && <p>{d.approach}</p>}
      <div className="sd-fix-actions">
        <button type="button" className={`ov-btn ${inUse ? "ghost" : "primary"} small`} aria-pressed={inUse} onClick={onUse}>{inUse ? "Remove this opening" : "Use this opening"}</button>
        {!inUse && <button type="button" className="ov-btn ghost small" disabled={!canHandoff} onClick={onEditor}>Start this version in the editor <ArrowRight size={12} /></button>}
        <CopyBtn text={directionText(d)} label="Copy the brief" />
      </div>
      {inUse && <LineStatus canHandoff={canHandoff} onToEditor={onEditor} />}
      {(d.storyboard.length > 0 || d.bestFor || d.tradeoff || d.evidence) && (
        <details className="sd-why">
          <summary>Storyboard and tradeoffs</summary>
          {d.storyboard.length > 0 && (
            <ol className="sd-board" aria-label={`Storyboard for ${d.name}`}>
              {d.storyboard.map((b, i) => (
                <li key={i}>
                  {b.at && <span>{b.at}</span>}
                  <div><b>{b.shot}</b>{b.say && <small>Say: {b.say}</small>}</div>
                </li>
              ))}
            </ol>
          )}
          <dl>
            {d.bestFor && <div><dt>Best for</dt><dd>{d.bestFor}</dd></div>}
            {d.tradeoff && <div><dt>Tradeoff</dt><dd>{d.tradeoff}</dd></div>}
            {d.evidence && <div><dt>Why try it</dt><dd>{d.evidence}</dd></div>}
          </dl>
        </details>
      )}
    </li>
  );
}

type RemakeView = "versions" | "lines" | "tests";

/** The Remake tab: other ways to make this video, the lines to use, and what is worth testing. One at a time. */
export function RemakePanel({ a, w, apply, canHandoff, onUseDirection, onEditor, onToEditor }: { a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; canHandoff: boolean; onUseDirection: (d: Direction) => void; onEditor: (d: Direction) => void; onToEditor: () => void }) {
  const dirs = a.directions ?? [];
  const tests = a.experiments ?? [];
  const items = ([["versions", "Three versions"], ["lines", "Openings and endings"], ["tests", "Worth testing"]] as [RemakeView, string][]).filter(([id]) => (id === "versions" ? dirs.length > 0 : id === "tests" ? tests.length > 0 || dirs.length > 1 : true));
  const [view, setView] = useState<RemakeView>(items[0]?.[0] ?? "lines");
  const first = dirs.find((d) => d.testFirst) ?? dirs[0];
  const second = dirs.find((d) => d !== first);
  const video = a.kind === "video";
  return (
    <div className="st-panel">
      {items.length > 1 && <SubTabs<RemakeView> label="Ways to remake it" on={view} set={setView} items={items} />}

      {view === "versions" && dirs.length > 0 && (
        <section className="st-block">
          <h3>Three ways to remake it</h3>
          <p className="sd-note">Each is a version to test, with what it costs you. SOCIA can&apos;t know which will do best: it marks the one it would try first and says why.</p>
          <ol className="sd-dirs">
            {dirs.map((d) => <DirectionCard key={d.name} d={d} inUse={lineInUse(w, "hook", d.opening, video)} onUse={() => onUseDirection(d)} canHandoff={canHandoff} onEditor={() => onEditor(d)} />)}
          </ol>
        </section>
      )}

      {view === "lines" && (
        <>
          {a.hooks.options.length > 0 && (
            <section className="st-block">
              <h3>Other opening lines</h3>
              {a.hooks.current && <p className="sd-note">Now: {a.hooks.current}</p>}
              <ul className="sd-lines">
                {a.hooks.options.map((h) => (
                  <li key={h.text}>
                    <span><b>{h.text}</b><small>{h.style[0].toUpperCase() + h.style.slice(1)}</small></span>
                    <button type="button" className={`ov-btn ${lineInUse(w, "hook", h.text, video) ? "ghost" : "primary"} small`} aria-pressed={lineInUse(w, "hook", h.text, video)} onClick={() => apply("hook", h.text)}>{lineInUse(w, "hook", h.text, video) ? "Remove" : "Use"}</button>
                  </li>
                ))}
              </ul>
              {video && a.hooks.options.some((h) => lineInUse(w, "hook", h.text, video)) && <LineStatus canHandoff={canHandoff} onToEditor={onToEditor} />}
            </section>
          )}
          {a.cta.options.length > 0 && (
            <section className="st-block">
              <h3>One ending, one ask</h3>
              {a.cta.current && <p className="sd-note">Now: {a.cta.current}</p>}
              <ul className="sd-lines">
                {a.cta.options.map((c) => (
                  <li key={c}>
                    <span><b>{c}</b></span>
                    <button type="button" className={`ov-btn ${lineInUse(w, "cta", c, video) ? "ghost" : "primary"} small`} aria-pressed={lineInUse(w, "cta", c, video)} onClick={() => apply("cta", c)}>{lineInUse(w, "cta", c, video) ? "Remove" : "Use"}</button>
                  </li>
                ))}
              </ul>
              {video && a.cta.options.some((c) => lineInUse(w, "cta", c, video)) && <LineStatus canHandoff={canHandoff} onToEditor={onToEditor} />}
            </section>
          )}
        </>
      )}

      {view === "tests" && (
        <>
          {first && second && (
            <section className="st-block">
              <h3><FlaskConical size={14} /> Test two openings</h3>
              <ol className="sd-ab">
                <li><span>Version A</span><div><b>{first.opening}</b><small>{first.name}</small></div></li>
                <li><span>Version B</span><div><b>{second.opening}</b><small>{second.name}</small></div></li>
              </ol>
              <p className="sd-note">Post A as this video and B on your next comparable one, at a similar time of day. Choose &ldquo;Use this opening&rdquo; on the version you are posting, then save it: SOCIA records which one it was and shows both results on the Rate screen once they have been out about three days. Two posts show a difference, not a cause.</p>
            </section>
          )}
          {tests.length > 0 && (
            <section className="st-block">
              <h3><FlaskConical size={14} /> Worth testing, not proven</h3>
              <ul className="sd-tests">
                {tests.map((e) => (
                  <li key={e.title}>
                    <b>{e.title}</b>
                    {e.hypothesis && <p>{e.hypothesis}</p>}
                    {e.basis && <p><em>Based on:</em> {e.basis}</p>}
                    <p><em>How to test:</em> {e.how}</p>
                  </li>
                ))}
              </ul>
              <p className="sd-note">These rest on a small or mixed sample, so other differences between the posts could explain them. Test before you rely on them.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------- what happened after ----

const STATE_WORD: Record<RaterOutcome["state"], string> = { draft: "Draft", scheduled: "Scheduled", published: "Published", failed: "Did not publish", gone: "Removed" };

/**
 * The rater's memory (lib/raterLog.ts): each video it rated and saved, what
 * was applied and how the post did once it was out. Hidden until one exists.
 */
export function AfterCard({ outcomes, lessons }: { outcomes: RaterOutcome[]; lessons: Lesson[] }) {
  if (!outcomes.length) return null;
  return (
    <section className="ov-card sd-after" aria-labelledby="sd-after-h">
      <h2 id="sd-after-h">What happened after your changes</h2>
      <p className="sd-note">Each video you rated and saved, the changes you applied, and how the post did against your own usual. One post is never proof; a pattern needs three settled posts.</p>
      {lessons.length > 0 && <ul className="sd-lessons">{lessons.map((l) => <li key={l.kind}>{l.line}</li>)}</ul>}
      <ul className="sd-outcomes">
        {outcomes.slice(0, 6).map((o) => {
          const applied = o.fixes.filter((f) => f.applied);
          const step = nextStep(o);
          return (
            <li key={o.postId}>
              <header>
                <b>{o.direction ? `${o.direction}: ` : ""}{o.hook || o.diagnosis || "Rated video"}</b>
                <span className={`sd-state is-${o.state}`}>{STATE_WORD[o.state]}{o.result?.measured ? ` · ${o.result.short}` : ""}</span>
              </header>
              <p>{applied.length ? `Applied: ${applied.map((f) => f.title).join("; ")}.` : "No recommended change was applied."} Scored {o.score} on {new Date(o.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.</p>
              <p>{finding(o)}</p>
              {outlookFinding(o) && <p>{outlookFinding(o)}</p>}
              {step && <p><em>Next:</em> {step}</p>}
              {o.permalink && <a href={o.permalink} target="_blank" rel="noopener noreferrer" className="ov-link">Open the post <ExternalLink size={12} aria-hidden /></a>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
