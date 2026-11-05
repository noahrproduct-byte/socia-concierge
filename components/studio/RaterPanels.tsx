"use client";

// The Content Rater's workspaces (Noah, 2026-11-05): the analysis as decisions
// rather than a report.
//   Verdict      what to fix, in priority order, each with its evidence
//   Timeline     where the problems are, on the video's own frames
//   Performance  the draft against the account's top posts and competitors' Reels
//   Directions   three ways to remake it, to test
// Improve and export (the edits, caption, sound and publishing) stay in
// StudioPanels.tsx. Every number shown is one SOCIA measured or read; the
// score is an editor's judgement and nothing here predicts views.

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock, Copy, ExternalLink, FlaskConical } from "lucide-react";
import { CATEGORY_INFO, fmtT, type ApplyField, type Marker, type StudioAnalysis, type TopFix } from "@/lib/studio";
import { CONFIDENCE_LABEL, PRIORITY_LABEL, directionText, fmtSpan, type Direction, type PostRef, type RefRow } from "@/lib/studioVerdict";
import { Bar } from "@/components/dashboard/motion";
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

// ------------------------------------------------------------------ verdict ----

export function VerdictPanel({ a, w, apply, seek, onImprove }: { a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void; seek: (t: number) => void; onImprove: () => void }) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const urgent = a.topFixes.filter((f) => f.priority === "critical" || f.priority === "high").length;
  const inUse = (f: TopFix) => (f.apply ? (f.apply.field === "onscreen" ? w.onscreen.includes(f.apply.value) : w[f.apply.field] === f.apply.value) : false);
  return (
    <div className="st-panel">
      <section className="st-block sd-verdict">
        <div className="sd-vscore" role="img" aria-label={`Creative readiness ${a.score.overall} out of 100: ${a.score.label}`}>
          <b>{a.score.overall}</b>
          <small>of 100</small>
        </div>
        <div className="sd-vhead">
          <small>Creative review · {a.score.label}</small>
          <h3>{a.diagnosis || a.observed.summary}</h3>
          <p>
            {a.topFixes.length} change{a.topFixes.length === 1 ? "" : "s"} to make{urgent ? `, ${urgent} of ${urgent === 1 ? "it" : "them"} high priority` : ""}.
            {a.diagnosis && a.observed.summary ? ` ${a.observed.summary}` : ""}
          </p>
          <p className="sd-note">A creative assessment of this draft, not a prediction of reach, views or virality.</p>
        </div>
      </section>

      <ol className="sd-fixes" aria-label="Changes to make, most important first">
        {a.topFixes.map((f, i) => {
          const when = fixWhen(f);
          const priority = f.priority ?? (i === 0 ? "high" : "medium");
          return (
            <li key={`${f.title}-${i}`} className={`sd-fix is-${priority}`}>
              <header>
                <span className="sd-fix-n">{String(i + 1).padStart(2, "0")}</span>
                <b>{f.title}</b>
                <span className="sd-fix-meta">{when ? `${when} · ` : ""}{PRIORITY_LABEL[priority]}</span>
              </header>
              <dl>
                <div><dt>Problem</dt><dd>{f.observed}</dd></div>
                <div><dt>Fix</dt><dd>{f.suggestion}</dd></div>
                {f.why && <div><dt>Why</dt><dd>{f.why}</dd></div>}
              </dl>
              <div className="sd-fix-actions">
                {f.t != null && a.kind === "video" && <button type="button" className="ov-btn ghost small" onClick={() => seek(f.t!)}><Clock size={12} /> Jump to {fmtT(f.t)}</button>}
                {f.apply && <button type="button" className={`ov-btn ${inUse(f) ? "ghost" : "primary"} small`} onClick={() => apply(f.apply!.field, f.apply!.value)}>{inUse(f) ? <><Check size={12} /> In use</> : APPLY_LABEL[f.apply.field]}</button>}
                {a.kind === "video" && priority !== "experiment" && <button type="button" className="ov-btn ghost small" onClick={onImprove}>Fix it in Improve <ArrowRight size={12} /></button>}
              </div>
              {(f.evidence || f.apply) && (
                <details className="sd-why">
                  <summary>Why SOCIA recommends this</summary>
                  <dl>
                    <div><dt>Observed</dt><dd>{f.observed}</dd></div>
                    {f.evidence?.account && <div><dt>Your posts</dt><dd>{f.evidence.account}</dd></div>}
                    {f.evidence?.niche && <div><dt>Your niche</dt><dd>{f.evidence.niche}</dd></div>}
                    {f.evidence && <div><dt>Confidence</dt><dd><b>{CONFIDENCE_LABEL[f.evidence.confidence]}.</b> {f.evidence.confidenceWhy}</dd></div>}
                    {f.apply && <div><dt>Suggested line</dt><dd>{f.apply.value}</dd></div>}
                  </dl>
                </details>
              )}
            </li>
          );
        })}
      </ol>

      {a.strengths && a.strengths.length > 0 && (
        <section className="st-block">
          <h3>What you&apos;re already doing well</h3>
          <ul className="sd-works">{a.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}

      {a.planFit && (
        <section className="st-block">
          <h3>Against your planned post</h3>
          <p className="st-planfit"><b>{a.planFit.title}</b> {a.planFit.summary}</p>
        </section>
      )}

      <details className="st-block sd-scores">
        <summary>All {a.categories.length} scores and how they are judged</summary>
        <p className="sd-note">SOCIA looks at {a.meta.frames} sampled frame{a.meta.frames === 1 ? "" : "s"}{a.meta.hadTranscript ? ", the transcript" : " (no transcript was provided)"} and your caption, then compares with your own top posts{a.competitors ? " and competitors' Reels" : ""}. Scores close together mean the same thing: use the order above to decide what to fix first.</p>
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
                  <p className="sd-note">Judged on: {CATEGORY_INFO[c.id].analyzes.join("; ")}.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ----------------------------------------------------------------- timeline ----

type Tone = "problem" | "chance" | "strong" | "edit";
const TONE_WORD: Record<Tone, string> = { problem: "Problem", chance: "Opportunity", strong: "Strong moment", edit: "Suggested edit" };
const MARKER_TONE: Record<Marker["kind"], Tone> = { issue: "problem", pacing: "chance", cta: "chance", text: "chance", strong: "strong" };
type Entry = { t: number; end: number | null; tone: Tone; label: string; detail: string | null; marker: number | null };

/** Everything the analysis placed in time, in order: its markers, its suggested cuts and the text it would add. */
function entriesOf(a: StudioAnalysis): Entry[] {
  const out: Entry[] = a.markers.map((m, i) => ({ t: m.t, end: null, tone: MARKER_TONE[m.kind] ?? "chance", label: m.label, detail: null, marker: i }));
  for (const c of a.cuts?.edits ?? []) out.push({ t: c.start, end: c.end, tone: "edit", label: `${c.type === "trim" ? "Trim" : "Cut"} ${(c.end - c.start).toFixed(1)} s`, detail: c.reason || null, marker: null });
  for (const o of a.onScreenText) out.push({ t: o.t, end: null, tone: "edit", label: `Add on-screen text: ${o.text}`, detail: o.role === "opening" ? "Opening line" : o.role === "cta" ? "Ending line" : "Mid-video line", marker: null });
  return out.sort((x, y) => x.t - y.t);
}

export function TimelinePanel({ a, thumbs, playT, seek, setActive }: { a: StudioAnalysis; thumbs: { src: string; t: number }[]; playT: number; seek: (t: number) => void; setActive: (i: number | null) => void }) {
  const dur = Math.max(1, a.durationSec ?? 1);
  const entries = entriesOf(a);
  const go = (e: Entry) => { seek(e.t); setActive(e.marker); };
  if (a.kind !== "video") {
    return <div className="st-panel"><div className="ov-empty small">A still post has no timeline. The changes to make are in Verdict.</div></div>;
  }
  return (
    <div className="st-panel">
      <section className="st-block">
        <h3>Where it happens</h3>
        <div className="sd-strip" aria-label="Frames from your video; choose one to jump there">
          {thumbs.map((f) => (
            <button key={f.t} type="button" className={Math.abs(playT - f.t) < 0.4 ? "is-on" : ""} onClick={() => seek(f.t)} aria-label={`Jump to ${fmtT(f.t)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" />
              <small>{fmtAt(f.t)}</small>
            </button>
          ))}
        </div>
        <div className="sd-track" role="group" aria-label="Moments on the video">
          {a.segments.map((s, i) => <span key={i} className={`sd-seg is-${s.rating}`} style={{ left: `${(s.start / dur) * 100}%`, width: `${((s.end - s.start) / dur) * 100}%` }} title={`${fmtT(s.start)} to ${fmtT(s.end)}: ${s.label}`} />)}
          {entries.map((e, i) => <button key={i} type="button" className={`sd-pin is-${e.tone}`} style={{ left: `${Math.min(100, (e.t / dur) * 100)}%` }} onClick={() => go(e)} aria-label={`${fmtT(e.t)} ${TONE_WORD[e.tone]}: ${e.label}`} />)}
          <i className="sd-head" style={{ left: `${Math.min(100, (playT / dur) * 100)}%` }} aria-hidden />
        </div>
        <ul className="sd-legend" aria-hidden>
          {(Object.keys(TONE_WORD) as Tone[]).map((t) => <li key={t} className={`is-${t}`}><i />{TONE_WORD[t]}</li>)}
        </ul>
      </section>

      <section className="st-block">
        <h3>Moments</h3>
        {entries.length ? (
          <ul className="sd-moments">
            {entries.map((e, i) => (
              <li key={i}>
                <button type="button" className={`is-${e.tone}`} onClick={() => go(e)}>
                  <span className="sd-m-t">{e.end != null ? fmtSpan(e.t, e.end) : fmtAt(e.t)}</span>
                  <span className="sd-m-body"><b>{e.label}</b>{e.detail && <small>{e.detail}</small>}</span>
                  <em>{TONE_WORD[e.tone]}</em>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="sd-note">SOCIA placed nothing at a specific time in this video.</p>}
      </section>

      {a.segments.length > 0 && (
        <section className="st-block">
          <h3>Structure</h3>
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
    </div>
  );
}

// -------------------------------------------------------------- performance ----

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

export function PerformancePanel({ a, onCompare }: { a: StudioAnalysis; onCompare: () => void }) {
  return (
    <div className="st-panel">
      <section className="st-block">
        <div className="st-block-head"><h3>Against your top posts</h3>{a.compare && <button type="button" className="ov-link" onClick={onCompare}>All your posts <ArrowRight size={12} /></button>}</div>
        {a.compare ? (
          <>
            {a.compare.posts && a.compare.posts.length > 0 && <PostRow posts={a.compare.posts} mine />}
            <RefTable head={["This draft", "Your top posts"]} rows={a.compare.rows.map((r) => ({ label: r.label, current: r.current, theirs: r.winners, verdict: r.verdict, refs: r.refs }))} />
            <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.compare.summary}</p></div>
            <p className="sd-note">Compared with {a.compare.basis}. A pattern across {a.compare.sample} posts shows what they share, not what caused their results.</p>
          </>
        ) : <div className="ov-empty small">No synced posts to compare with yet. Connect Instagram and this fills in with your own top posts.</div>}
      </section>

      <section className="st-block">
        <div className="st-block-head"><h3>Against competitors&apos; Reels</h3><Link href="/discover" className="ov-link">Discover <ArrowRight size={12} /></Link></div>
        {a.competitors ? (
          <>
            <PostRow posts={a.competitors.posts} mine={false} />
            <RefTable head={["This draft", "Their Reels"]} rows={a.competitors.rows} />
            {a.competitors.takeaways.length > 0 && (
              <>
                <h4 className="sd-sub">What you could take from them</h4>
                <ul className="st-list">{a.competitors.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
              </>
            )}
            {a.competitors.summary && <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.competitors.summary}</p></div>}
            <p className="sd-note">Compared with {a.competitors.basis}, with the numbers the platforms published. Their results, not a forecast for yours. Take the structure, never the wording.</p>
          </>
        ) : <div className="ov-empty small">No competitor Reels on file for this brand yet. Track a few accounts on Discover, and your next analysis compares this draft with their Reels that took off.</div>}
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

      {a.niche && (
        <section className="st-block">
          <h3>Patterns in your niche</h3>
          <ul className="st-list">{a.niche.patterns.map((p) => <li key={p}>{p}</li>)}</ul>
          <div className="ov-why-block ai"><small>SOCIA&apos;s read</small><p>{a.niche.summary}</p></div>
          <p className="sd-note">Observed among {a.niche.basis}. Patterns, not guarantees.</p>
        </section>
      )}

      <section className="st-block">
        <h3>Platform fit</h3>
        <ul className="st-fit">
          {a.platformFit.map((p) => (
            <li key={p.platform}><b>{p.platform}</b><em className={`ov-chip ${FIT_CLS[p.fit]}`}>{p.fit[0].toUpperCase() + p.fit.slice(1)}</em><p>{p.note}</p></li>
          ))}
        </ul>
        <p className="sd-note">Fit is an editor&apos;s read of length, opening and text against each format. SOCIA does not claim platform ranking rules.</p>
      </section>
    </div>
  );
}

// --------------------------------------------------------------- directions ----

function DirectionCard({ d, inUse, onUse }: { d: Direction; inUse: boolean; onUse: () => void }) {
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
        <CopyBtn text={directionText(d)} label="Copy the brief" />
      </div>
    </li>
  );
}

export function DirectionsPanel({ a, w, apply }: { a: StudioAnalysis; w: Working; apply: (f: ApplyField, v: string) => void }) {
  const dirs = a.directions ?? [];
  return (
    <div className="st-panel">
      {dirs.length > 0 ? (
        <section className="st-block">
          <h3>Three ways to remake it</h3>
          <p className="sd-note">Each is a version to test, with what it costs you. SOCIA can&apos;t know which will do best: it marks the one it would try first and says why.</p>
          <ol className="sd-dirs">
            {dirs.map((d) => <DirectionCard key={d.name} d={d} inUse={w.hook === d.opening} onUse={() => apply("hook", d.opening)} />)}
          </ol>
        </section>
      ) : (
        <div className="ov-empty small">{a.kind === "video" ? "This analysis was made before creative directions existed. Re-analyze to get three ways to remake the video." : "Creative directions are for videos. For a still post, the opening lines below and the Caption tab carry the change."}</div>
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
    </div>
  );
}
