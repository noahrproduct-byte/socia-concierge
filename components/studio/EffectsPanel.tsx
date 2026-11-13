"use client";

// The Effects tab: what moves inside the selected cut (the slow zoom, the
// handheld shake, the speed, the punch-ins on key words), stabilization on
// the server, and the look over the whole video (contrast, colour, grain,
// vignette, bars) as changes on the theme. Every control writes plain EDL
// data (lib/studioClips/motion.ts, lib/studioClips/themes), so the preview
// shows it at once and the export draws the same thing.
import { useEffect, useRef, useState } from "react";
import { Loader2, Move } from "lucide-react";
import { STABILIZE_STRENGTHS, clipLabel, fmtClock, type BuildSource, type Edl, type SegmentMotion, type StabilizeStrength } from "@/lib/studioClips/types";
import type { Theme } from "@/lib/studioClips/themes";
import { SPEED_MAX, SPEED_MIN } from "@/lib/studioClips/motion";

type GradeKey = keyof Theme["color"]["grade"];
const GRADE_ROWS: { key: GradeKey; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: "contrast", label: "Contrast", min: 0.8, max: 1.4, step: 0.01 },
  { key: "saturation", label: "Colour", min: 0, max: 1.5, step: 0.01 },
  { key: "warmth", label: "Warmth", min: -1, max: 1, step: 0.01 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.01 },
  { key: "grain", label: "Grain", min: 0, max: 1, step: 0.01 },
  { key: "chroma", label: "Chroma split", min: 0, max: 12, step: 0.5, unit: "px" },
  { key: "scanlines", label: "Scanlines", min: 0, max: 1, step: 0.01 },
  { key: "letterbox", label: "Bars", min: 0, max: 0.2, step: 0.005 },
];

type StabJob = { status: "working" | "done" | "failed"; progress?: number; error?: string | null; urls?: Partial<Record<StabilizeStrength, string>> };

export default function EffectsPanel({ edl, sources, theme, index, canEdit, busy, fixture, onSelect, onMotion, onStabilize, onLook, onSources }: {
  edl: Edl;
  sources: Record<string, BuildSource>;
  theme: Theme | null;
  /** the cut the controls are for (the selected one, or the one under the playhead) */
  index: number;
  canEdit: boolean;
  busy: boolean;
  /** the lab: no server to stabilize on */
  fixture: boolean;
  onSelect: (i: number) => void;
  onMotion: (i: number, patch: Partial<SegmentMotion> | null) => void;
  onStabilize: (i: number, strength: StabilizeStrength | null) => void;
  onLook: (grade: Partial<Theme["color"]["grade"]>) => void;
  /** stabilized copies that are ready, by clip id */
  onSources: (patch: Record<string, Partial<Record<StabilizeStrength, string>>>) => void;
}) {
  const cur = edl.segments[index];
  const src = cur ? sources[cur.clipId] : undefined;
  const locked = !canEdit || busy;
  const m = cur?.motion ?? {};
  const zoom = m.zoom ?? { from: 1, to: 1, x: 0.5, y: 0.5, ease: "inOut" as const };
  const kind = !m.zoom || (m.zoom.from === 1 && m.zoom.to === 1) ? "none" : m.zoom.to > m.zoom.from ? "in" : "out";
  const setZoom = (patch: Partial<typeof zoom>) => { if (!cur) return; onMotion(index, { zoom: { ...zoom, ...patch } }); };
  const setKind = (k: "none" | "in" | "out") => {
    if (!cur) return;
    if (k === "none") { onMotion(index, { zoom: undefined }); return; }
    const far = Math.max(zoom.from, zoom.to, 1.08);
    setZoom(k === "in" ? { from: 1, to: far } : { from: far, to: 1 });
  };
  // Punch-ins on the key words: the words said in this cut that the captions highlight.
  const keyTimes = (() => {
    if (!cur || !src?.words || !edl.emphasis?.length) return [] as number[];
    const marked = new Set(edl.emphasis);
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");
    return src.words.filter((w) => marked.has(norm(w.text)) && w.startMs / 1000 >= cur.in && w.startMs / 1000 <= cur.out).map((w) => Math.round(w.startMs / 10) / 100);
  })();
  const punchOn = Boolean(m.punch?.at.length);

  // Stabilization: a server job per clip and strength (lib/studioClips/stabilize.ts); polled until it is done.
  const [jobs, setJobs] = useState<Record<string, StabJob>>({});
  const polls = useRef<Record<string, number>>({});
  useEffect(() => { const p = polls.current; return () => { for (const t of Object.values(p)) window.clearTimeout(t); }; }, []);
  const strength = cur?.stabilize?.strength ?? null;
  const ready = Boolean(cur && strength && src?.stable?.[strength]);
  const jobKey = cur ? `${cur.clipId}:${strength ?? ""}` : "";
  const job = jobs[jobKey];
  const poll = (clipId: string, st: StabilizeStrength) => {
    const key = `${clipId}:${st}`;
    polls.current[key] = window.setTimeout(async () => {
      const res = await fetch(`/api/studio/clips/${clipId}/stabilize?strength=${st}`).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as StabJob | null) : null;
      if (!j) { setJobs((cur) => ({ ...cur, [key]: { status: "failed", error: "SOCIA couldn't be reached. Check your connection and try again." } })); return; }
      setJobs((cur) => ({ ...cur, [key]: j }));
      if (j.status === "done" && j.urls) onSources({ [clipId]: j.urls });
      else if (j.status === "working") poll(clipId, st);
    }, 2500);
  };
  const start = async (st: StabilizeStrength) => {
    if (!cur) return;
    onStabilize(index, st);
    if (fixture) { setJobs((c) => ({ ...c, [`${cur.clipId}:${st}`]: { status: "failed", error: "The lab has no server to stabilize on; the real editor makes the stabilized copy on SOCIA's server." } })); return; }
    if (src?.stable?.[st]) return;
    const key = `${cur.clipId}:${st}`;
    setJobs((c) => ({ ...c, [key]: { status: "working", progress: 0 } }));
    const res = await fetch(`/api/studio/clips/${cur.clipId}/stabilize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strength: st }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as (StabJob & { error?: string }) | null) : null;
    if (!res?.ok) { setJobs((c) => ({ ...c, [key]: { status: "failed", error: j?.error ?? (res ? "Couldn't start stabilizing this clip." : "SOCIA couldn't be reached. Check your connection and try again.") } })); return; }
    if (j?.status === "done" && j.urls) { setJobs((c) => ({ ...c, [key]: j })); onSources({ [cur.clipId]: j.urls }); return; }
    poll(cur.clipId, st);
  };
  const grade = theme?.color.grade;

  return (
    <div className="sd-fx">
      <ol className="sd-cutlist" aria-label="Cuts">
        {edl.segments.map((s2, i) => {
          const src2 = sources[s2.clipId];
          return (
            <li key={s2.id} className={i === index ? "is-on" : ""}>
              <button type="button" className="sd-cutlist-btn" aria-current={i === index ? "true" : undefined} onClick={() => onSelect(i)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL */}
                {src2?.thumb ? <img src={src2.thumb} alt="" /> : <span className="sd-ph" />}
                <span><b>{src2 ? clipLabel(src2.position) : "Expired clip"}</b><small>{(s2.out - s2.in).toFixed(1)}s{s2.motion?.zoom ? " · zoom" : ""}{s2.motion?.shake ? " · shake" : ""}{s2.motion?.speed ? ` · ${s2.motion.speed.rate}x` : ""}{s2.stabilize ? " · steady" : ""}</small></span>
              </button>
            </li>
          );
        })}
      </ol>
      {cur && (
        <section className="ov-card sd-inspector" aria-label={`Effects on cut ${index + 1}`}>
          <div className="sd-inspector-head">
            <div><b><Move size={14} aria-hidden /> Cut {index + 1} <small>{src ? clipLabel(src.position) : "Expired clip"}, {fmtClock(cur.in)} to {fmtClock(cur.out)}</small></b>
              <span className="sd-times">{m.locked ? "Set by hand: a theme switch leaves it." : theme ? `From ${theme.name}; change anything and it stays through theme switches.` : "Nothing moving yet."}</span></div>
            <button type="button" className="ov-btn ghost small" disabled={locked || !cur.motion} onClick={() => onMotion(index, null)}>Back to the theme&apos;s</button>
          </div>
          <div className="cal2-seg" role="radiogroup" aria-label="Slow zoom">
            {([["none", "No zoom"], ["in", "Zoom in"], ["out", "Zoom out"]] as const).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={kind === id} className={kind === id ? "on" : ""} disabled={locked} onClick={() => setKind(id)}>{label}</button>)}
          </div>
          {kind !== "none" && (
            <>
              <label className="sd-fx-row"><span>Start scale</span><input type="range" min={1} max={1.6} step={0.01} value={zoom.from} disabled={locked} onChange={(e) => setZoom({ from: Number(e.target.value) })} /><em>{zoom.from.toFixed(2)}x</em></label>
              <label className="sd-fx-row"><span>End scale</span><input type="range" min={1} max={1.6} step={0.01} value={zoom.to} disabled={locked} onChange={(e) => setZoom({ to: Number(e.target.value) })} /><em>{zoom.to.toFixed(2)}x</em></label>
              <label className="sd-fx-row"><span>Focus left to right</span><input type="range" min={0} max={1} step={0.01} value={zoom.x} disabled={locked} onChange={(e) => setZoom({ x: Number(e.target.value) })} /><em>{Math.round(zoom.x * 100)}%</em></label>
              <label className="sd-fx-row"><span>Focus top to bottom</span><input type="range" min={0} max={1} step={0.01} value={zoom.y} disabled={locked} onChange={(e) => setZoom({ y: Number(e.target.value) })} /><em>{Math.round(zoom.y * 100)}%</em></label>
              <label className="sd-fx-row"><span>Easing</span><select value={zoom.ease} disabled={locked} onChange={(e) => setZoom({ ease: e.target.value as typeof zoom.ease })}><option value="inOut">Ease in and out</option><option value="out">Ease out</option><option value="linear">Straight</option></select><em /></label>
            </>
          )}
          <label className="sd-fx-row"><span>Handheld shake</span><input type="range" min={0} max={1} step={0.01} value={m.shake ?? 0} disabled={locked} onChange={(e) => onMotion(index, { shake: Number(e.target.value) || undefined })} /><em>{Math.round((m.shake ?? 0) * 100)}%</em></label>
          <label className="sd-fx-row"><span>Speed</span><input type="range" min={SPEED_MIN} max={SPEED_MAX} step={0.05} value={m.speed?.rate ?? 1} disabled={locked} onChange={(e) => { const rate = Number(e.target.value); onMotion(index, { speed: rate === 1 ? undefined : { rate, rampSec: m.speed?.rampSec ?? 0.4 } }); }} /><em>{(m.speed?.rate ?? 1).toFixed(2)}x</em></label>
          {m.speed && <label className="sd-fx-row"><span>Ramp in and out</span><input type="range" min={0} max={1.5} step={0.05} value={m.speed.rampSec} disabled={locked} onChange={(e) => onMotion(index, { speed: { rate: m.speed!.rate, rampSec: Number(e.target.value) } })} /><em>{m.speed.rampSec.toFixed(2)}s</em></label>}
          <div className="sd-field">
            <span>Punch in on key words</span>
            <div className="sd-fx-stab">
              <button type="button" className={`cbb-toggle${punchOn ? " on" : ""}`} role="switch" aria-checked={punchOn} aria-label="Punch in on key words" disabled={locked || (!punchOn && !keyTimes.length)} onClick={() => onMotion(index, { punch: punchOn ? undefined : { at: keyTimes, amount: m.punch?.amount ?? theme?.motion.punchIn ?? 0.1 } })}><i /></button>
              <small className="sd-fx-note">{keyTimes.length ? `${keyTimes.length} highlighted word${keyTimes.length === 1 ? "" : "s"} in this cut (Captions tab).` : "Highlight the key words in Captions first; the picture steps in on each one."}</small>
            </div>
            {punchOn && <label className="sd-fx-row"><span>How far in</span><input type="range" min={0.02} max={0.3} step={0.01} value={m.punch!.amount} disabled={locked} onChange={(e) => onMotion(index, { punch: { at: m.punch!.at, amount: Number(e.target.value) } })} /><em>{Math.round(m.punch!.amount * 100)}%</em></label>}
          </div>
          <div className="sd-field">
            <span>Stabilize</span>
            <div className="sd-fx-stab">
              <div className="cal2-seg" role="radiogroup" aria-label="Stabilization">
                <button type="button" role="radio" aria-checked={!strength} className={!strength ? "on" : ""} disabled={locked} onClick={() => onStabilize(index, null)}>Off</button>
                {STABILIZE_STRENGTHS.map((st) => <button key={st} type="button" role="radio" aria-checked={strength === st} className={strength === st ? "on" : ""} disabled={locked} onClick={() => void start(st)}>{st[0].toUpperCase() + st.slice(1)}</button>)}
              </div>
              {strength && (ready ? <small className="sd-fx-note">Steady copy ready: the preview and the export play it.</small>
                : job?.status === "working" ? <small className="sd-fx-note"><Loader2 size={11} className="spin" aria-hidden /> Stabilizing on SOCIA&apos;s server{typeof job.progress === "number" ? `, ${Math.round(job.progress * 100)}%` : ""}. This takes about as long as the clip, twice.</small>
                : job?.status === "failed" ? <small className="sd-fx-note" role="alert">{job.error ?? "Couldn't stabilize this clip."} <button type="button" className="sd-check-go" onClick={() => void start(strength)}>Try again</button></small>
                : <small className="sd-fx-note">Starting.</small>)}
            </div>
            <small className="sd-fx-note">Two passes of ffmpeg&apos;s vidstab on the clip; the picture is zoomed a little to hide the edges. Until the copy is ready the cut plays as shot.</small>
          </div>
        </section>
      )}
      <section className="ov-card" aria-label="Look">
        <b>Look on the whole video</b>
        {grade ? (
          <>
            {GRADE_ROWS.map((r) => (
              <label key={r.key} className="sd-fx-row"><span>{r.label}</span><input type="range" min={r.min} max={r.max} step={r.step} value={grade[r.key]} disabled={locked} onChange={(e) => onLook({ [r.key]: Number(e.target.value) })} /><em>{r.key === "letterbox" ? `${Math.round(grade[r.key] * 100)}%` : r.key === "warmth" ? (grade[r.key] > 0 ? "warm" : grade[r.key] < 0 ? "cool" : "neutral") : `${grade[r.key]}${r.unit ?? ""}`}</em></label>
            ))}
            <small className="sd-fx-note">Changes here sit on top of {theme?.name}; Reset to theme (Themes tab) takes them back. Measured corrections per clip (exposure, white balance) are in Adjust.</small>
          </>
        ) : <small className="sd-fx-note">Pick a theme in Themes to get a look to adjust; the measured per-clip corrections are in Adjust.</small>}
      </section>
    </div>
  );
}
