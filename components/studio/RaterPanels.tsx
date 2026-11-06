"use client";

// The Content Rater's results (Noah asked for the one-page Analyze layout back,
// 2026-11-06): the score, the outlook, what to fix, where it happens, the
// comparisons and other ways to make it, in one scroll. Improve, Caption, Audio
// and Prepare stay in StudioPanels.tsx. Every number shown is one SOCIA measured
// or read. The score is an editor's judgement and predicts nothing; the
// performance outlook is calculated from the account's own Reels
// (lib/outlook.ts) and states a view range only when its replay over those
// Reels holds up.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock, Copy, ExternalLink, FlaskConical } from "lucide-react";
import { CATEGORY_INFO, fmtT, type ApplyField, type Marker, type StudioAnalysis, type TopFix } from "@/lib/studio";
import { CONFIDENCE_LABEL, PRIORITY_LABEL, directionText, fmtSpan, type Direction, type PostRef, type RefRow } from "@/lib/studioVerdict";
import { CAPABILITY, type Moment } from "@/lib/studioFixes";
import { finding, nextStep, outlookFinding, type Lesson, type RaterOutcome } from "@/lib/raterLog";
import { BACKTEST_MIN, BASELINE_MIN, RECENT_N, SETTLE_DAYS, fmtViews, outlookFor, patternLine, roundViews, type Outlook } from "@/lib/outlook";
import type { OutlookPayload } from "@/lib/outlookLoad";
import { MomentPreview, type FixOptions } from "./ImproveWalkthrough";
import { Bar, CountUp, Reveal, Ring } from "@/components/dashboard/motion";
import "@/app/(app)/dashboard/dashboard.css";
import "@/app/(app)/studio/studio.css";

type Working = { hook: string; cta: string; caption: string; onscreen: string[] };

const VERDICT: Record<string, [string, string]> = { better: ["Better", "success"], similar: ["Similar", "muted"], worse: ["Behind", "warning"], unknown: ["Not measurable", "muted"] };
const CAT_TONE = (s: number | null) => (s == null ? "na" : s >= 80 ? "good" : s >= 60 ? "ok" : "low");
const FIT_CLS: Record<string, string> = { strong: "success", medium: "warning", weak: "danger" };
const APPLY_LABEL: Record<ApplyField, string> = { hook: "Use this hook", cta: "Use this ending", caption: "Use this caption", onscreen: "Use this text" };

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

// ------------------------------------------------------------------ outlook ----

/** What the page knows about the account's Reels: still loading, failed, or the payload. */
export type OutlookState = { status: "loading" } | { status: "error" } | { status: "ready"; data: OutlookPayload };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const MOMENTUM_WORD = { above: "Above your earlier Reels", below: "Below your earlier Reels", level: "Level with your earlier Reels" } as const;

/**
 * The draft against the account's own Reels (lib/outlook.ts): its usual views
 * and range, what the caption shares with past Reels, and, only when the
 * replay over those Reels passed, an index and a view range. Every figure is
 * calculated from stored view counts; the method and the sample open below it.
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
  // Before a caption is written, the suggested one stands in, and is named as such.
  const own = caption.trim().length > 0;
  const read = own ? caption : suggestion ?? "";
  const o: Outlook = outlookFor(model, read);
  const f = o.forecast;
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
                <div><dt>Usual range</dt><dd><b>{fmtViews(roundViews(b.low))} to {fmtViews(roundViews(b.high))}</b></dd><small>Half of those Reels landed in this range.</small></div>
                <div>
                  <dt>Recent momentum</dt>
                  <dd><b>{mo ? MOMENTUM_WORD[mo.word] : "Not measurable yet"}</b></dd>
                  <small>{mo ? `Last ${mo.recentN}: median ${fmtViews(mo.recentMedian)}. The ${mo.earlierN} before: ${fmtViews(mo.earlierMedian)}.` : `Needs ${RECENT_N + BASELINE_MIN} settled Reels; you have ${b.n}.`}</small>
                </div>
              </>
            )}
          </dl>

          {!f && <p className="sd-note"><b>Virality index: not shown yet.</b> SOCIA&apos;s model has to predict your past Reels better than your plain median before it may score a draft{bt && bt.n >= BACKTEST_MIN ? ", and so far it does not" : ", and there are too few Reels to test it on"}. The range above is your usual, not a forecast for this draft.</p>}
          {alt && f && (alt.index !== f.index || alt.low !== f.low || alt.high !== f.high) && <p className="sd-note"><b>With the suggested caption:</b> index {alt.index}, {fmtViews(alt.low)} to {fmtViews(alt.high)} views. Edits to the video itself raise the creative review; their effect on views can&apos;t be estimated from your history, so none is shown.</p>}

          <div className="sd-opat">
            <h4>What your own Reels show about {own ? "this caption" : "the suggested caption"}</h4>
            {!read.trim()
              ? <p className="sd-note">Write the caption and SOCIA compares how it opens, its subject and its length with your Reels.</p>
              : o.shared.length
                ? <ul>{o.shared.map((p) => <li key={p.key}>{patternLine(p)}</li>)}</ul>
                : <p className="sd-note">Nothing about this caption matches a pattern in your Reels. A pattern needs three Reels with it and three without.</p>}
            {o.shared.length > 0 && <p className="sd-note">Patterns in a few of your posts, not proof of why they did well: other things differed between them.</p>}
          </div>

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

export type AnalyzeProps = {
  a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; seek: (t: number) => void;
  setActive: (i: number | null) => void;
  onCompare: () => void;
  /** The edits SOCIA can make (lib/studioFixes.ts), each tied to the fix it carries out. */
  moments: Moment[];
  thumbs: { src: string; t: number }[];
  frame: { width: number; height: number } | null;
  durationSec: number;
  /** The file is at hand, so a fix can open the editor with it applied. */
  canHandoff: boolean;
  onFix: (m: Moment, o: FixOptions) => void;
  onImprove: () => void;
  onCaption: () => void;
  /** The account's own Reels for the performance outlook; null on a still image, where Reels are no comparison. */
  outlook: OutlookState | null;
  onOutlookRetry: () => void;
  onUseDirection: (d: Direction) => void;
  onEditor: (d: Direction) => void;
};

/** The creative readiness ring: fills once from empty, counts up once; the markup always carries the final number. */
function ScoreRing({ score }: { score: number }) {
  return (
    <Ring share={score / 100} size={110} stroke={9} tone={score >= 80 ? "good" : score >= 60 ? "ok" : "low"} label={`Creative readiness ${score} out of 100`}>
      <b><CountUp value={score} /></b>
      <small>of 100</small>
    </Ring>
  );
}

const MARKER_WORD: Record<Marker["kind"], string> = { issue: "Issue", strong: "Strong", pacing: "Pacing", cta: "CTA", text: "Text" };
type Entry = { t: number; end: number | null; kind: Marker["kind"]; word: string; label: string; marker: number | null };

/** Everything the analysis placed in time, in order: its markers, its suggested cuts and the text it would add. */
function entriesOf(a: StudioAnalysis): Entry[] {
  const out: Entry[] = a.markers.map((m, i) => ({ t: m.t, end: null, kind: m.kind, word: MARKER_WORD[m.kind] ?? "Note", label: m.label, marker: i }));
  for (const c of a.cuts?.edits ?? []) out.push({ t: c.start, end: c.end, kind: "pacing", word: "Suggested edit", label: `${c.type === "trim" ? "Trim" : "Cut"} ${(c.end - c.start).toFixed(1)} s${c.reason ? `: ${c.reason}` : ""}`, marker: null });
  for (const o of a.onScreenText) out.push({ t: o.t, end: null, kind: "text", word: "Suggested edit", label: `Add on-screen text: ${o.text}`, marker: null });
  return out.sort((x, y) => x.t - y.t);
}

/** The results on one page, top to bottom: the score, the outlook, what to fix, where it happens, then the comparisons and other ways to make it. */
export function AnalyzePanel({ a, w, apply, seek, setActive, onCompare, moments, thumbs, frame, durationSec, canHandoff, onFix, onImprove, onCaption, outlook, onOutlookRetry, onUseDirection, onEditor }: AnalyzeProps) {
  const [how, setHow] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const inUse = (f: TopFix) => (f.apply ? (f.apply.field === "onscreen" ? w.onscreen.includes(f.apply.value) : w[f.apply.field] === f.apply.value) : false);
  const entries = a.kind === "video" ? entriesOf(a) : [];
  return (
    <div className="st-panel">
      <Reveal as="section" className="st-block">
        <div className="st-score">
          <ScoreRing score={a.score.overall} />
          <div className="st-score-meta">
            <small>Creative readiness</small>
            <b>{a.score.label}</b>
            {a.diagnosis && <p>{a.diagnosis}</p>}
            <p>{a.observed.summary}</p>
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
        <ul className="st-cats">
          {a.categories.map((c) => (
            <li key={c.id} className={`st-cat ${CAT_TONE(c.score)}${openCat === c.id ? " on" : ""}`}>
              <button type="button" className="st-cat-row" onClick={() => setOpenCat(openCat === c.id ? null : c.id)} aria-expanded={openCat === c.id}>
                <span className="st-cat-label">{CATEGORY_INFO[c.id].label}</span>
                <Bar share={(c.score ?? 0) / 100} tone={c.score == null ? "muted" : "data"} className="st-cat-track" />
                <b>{c.score == null ? "n/a" : c.score}</b>
                <ChevronDown size={13} className="st-cat-chev" />
              </button>
              {openCat === c.id && (
                <div className="st-cat-detail">
                  <p>{c.explanation || "Not assessable from what was provided."}</p>
                  {c.evidence && <div className="ov-why-block"><small>Evidence</small><p>{c.evidence}</p></div>}
                  {c.fix && <div className="ov-why-block rec"><small>Suggested fix</small><p>{c.fix}</p></div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Reveal>

      {outlook && <OutlookBlock state={outlook} caption={w.caption} suggestion={a.caption.suggestion} onRetry={onOutlookRetry} />}

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

      <section className="st-block">
        <h3>Highest-priority edits</h3>
        <ol className="st-fixes">
          {a.topFixes.map((f, i) => {
            const when = fixWhen(f);
            const priority = f.priority ?? (i === 0 ? "high" : "medium");
            const m = moments.find((x) => x.fixIndex === i) ?? null;
            return (
              <li key={`${f.title}-${i}`} className="st-fix">
                <span className="st-fix-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="st-fix-body">
                  <b>{f.title}</b>
                  <p className="sd-note">{when ? `${when} · ` : ""}{PRIORITY_LABEL[priority]}</p>
                  <p className="st-fix-obs">{f.observed}</p>
                  <p className="st-fix-sug"><em>Suggested:</em> {f.suggestion}</p>
                  {f.why && <p className="st-fix-obs">{f.why}</p>}
                  <div className="st-fix-actions">
                    {f.t != null && a.kind === "video" && <button type="button" className="ov-btn ghost small" onClick={() => seek(f.t!)}><Clock size={12} /> Jump to {fmtT(f.t)}</button>}
                    {f.apply && <button type="button" className={`ov-btn ${inUse(f) ? "ghost" : "primary"} small`} onClick={() => apply(f.apply!.field, f.apply!.value)}>{inUse(f) ? <><Check size={12} /> In use</> : APPLY_LABEL[f.apply.field]}</button>}
                    {m && m.capability !== "caption" && <button type="button" className="ov-btn ghost small" aria-expanded={preview === i} onClick={() => setPreview(preview === i ? null : i)}>{preview === i ? "Hide the preview" : "Preview the change"}</button>}
                    {m && m.capability !== "caption" && <button type="button" className={`ov-btn ${f.apply ? "ghost" : "primary"} small`} disabled={!canHandoff} onClick={() => onFix(m, { presetId: m.text?.presetId, cuts: m.cuts?.map(({ start, end }) => ({ start, end })) })}>{CAPABILITY[m.capability].label} <ArrowRight size={12} /></button>}
                    {m && m.capability === "caption" && <button type="button" className="ov-btn ghost small" onClick={onCaption}>Rewrite the caption <ArrowRight size={12} /></button>}
                  </div>
                  {m && m.capability !== "caption" && <p className="sd-note">{canHandoff ? `Opens the ${CAPABILITY[m.capability].where}${m.capability === "pauses" || m.capability === "text" ? " with this applied. Your original file is not changed" : ""}.` : "Upload the original file to apply this in the editor."}</p>}
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
              </li>
            );
          })}
        </ol>
        {a.kind === "video" && moments.length > 0 && <p className="sd-note"><button type="button" className="ov-link" onClick={onImprove}>All {moments.length} edits SOCIA can make, one by one <ArrowRight size={12} /></button></p>}
      </section>

      {a.segments.length > 0 && (
        <section className="st-block">
          <h3>Video structure</h3>
          <ul className="st-segs">
            {a.segments.map((s, i) => (
              <li key={i} className={`st-seg ${s.rating}`}>
                <button type="button" onClick={() => seek(s.start)}>
                  <span className="st-seg-time">{fmtT(s.start)} to {fmtT(s.end)}</span>
                  <span className="st-seg-body"><b>{s.label}</b><small>{s.reason}</small></span>
                  <em className={`ov-chip ${s.rating === "strong" || s.rating === "good" ? "success" : s.rating === "needs" ? "warning" : "danger"}`}>{s.rating === "needs" ? "Needs improvement" : s.rating[0].toUpperCase() + s.rating.slice(1)}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length > 0 && (
        <section className="st-block">
          <h3>Timeline insights</h3>
          <ul className="st-markers">
            {entries.map((e, i) => (
              <li key={i}><button type="button" className={`st-marker ${e.kind}`} onClick={() => { seek(e.t); setActive(e.marker); }}><span>{e.end != null ? fmtSpan(e.t, e.end) : fmtAt(e.t)}</span><b>{e.label}</b><small>{e.word}</small></button></li>
            ))}
          </ul>
        </section>
      )}

      <section className="st-block">
        <h3>Platform fit</h3>
        <ul className="st-fit">
          {a.platformFit.map((p) => (
            <li key={p.platform}><b>{p.platform}</b><em className={`ov-chip ${FIT_CLS[p.fit]}`}>{p.fit[0].toUpperCase() + p.fit.slice(1)}</em><p>{p.note}</p></li>
          ))}
        </ul>
        <p className="ov-source">Fit is an editor&apos;s read of length, opening and text against each format. SOCIA does not claim platform ranking rules.</p>
      </section>

      <section className="st-block">
        <div className="st-block-head"><h3>Compare to my winners</h3>{a.compare && <button type="button" className="ov-link" onClick={onCompare}>See examples <ArrowRight size={12} /></button>}</div>
        {a.compare ? (
          <>
            <p className="ov-source">Compared with {a.compare.basis}. A pattern across {a.compare.sample} posts shows what they share, not what caused their results.</p>
            {a.compare.posts && a.compare.posts.length > 0 && <PostRow posts={a.compare.posts} mine />}
            <RefTable head={["This draft", "Your winners"]} rows={a.compare.rows.map((r) => ({ label: r.label, current: r.current, theirs: r.winners, verdict: r.verdict, refs: r.refs }))} />
            <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.compare.summary}</p></div>
          </>
        ) : <div className="ov-empty small">No synced posts to compare with yet. Connect Instagram and this fills in with your own top posts.</div>}
      </section>

      <section className="st-block">
        <div className="st-block-head"><h3>Compare with competitors</h3><Link href="/discover" className="ov-link">Discover <ArrowRight size={12} /></Link></div>
        {a.competitors ? (
          <>
            <p className="ov-source">Compared with {a.competitors.basis}, with the numbers the platforms published. Their results, not a forecast for yours. Take the structure, never the wording.</p>
            <PostRow posts={a.competitors.posts} mine={false} />
            <RefTable head={["This draft", "Their Reels"]} rows={a.competitors.rows} />
            {a.competitors.takeaways.length > 0 && (
              <>
                <h4 className="sd-sub">What you could take from them</h4>
                <ul className="st-list">{a.competitors.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
              </>
            )}
            {a.competitors.summary && <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.competitors.summary}</p></div>}
          </>
        ) : <div className="ov-empty small">No competitor Reels on file for this brand yet. Track a few accounts on Discover, and your next analysis compares this draft with their Reels that took off.</div>}
      </section>

      <section className="st-block">
        <h3>Compare with niche</h3>
        {a.niche ? (
          <>
            <p className="ov-source">Observed among {a.niche.basis}. Patterns, not guarantees.</p>
            <ul className="st-list">{a.niche.patterns.map((p) => <li key={p}>{p}</li>)}</ul>
            <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.niche.summary}</p></div>
          </>
        ) : <div className="ov-empty small">No analysed niche content on file yet. Run discovery on Discover and this compares your draft with what is working around you.</div>}
      </section>

      {a.experiments && a.experiments.length > 0 && (
        <section className="st-block">
          <h3><FlaskConical size={14} /> Worth testing, not proven</h3>
          <ul className="sd-tests">
            {a.experiments.map((e) => (
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

      <Directions a={a} w={w} apply={apply} canHandoff={canHandoff} onUseDirection={onUseDirection} onEditor={onEditor} />
    </div>
  );
}

// ----------------------------------------------------------------- compare ----

/** The real posts a comparison rests on, to open and watch. */
function PostRow({ posts, mine }: { posts: PostRef[]; mine: boolean }) {
  return (
    <ul className="sd-posts">
      {posts.map((p) => {
        const body = (
          <>
            <span className="sd-post-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <i aria-hidden />}
              <em>{p.id}</em>
            </span>
            <span className="sd-post-body">
              <b>{mine ? p.title || "Untitled post" : p.account ?? "An account in your niche"}</b>
              {!mine && p.title && <small>{p.title}</small>}
              <small>{p.result || "No counts published"}</small>
            </span>
          </>
        );
        return (
          <li key={p.id}>
            {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.id}: ${p.title || p.account || "post"}`}>{body}<ExternalLink size={12} aria-hidden /></a> : <span>{body}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function RefTable({ head, rows }: { head: [string, string]; rows: (RefRow | { label: string; current: string; theirs: string; verdict: string; refs?: string[] })[] }) {
  return (
    <div className="sd-scroll">
      <table className="st-cmp">
        <thead><tr><th>Signal</th><th>{head[0]}</th><th>{head[1]}</th><th>Based on</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td><td>{r.current}</td><td>{r.theirs}</td>
              <td className="sd-refs">{r.refs?.length ? r.refs.join(", ") : "all"}</td>
              <td><em className={`ov-chip ${(VERDICT[r.verdict] ?? VERDICT.unknown)[1]}`}>{(VERDICT[r.verdict] ?? VERDICT.unknown)[0]}</em></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------- directions ----

function DirectionCard({ d, inUse, onUse, canHandoff, onEditor }: { d: Direction; inUse: boolean; onUse: () => void; canHandoff: boolean; onEditor: () => void }) {
  return (
    <li className={`sd-dir${d.testFirst ? " is-first" : ""}`}>
      <header>
        <b>{d.name}</b>
        {d.testFirst && <span className="sd-dir-tag">Test this first</span>}
        {d.lengthSec != null && <small>about {d.lengthSec} seconds</small>}
      </header>
      {d.approach && <p>{d.approach}</p>}
      <div className="sd-dir-open">
        <small>Opening line</small>
        <p>{d.opening}</p>
      </div>
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
      <div className="sd-fix-actions">
        <button type="button" className={`ov-btn ${inUse ? "ghost" : "primary"} small`} onClick={onUse}>{inUse ? <><Check size={12} /> Opening in use</> : "Use this opening"}</button>
        <button type="button" className="ov-btn ghost small" disabled={!canHandoff} onClick={onEditor}>Start this version in the editor <ArrowRight size={12} /></button>
        <CopyBtn text={directionText(d)} label="Copy the brief" />
      </div>
      <p className="sd-note">{canHandoff ? "The editor opens with this opening line on the video. Reordering the shots is yours to do there; your original file is not changed." : "Upload the original file to start this version in the editor."}</p>
    </li>
  );
}

function Directions({ a, w, apply, canHandoff, onUseDirection, onEditor }: { a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; canHandoff: boolean; onUseDirection: (d: Direction) => void; onEditor: (d: Direction) => void }) {
  const dirs = a.directions ?? [];
  const first = dirs.find((d) => d.testFirst) ?? dirs[0];
  const second = dirs.find((d) => d !== first);
  return (
    <>
      {dirs.length > 0 && (
        <section className="st-block">
          <h3>Three ways to remake it</h3>
          <p className="sd-note">Each is a version to test, with what it costs you. SOCIA can&apos;t know which will do best: it marks the one it would try first and says why.</p>
          <ol className="sd-dirs">
            {dirs.map((d) => <DirectionCard key={d.name} d={d} inUse={w.hook === d.opening} onUse={() => onUseDirection(d)} canHandoff={canHandoff} onEditor={() => onEditor(d)} />)}
          </ol>
        </section>
      )}

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

      {a.hooks.options.length > 0 && (
        <section className="st-block">
          <h3>Other opening lines</h3>
          {a.hooks.current && <p className="sd-note">Now: {a.hooks.current}</p>}
          <ul className="sd-lines">
            {a.hooks.options.map((h) => (
              <li key={h.text}>
                <span><b>{h.text}</b><small>{h.style[0].toUpperCase() + h.style.slice(1)}</small></span>
                <button type="button" className={`ov-btn ${w.hook === h.text ? "ghost" : "primary"} small`} onClick={() => apply("hook", h.text)}>{w.hook === h.text ? <><Check size={12} /> In use</> : "Use"}</button>
              </li>
            ))}
          </ul>
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
                <button type="button" className={`ov-btn ${w.cta === c ? "ghost" : "primary"} small`} onClick={() => apply("cta", c)}>{w.cta === c ? <><Check size={12} /> In use</> : "Use"}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
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
