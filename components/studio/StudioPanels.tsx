"use client";

// The improvement workspace beside the preview: Analyze / Improve / Caption /
// Audio / Prepare. Every panel renders what the analysis actually contains
// and says plainly when something could not be assessed. Improve is a guided
// walkthrough of the fixes SOCIA can make (components/studio/ImproveWalkthrough.tsx).

import AudioInsights from "./AudioPanel";
import type { QuickAudio } from "@/lib/audio/quick";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Check, Copy, RefreshCw, Clock, CalendarPlus, CalendarDays, ArrowRight, Info, Send } from "lucide-react";
import { CATEGORY_INFO, GOALS, fmtT, checklist, versionDiff, type StudioAnalysis, type ApplyField, type GoalId, type ChecklistItem } from "@/lib/studio";
import type { PlanError } from "@/lib/planErrors";
import PlanNotice from "../PlanNotice";
import ImproveWalkthrough, { type FixOptions, type ImproveWalkthroughProps } from "./ImproveWalkthrough";
import { momentsFrom, momentsSummary, type Moment } from "@/lib/studioFixes";
import type { EdlText } from "@/lib/studioClips/types";
import { Bar, CountUp, Reveal, Ring } from "@/components/dashboard/motion";
import "@/app/(app)/dashboard/dashboard.css";
import "@/app/(app)/studio/studio.css";

export type Working = { hook: string; cta: string; caption: string; onscreen: string[]; /** The lines Improve proposes for the video, as preset layers (lib/textPresets.ts): drawn over the player at their moments. */ layers: EdlText[]; platform: string | null; goal: GoalId | null; cover: number | null };
export type ImproveOption = { label: string; text: string; steps: string[] };
export type Improve = (task: "hooks" | "caption" | "cta" | "onscreen" | "variations", params?: { mode?: string; exclude?: string[] }) => Promise<ImproveOption[]>;

/** Thrown by improve(); carries the PlanError when the server refused on plan grounds. */
export class ImproveFailure extends Error {
  planError: PlanError | null;
  constructor(message: string, planError: PlanError | null = null) {
    super(message);
    this.name = "ImproveFailure";
    this.planError = planError;
  }
}

type PanelErr = { message: string; planError: PlanError | null };
const toErr = (e: unknown, fallback: string): PanelErr => ({
  message: e instanceof Error ? e.message : fallback,
  planError: e instanceof ImproveFailure ? e.planError : null,
});
function ErrLine({ err }: { err: PanelErr | null }) {
  if (!err) return null;
  return err.planError ? <PlanNotice error={err.planError} compact /> : <p className="st-err">{err.message}</p>;
}

const CAT_TONE = (s: number | null) => (s == null ? "na" : s >= 80 ? "good" : s >= 60 ? "ok" : "low");
const FIT_CLS = { strong: "success", medium: "warning", weak: "danger" } as const;
const VERDICT = { better: ["Better", "success"], similar: ["Similar", "muted"], worse: ["Behind", "warning"], unknown: ["Not measurable", "muted"] } as const;

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="ov-btn ghost small" aria-label="Copy" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* no clipboard */ } }}>{ok ? <Check size={12} /> : <Copy size={12} />}</button>;
}

/** The creative readiness ring: fills once from empty, counts up once; the markup always carries the final number. */
export function ScoreRing({ score }: { score: number }) {
  return (
    <Ring share={score / 100} size={110} stroke={9} tone={score >= 80 ? "good" : score >= 60 ? "ok" : "low"} label={`Creative readiness ${score} out of 100`}>
      <b><CountUp value={score} /></b>
      <small>of 100</small>
    </Ring>
  );
}

export function AnalyzePanel({ a, w, apply, seek, setActive, onCompare }: { a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; seek: (t: number) => void; setActive: (i: number | null) => void; onCompare: () => void }) {
  const [how, setHow] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);
  return (
    <div className="st-panel">
      <Reveal as="section" className="st-block">
        <div className="st-score">
          <ScoreRing score={a.score.overall} />
          <div className="st-score-meta">
            <small>Creative readiness</small>
            <b>{a.score.label}</b>
            <p>{a.observed.summary}</p>
            <p className="st-score-note">A creative assessment of this draft, not a prediction of reach, views or virality.</p>
            <button type="button" className="ov-link" onClick={() => setHow((v) => !v)}>How is this scored? <ChevronDown size={12} style={{ transform: how ? "rotate(180deg)" : undefined }} /></button>
          </div>
        </div>
        {how && (
          <div className="st-how">
            <p>SOCIA looks at {a.meta.frames} sampled frame{a.meta.frames === 1 ? "" : "s"}{a.meta.hadTranscript ? ", the transcript you provided" : " (no transcript was provided)"} and your caption, then compares with the cover frames and captions of your own top posts. Scores are an editor&apos;s judgement of what is visible, never a prediction of views or virality.</p>
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
          {a.topFixes.map((f, i) => (
            <li key={i} className="st-fix">
              <span className="st-fix-num">{String(i + 1).padStart(2, "0")}</span>
              <div className="st-fix-body">
                <b>{f.title}</b>
                <p className="st-fix-obs">{f.observed}</p>
                <p className="st-fix-sug"><em>Suggested:</em> {f.suggestion}</p>
                <div className="st-fix-actions">
                  {f.t != null && a.kind === "video" && <button type="button" className="ov-btn ghost small" onClick={() => seek(f.t!)}><Clock size={12} /> Jump to {fmtT(f.t)}</button>}
                  {f.apply && <button type="button" className={`ov-btn ${w[f.apply.field === "onscreen" ? "hook" : f.apply.field] === f.apply.value ? "ghost" : "primary"} small`} onClick={() => apply(f.apply!.field, f.apply!.value)}>{f.apply.field === "hook" ? "Use this hook" : f.apply.field === "cta" ? "Use CTA" : f.apply.field === "caption" ? "Use caption" : "Use text"}</button>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {a.segments.length > 0 && (
        <section className="st-block">
          <h3>Video structure</h3>
          <ul className="st-segs">
            {a.segments.map((s, i) => (
              <li key={i} className={`st-seg ${s.rating}`}>
                <button type="button" onClick={() => seek(s.start)}>
                  <span className="st-seg-time">{fmtT(s.start)}–{fmtT(s.end)}</span>
                  <span className="st-seg-body"><b>{s.label}</b><small>{s.reason}</small></span>
                  <em className={`ov-chip ${s.rating === "strong" || s.rating === "good" ? "success" : s.rating === "needs" ? "warning" : "danger"}`}>{s.rating === "needs" ? "Needs improvement" : s.rating[0].toUpperCase() + s.rating.slice(1)}</em>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.markers.length > 0 && (
        <section className="st-block">
          <h3>Timeline insights</h3>
          <ul className="st-markers">
            {a.markers.map((m, i) => (
              <li key={i}><button type="button" className={`st-marker ${m.kind}`} onClick={() => { seek(m.t); setActive(i); }}><span>{fmtT(m.t)}</span><b>{m.label}</b><small>{m.kind === "issue" ? "Issue" : m.kind === "strong" ? "Strong" : m.kind === "pacing" ? "Pacing" : m.kind === "cta" ? "CTA" : "Text"}</small></button></li>
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
            <p className="ov-source">Compared with {a.compare.basis}.</p>
            <table className="st-cmp"><thead><tr><th>Signal</th><th>This draft</th><th>Your winners</th><th></th></tr></thead><tbody>
              {a.compare.rows.map((r) => (<tr key={r.label}><td>{r.label}</td><td>{r.current}</td><td>{r.winners}</td><td><em className={`ov-chip ${VERDICT[r.verdict][1]}`}>{VERDICT[r.verdict][0]}</em></td></tr>))}
            </tbody></table>
            <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.compare.summary}</p></div>
          </>
        ) : <div className="ov-empty small">No synced posts to compare with yet. Connect Instagram and this fills in with your own top posts.</div>}
      </section>

      <section className="st-block">
        <h3>Compare with niche</h3>
        {a.niche ? (
          <>
            <p className="ov-source">Observed among {a.niche.basis}. Patterns, not guarantees.</p>
            <ul className="st-list">{a.niche.patterns.map((p) => <li key={p}>{p}</li>)}</ul>
            <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.niche.summary}</p></div>
          </>
        ) : <div className="ov-empty small">No analysed niche content on file yet. Run discovery on Competitors and this compares your draft with what is working around you.</div>}
      </section>
    </div>
  );
}

export function ImprovePanel({ a, w, seek, playT, thumbs, durationSec, frame, canHandoff, onFix, onCaption, onProposed }: {
  a: StudioAnalysis; w: Working; seek: (t: number) => void; playT: number; thumbs: { src: string; t: number }[]; durationSec: number;
  frame: { width: number; height: number } | null; canHandoff: boolean; onFix: (m: Moment, o: FixOptions) => void; onCaption: () => void;
  onProposed?: ImproveWalkthroughProps["onProposed"];
}) {
  const moments = useMemo(() => momentsFrom({ analysis: a, durationSec, hook: w.hook, cta: w.cta }), [a, durationSec, w.hook, w.cta]);
  if (a.kind !== "video") {
    return (
      <div className="st-panel">
        <section className="st-block">
          <h3>What to change</h3>
          <ol className="st-fixes">
            {a.topFixes.map((f, i) => (
              <li key={i} className="st-fix"><span className="st-fix-num">{String(i + 1).padStart(2, "0")}</span><div className="st-fix-body"><b>{f.title}</b><p className="st-fix-obs">{f.observed}</p><p className="st-fix-sug"><em>Suggested:</em> {f.suggestion}</p></div></li>
            ))}
          </ol>
          <p className="ov-source">For a still post the caption carries the change: write it in the Caption tab.</p>
        </section>
      </div>
    );
  }
  return <ImproveWalkthrough moments={moments} summary={momentsSummary(moments)} thumbs={thumbs} durationSec={durationSec} playT={playT} seek={seek} frame={frame} canHandoff={canHandoff} onFix={onFix} onCaption={onCaption} onProposed={onProposed} />;
}

const CAPTION_MODES = ["Shorter", "More conversational", "More local", "More playful", "More professional", "More creator-style", "More direct", "Stronger CTA"];

export function CaptionPanel({ a, w, setCaption, improve }: { a: StudioAnalysis; w: Working; setCaption: (s: string) => void; improve: Improve }) {
  const [mode, setMode] = useState<string | null>(null);
  const [opts, setOpts] = useState<ImproveOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PanelErr | null>(null);
  const run = async (m: string) => { setMode(m); setBusy(true); setErr(null); try { setOpts(await improve("caption", { mode: m.toLowerCase() })); } catch (e) { setErr(toErr(e, "Couldn't rewrite the caption.")); } finally { setBusy(false); } };
  return (
    <div className="st-panel">
      <section className="st-block">
        <div className="st-block-head"><h3>Caption</h3><span className="ov-range-label">{w.caption.trim().length} chars</span></div>
        <textarea className="st-textarea" rows={6} value={w.caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write the caption here, or start from SOCIA's suggestion below." aria-label="Caption" />
        {a.caption.suggestion && w.caption.trim() !== a.caption.suggestion.trim() && (
          <div className="st-suggestion">
            <small>SOCIA&apos;s suggestion, in your voice and aimed at your goal</small>
            <p>{a.caption.suggestion}</p>
            <div className="st-opt-actions"><button type="button" className="ov-btn primary small" onClick={() => setCaption(a.caption.suggestion!)}>Use suggestion</button><CopyBtn text={a.caption.suggestion} /></div>
          </div>
        )}
      </section>
      <section className="st-block">
        <h3>Improve</h3>
        <div className="st-modes">{CAPTION_MODES.map((m) => <button key={m} type="button" className={`dv-chip${mode === m ? " on" : ""}`} disabled={busy} onClick={() => run(m)}>{m}</button>)}</div>
        {busy && <p className="ov-source">Rewriting {mode?.toLowerCase()}…</p>}
        <ErrLine err={err} />
        {opts.length > 0 && !busy && (
          <ul className="st-options captions">
            {opts.map((o, i) => (<li key={i}><span className="st-opt-style">{o.label}</span><span className="st-opt-text">{o.text}</span><span className="st-opt-actions"><button type="button" className={`ov-btn ${w.caption === o.text ? "ghost" : "primary"} small`} onClick={() => setCaption(o.text)}>{w.caption === o.text ? <><Check size={12} /> In use</> : "Use"}</button><CopyBtn text={o.text} /></span></li>))}
          </ul>
        )}
        <p className="ov-source">Rewrites keep the facts and your brand voice from Settings. You always choose; nothing is replaced until you click Use.</p>
      </section>
    </div>
  );
}

/** The video's sound as measured on the device — numbers, not impressions. */
function MeasuredSound({ m }: { m: QuickAudio }) {
  const cells: { label: string; value: string; note?: string; warn?: boolean }[] = m.level === "unknown"
    ? [{ label: "Sound", value: "Not measured", note: "no audio could be read from the file on this device" }]
    : !m.hasAudio
    ? [{ label: "Sound", value: "None", note: "no audible sound in the file", warn: true }]
    : [
        { label: "Level", value: m.levelDb != null ? `${m.levelDb} dBFS` : "—", note: m.level === "quiet" ? "quiet — raise it" : m.level === "loud" ? "loud — may distort" : "comfortable", warn: m.level === "quiet" || m.level === "loud" },
        { label: "Sound", value: `${Math.round((m.audibleRatio ?? 0) * 100)}%`, note: "of the video" },
        { label: "Opening", value: m.silentOpeningSec >= 0.5 ? `${m.silentOpeningSec}s silent` : "starts at once", note: m.silentOpeningSec >= 0.5 ? "cut the silent start" : undefined, warn: m.silentOpeningSec >= 0.5 },
        { label: "Longest pause", value: m.longestPauseSec >= 0.7 ? `${m.longestPauseSec}s` : "none", warn: m.longestPauseSec >= 1.5 },
        { label: "Music", value: m.musicLikely ? "likely" : "not clear", note: m.bpm ? `steady beat ~${m.bpm} BPM` : undefined },
      ];
  return (
    <div className="st-measured">
      <small>Measured from the video&apos;s sound on this device</small>
      <ul>{cells.map((c) => <li key={c.label} className={c.warn ? "warn" : ""}><span>{c.label}</span><b>{c.value}</b>{c.note && <em>{c.note}</em>}</li>)}</ul>
    </div>
  );
}

export function AudioPanel({ a }: { a: StudioAnalysis }) {
  const Dir = ({ d, title }: { d: StudioAnalysis["audio"]["direction"]; title: string }) => (
    <div className="st-audio-dir">
      <small>{title}</small>
      <b>{d.style || "—"}</b>
      <span>{[d.bpm, d.texture].filter(Boolean).join(" · ")}</span>
      {d.why && <p>{d.why}</p>}
    </div>
  );
  return (
    <div className="st-panel">
      <section className="st-block">
        <h3>Audio</h3>
        {a.measuredAudio && <MeasuredSound m={a.measuredAudio} />}
        <div className="ov-why-block"><small>Observed{a.meta.autoTranscript ? " · from the measurements and the automatic transcript" : a.meta.audioMeasured ? " · from the measurements" : ""}</small><p>{a.audio.observed || (a.meta.hadTranscript || a.meta.audioMeasured ? "Nothing notable about the sound." : "No transcript or on-screen text was provided, so nothing about the sound could be assessed.")}</p></div>
        {a.kind === "video" ? (
          <div className="st-audio">
            <Dir d={a.audio.direction} title="Recommended direction" />
            <Dir d={a.audio.alternative} title="Alternative" />
          </div>
        ) : <div className="ov-empty small">Audio direction applies to video. For a still post, the caption carries the tone.</div>}
      </section>
      {a.kind === "video" && <AudioInsights canEdit={false} current={null} onUse={() => null} />}
      <p className="ov-source">Instagram&apos;s trending audio is listed on <Link href="/discover">Discover</Link>, in Instagram&apos;s order; TikTok shares none.</p>
    </div>
  );
}

export function PreparePanel({ a, w, versions, setGoal, setPlatform, improve, onSaveDraft, onPublish, saving, savedId, planNote }: {
  a: StudioAnalysis | null; w: Working; versions: { analysis: StudioAnalysis; at: string }[]; setGoal: (g: GoalId | null) => void; setPlatform: (p: string | null) => void; improve: Improve;
  onSaveDraft: () => Promise<unknown>;
  /** Saves the draft (same flow as onSaveDraft) and hands it to Create Post. */
  onPublish: () => Promise<void>;
  saving: boolean; savedId: string | null; planNote: string;
}) {
  const [vars, setVars] = useState<ImproveOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PanelErr | null>(null);
  const [handing, setHanding] = useState(false);
  const publish = async () => { setHanding(true); try { await onPublish(); } finally { setHanding(false); } };
  const items: ChecklistItem[] = checklist(a, { caption: w.caption, platform: w.platform, hook: w.hook, cta: w.cta, cover: w.cover != null });
  const done = items.filter((i) => i.done).length;
  return (
    <div className="st-panel">
      <section className="st-block">
        <h3>Content goal</h3>
        <div className="st-modes">
          {GOALS.map((g) => <button key={g.id} type="button" className={`dv-chip${w.goal === g.id ? " on" : ""}`} onClick={() => setGoal(w.goal === g.id ? null : g.id)}>{g.label}</button>)}
        </div>
        <p className="ov-source">{w.goal ? `SOCIA weights its advice toward ${GOALS.find((g) => g.id === w.goal)?.focus}. Re-run the analysis after changing it.` : "Pick a goal and SOCIA's fixes, hooks and CTAs lean toward it."}</p>
      </section>
      <section className="st-block">
        <h3>Platform</h3>
        <div className="st-modes">{["Instagram Reels", "TikTok", "YouTube Shorts", "Instagram Feed"].map((p) => <button key={p} type="button" className={`dv-chip${w.platform === p ? " on" : ""}`} onClick={() => setPlatform(w.platform === p ? null : p)}>{p}</button>)}</div>
      </section>
      <section className="st-block">
        <div className="st-block-head"><h3>Ready to publish</h3><span className="ov-range-label">{done} of {items.length}</span></div>
        <ul className="st-checklist">
          {items.map((i) => <li key={i.id} className={i.done ? "done" : ""}><i>{i.done ? <Check size={11} /> : null}</i><span><b>{i.label}</b><small>{i.hint}</small></span></li>)}
        </ul>
        <div className="st-row-actions">
          <Link href={`/plan?note=${encodeURIComponent(planNote)}`} className="ov-btn ghost small"><CalendarDays size={12} /> Add to Content Plan</Link>
          <button type="button" className="ov-btn ghost small" disabled={saving || handing || Boolean(savedId)} onClick={() => void onSaveDraft()}><CalendarPlus size={12} /> {saving && !handing ? "Saving…" : savedId ? "Saved as draft" : "Save draft to Calendar"}</button>
          <button type="button" className="btn-primary sm" disabled={saving || handing} onClick={publish}><Send size={12} /> {handing ? "Opening Create Post…" : "Publish or schedule"}</button>
          {savedId && <Link href="/plan/calendar" className="ov-btn ghost small">Open Calendar <ArrowRight size={12} /></Link>}
        </div>
        <p className="ov-source"><Info size={11} /> Both actions upload this file to your own media folder and create a draft for tomorrow at your suggested hour. Publish or schedule then opens it in Create Post, where you pick the platforms and the time; nothing is published until you confirm there.</p>
      </section>
      {a && (
        <section className="st-block">
          <div className="st-block-head"><h3>Create variations</h3><button type="button" className="ov-btn ghost small" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { setVars(await improve("variations")); } catch (e) { setErr(toErr(e, "Couldn't build variations.")); } finally { setBusy(false); } }}><RefreshCw size={12} className={busy ? "spin" : undefined} /> {vars.length ? "Regenerate" : "Generate"}</button></div>
          {vars.length ? (
            <ul className="st-vars">
              {vars.map((v, i) => (<li key={i}><b>{v.label}</b><p>{v.text}</p>{v.steps.length > 0 && <ol>{v.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>}</li>))}
            </ul>
          ) : <p className="ov-source">A 15-second cut, a 6-second teaser, a TikTok version, a Story version and a carousel concept, each as editing instructions. SOCIA does not render video.</p>}
          <ErrLine err={err} />
        </section>
      )}
      {versions.length > 1 && (
        <section className="st-block">
          <h3>Score history</h3>
          <ul className="st-versions">
            {versions.map((v, i) => {
              const diff = i > 0 ? versionDiff(versions[i - 1].analysis, v.analysis) : [];
              return (<li key={i}><b>Version {i + 1}</b><span className="st-ver-score">{v.analysis.score.overall}</span>{diff.length > 0 && <small>{diff.map((d) => `${d.label} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(" · ")}</small>}</li>);
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
