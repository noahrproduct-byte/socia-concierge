"use client";

// Look & sound (Phase C): SOCIA measures the parts of each clip this cut
// uses, then offers Auto Enhance or Match Clips for the picture and Audio
// Cleanup for the sound, each computed from those measurements and capped
// so nothing turns into a filter. Everything is stored in the cut, so it is
// undone with Undo, switched off with Off, and compared with Before/After;
// the clips themselves are never changed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, AudioLines, Check, Loader2, Palette, RefreshCw, Scissors } from "lucide-react";
import { measureCut, type ClipMeasure } from "@/lib/studioClips/measure";
import { ENHANCE_TARGET, gradeClip, lookStats, matchTarget } from "@/lib/studioClips/grade";
import { cutPauses, findPauses, planSound, soundStats, SOUND } from "@/lib/studioClips/sound";
import { withFinish } from "@/lib/studioClips/finish";
import { clipLabel, type BuildSource, type ClipGrade, type Edl, type EdlFinish } from "@/lib/studioClips/types";

type Look = EdlFinish["look"];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const warmWord = (w: number) => (w < -0.02 ? "cool" : w > 0.12 ? "warm" : "neutral");

export default function FinishPanel({
  edl, sources, canEdit, busy, onCommit,
}: {
  edl: Edl;
  sources: Record<string, BuildSource>;
  canEdit: boolean;
  busy: boolean;
  onCommit: (next: Edl) => void;
}) {
  const [measures, setMeasures] = useState<Record<string, ClipMeasure> | null>(null);
  const [phase, setPhase] = useState<"idle" | "measuring" | "ready" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [solving, setSolving] = useState<Look | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const inCut = useMemo(() => Array.from(new Set(edl.segments.map((s) => s.clipId))).filter((id) => sources[id]), [edl.segments, sources]);
  const stale = measures ? inCut.filter((id) => !measures[id]) : [];
  const label = useCallback((id: string) => clipLabel(sources[id]?.position ?? 0), [sources]);
  const finish = edl.finish;
  const look: Look = finish?.look ?? "off";

  const measure = useCallback(async () => {
    abort.current?.abort();
    const ctrl = new AbortController(); abort.current = ctrl;
    setPhase("measuring"); setError(null);
    try {
      const m = await measureCut(edl, sources, (done, total) => setProgress({ done, total }), ctrl.signal);
      if (ctrl.signal.aborted) return;
      setMeasures(m); setPhase("ready");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError((e as Error)?.message ?? "Couldn't measure the clips."); setPhase("error");
    }
  }, [edl, sources]);

  // Measure once when the panel first opens.
  useEffect(() => {
    if (phase === "idle") void measure();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const before = useMemo(() => {
    const out: Record<string, ReturnType<typeof lookStats>> = {};
    for (const [id, m] of Object.entries(measures ?? {})) if (m.pixels) out[id] = lookStats(m.pixels);
    return out;
  }, [measures]);
  const sounds = useMemo(() => Object.fromEntries(Object.entries(measures ?? {}).map(([id, m]) => [id, m.windows ? planSound(m.windows) : null])), [measures]);
  const pauses = useMemo(() => Object.fromEntries(Object.entries(measures ?? {}).map(([id, m]) => [id, m.windows ? findPauses(m.windows) : []])), [measures]);
  const pausePreview = useMemo(() => (measures ? cutPauses(edl, pauses) : null), [edl, pauses, measures]);
  const noise = useMemo(() => Object.entries(measures ?? {}).map(([id, m]) => ({ id, db: m.windows ? soundStats(m.windows).noiseDb : null })).filter((x) => x.db != null) as { id: string; db: number }[], [measures]);

  const setLook = async (next: Look) => {
    if (!measures || next === look) return;
    if (next === "off") { onCommit(withFinish(edl, { look: "off" })); return; }
    setSolving(next);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before the solver runs
    const ids = inCut.filter((id) => measures[id]?.pixels);
    const target = next === "match" ? matchTarget(ids.map((id) => before[id])) : ENHANCE_TARGET;
    const grades: Record<string, ClipGrade> = {};
    for (const id of ids) { const g = gradeClip(measures[id].pixels!, target); if (g) grades[id] = g; }
    setSolving(null);
    onCommit(withFinish(edl, { look: next, grades }));
  };

  const setSound = (on: boolean) => {
    if (!measures) return;
    const chosen = Object.fromEntries(Object.entries(sounds).filter(([id, s]) => s && inCut.includes(id))) as Record<string, NonNullable<(typeof sounds)[string]>>;
    onCommit(withFinish(edl, { sound: on, sounds: on ? chosen : {} }));
  };

  const cutLongPauses = () => {
    if (!pausePreview?.count) return;
    const prev = finish?.pausesCut;
    onCommit(withFinish(pausePreview.edl, { pausesCut: { count: (prev?.count ?? 0) + pausePreview.count, seconds: Number(((prev?.seconds ?? 0) + pausePreview.seconds).toFixed(2)) } }));
  };

  const disabled = !canEdit || busy || phase !== "ready" || solving != null;

  return (
    <div className="cbf">
      <div className="ov-card cbf-status">
        {phase === "measuring" && (
          <>
            <p><Loader2 size={13} className="spin" /> Measuring the parts of your clips this cut uses{progress.total ? ` (${Math.min(progress.done + 1, progress.total)} of ${progress.total})` : ""}…</p>
            <span className="cbb-bar"><i style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} /></span>
          </>
        )}
        {phase === "ready" && (
          <p>
            <Check size={13} /> Measured {Object.keys(measures ?? {}).length} clip{Object.keys(measures ?? {}).length === 1 ? "" : "s"} from the parts this cut uses.
            {stale.length > 0 && <> {stale.map(label).join(", ")} {stale.length === 1 ? "was" : "were"} added since, so {stale.length === 1 ? "it isn't" : "they aren't"} corrected yet.</>}
            <button type="button" className="cp-link cbf-again" disabled={busy} onClick={() => void measure()}><RefreshCw size={11} /> Measure again</button>
          </p>
        )}
        {phase === "error" && <p className="cbb-err"><AlertTriangle size={12} /> {error} <button type="button" className="cp-link" onClick={() => void measure()}>Try again</button></p>}
      </div>

      <section className="ov-card cbf-sec">
        <h4><Palette size={14} /> Look</h4>
        <div className="cal2-seg cbf-seg" role="radiogroup" aria-label="Picture correction">
          {(["off", "enhance", "match"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={look === v} className={look === v ? "on" : ""} disabled={disabled} onClick={() => void setLook(v)}>
              {solving === v ? <Loader2 size={12} className="spin" /> : null} {v === "off" ? "Off" : v === "enhance" ? "Auto enhance" : "Match clips"}
            </button>
          ))}
        </div>
        <p className="cbf-help">
          {look === "match"
            ? "Every clip is brought to the same brightness, white balance and colour, so footage shot in different light reads as one shoot."
            : "Fixes exposure, white balance, near-white highlights, crushed shadows, flat contrast and dull colour, each only as far as the measurements call for and never past gentle limits."}
        </p>
        <ul className="cbf-clips">
          {inCut.map((id) => {
            const m = measures?.[id];
            const g = look !== "off" ? finish?.grades[id] : undefined;
            const b = before[id];
            return (
              <li key={id}>
                {sources[id]?.thumb ? <img src={sources[id].thumb!} alt="" /> : <span className="cb-clip-ph small" />}
                <div>
                  <b>{label(id)}</b>
                  {!m ? <small>Not measured yet.</small>
                    : !m.pixels ? <small className="cbf-warn">{m.note ?? "The picture couldn't be read."}</small>
                    : g ? <small>{g.reasons.join(" ")}</small>
                    : look !== "off" ? <small>Already measures well; left as it is.</small>
                    : b ? <small>Brightness {pct(b.luma)} · {warmWord(b.warmth)} white balance{b.clipHi > 0.03 ? ` · ${pct(b.clipHi)} near white` : ""}</small>
                    : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ov-card cbf-sec">
        <div className="cbf-row">
          <h4><AudioLines size={14} /> Clean up audio</h4>
          <button type="button" className={`cbb-toggle${finish?.sound ? " on" : ""}`} role="switch" aria-checked={Boolean(finish?.sound)} aria-label="Clean up audio" disabled={disabled} onClick={() => setSound(!finish?.sound)}><i /></button>
        </div>
        <p className="cbf-help">Brings every clip to the same loudness (about {SOUND.targetDb} dB), evens out loud moments, lifts quieter words and keeps every measured peak under {SOUND.ceilingDb} dB so nothing distorts.</p>
        <ul className="cbf-clips">
          {inCut.map((id) => {
            const m = measures?.[id];
            const s = finish?.sound ? finish.sounds[id] : sounds[id];
            return (
              <li key={id}>
                <span className="cbf-dot" aria-hidden />
                <div>
                  <b>{label(id)}</b>
                  {!m ? <small>Not measured yet.</small>
                    : !m.windows ? <small>No sound to measure.</small>
                    : s ? <small>{finish?.sound ? "" : "Would do: "}{s.reasons.join(" ")}</small>
                    : <small>Already sits at an even level.</small>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="cbf-pauses">
          <Scissors size={13} />
          {finish?.pausesCut ? <span>{finish.pausesCut.count} long pause{finish.pausesCut.count === 1 ? "" : "s"} cut ({finish.pausesCut.seconds}s). Undo brings {finish.pausesCut.count === 1 ? "it" : "them"} back.</span>
            : pausePreview?.count ? <span>{pausePreview.count} pause{pausePreview.count === 1 ? "" : "s"} over 0.8s of silence ({pausePreview.seconds}s in all).</span>
            : <span>{measures ? "No pauses over 0.8s of silence in this cut." : "Pauses are found when the sound is measured."}</span>}
          {!!pausePreview?.count && <button type="button" className="ov-btn ghost small" disabled={disabled} onClick={cutLongPauses}>Cut {pausePreview.count === 1 ? "it" : "them"}</button>}
        </div>
      </section>

      <section className="ov-card cbf-sec cbf-not">
        <b>Not done automatically</b>
        <ul>
          <li><b>Noise reduction.</b> SOCIA can't remove background noise reliably in the browser, so it doesn't try.{noise.length ? ` Background between words: ${noise.map((n) => (n.db <= -90 ? `${label(n.id)} silent` : `${label(n.id)} ${Math.round(n.db)} dB${n.db > -45 ? " (noticeable: re-record closer to the mic, or with a clip-on mic)" : " (quiet)"}`)).join("; ")}.` : ""}</li>
          <li><b>Lowering background sound under speech.</b> Raw clips carry one mixed track, so there's nothing separate to lower.</li>
          <li><b>Music.</b> SOCIA recommends a direction (Music tab) and never adds a track.</li>
        </ul>
      </section>
    </div>
  );
}
