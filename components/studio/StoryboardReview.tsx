"use client";

// Storyboard first (Umar, 2026-11-25): after SOCIA plans a cut from a prompt or
// a reference, and before the editor opens, the cut is laid out shot by shot:
// the frame it starts on, when it plays, what is said and what is written on
// screen. The person marks each shot Keep, Maybe (with a note on what to
// change) or Drop. Their marks go to the editor's own "tell SOCIA what to
// change" (app/api/studio/builds/[id]/instruct), the result is saved, and then
// the editor opens. With every shot kept, nothing is changed and nothing is asked.
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Dialog } from "@/components/system";
import { timeline } from "@/lib/studioClips/timeline";
import type { BuildPlayerData, Edl } from "@/lib/studioClips/types";
import { storyboardInstruction, type Mark } from "@/lib/studioClips/storyboard";
import "./storyboard.css";

const MARKS: { id: Mark; label: string }[] = [{ id: "keep", label: "Keep" }, { id: "maybe", label: "Maybe" }, { id: "drop", label: "Drop" }];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `initial` shows a cut already in hand (the dev lab's fixture) instead of loading it. */
export default function StoryboardReview({ buildId, title, onDone, onClose, initial = null }: { buildId: string; title: string; onDone: () => void; onClose: () => void; initial?: BuildPlayerData | null }) {
  const [data, setData] = useState<BuildPlayerData | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Mark[]>(() => (initial?.build.edl.segments ?? []).map(() => "keep" as Mark));
  const [notes, setNotes] = useState<string[]>(() => (initial?.build.edl.segments ?? []).map(() => ""));
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let live = true;
    fetch(`/api/studio/builds/${buildId}`)
      .then(async (r) => ({ ok: r.ok, j: (await r.json().catch(() => null)) as (BuildPlayerData & { error?: string }) | null }))
      .then(({ ok, j }) => {
        if (!live) return;
        if (!ok || !j?.build) { setError(j?.error ?? "SOCIA couldn't load the storyboard."); return; }
        setData(j);
        setMarks(j.build.edl.segments.map(() => "keep"));
        setNotes(j.build.edl.segments.map(() => ""));
      })
      .catch(() => { if (live) setError("Couldn't reach SOCIA. Check your connection."); });
    return () => { live = false; };
  }, [buildId, initial]);

  const shots = useMemo(() => {
    if (!data) return [];
    const edl = data.build.edl;
    const by = new Map(data.sources.map((s) => [s.clipId, s]));
    return timeline(edl).segments.map((seg) => {
      const src = by.get(seg.clipId);
      const sec = Math.max(0.1, seg.out - seg.in);
      const said = (src?.words ?? []).filter((w) => w.startMs / 1000 >= seg.in - 0.05 && w.startMs / 1000 < seg.out).map((w) => w.text).join(" ").trim();
      const written = edl.text.filter((t) => t.at < seg.startSec + sec && t.end > seg.startSec).map((t) => t.text);
      return { id: seg.id, from: seg.startSec, to: seg.startSec + sec, label: cap(seg.purpose ?? (seg.role === "opener" ? "hook" : seg.role)), note: seg.note, said, written, video: src?.url ? `${src.url}#t=${Math.max(0, seg.in).toFixed(2)}` : null, thumb: src?.thumb ?? null };
    });
  }, [data]);

  const kept = marks.filter((m) => m !== "drop").length;
  const instruction = storyboardInstruction(marks, notes);

  async function make() {
    if (!data) return;
    if (!instruction) { onDone(); return; }
    setError(null);
    try {
      setBusy("Changing the cut");
      const res = await fetch(`/api/studio/builds/${buildId}/instruct`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction, edl: data.build.edl }) });
      const j = (await res.json().catch(() => null)) as { edl?: Edl; error?: string } | null;
      if (!res.ok || !j?.edl?.segments?.length) { setError(j?.error ?? "SOCIA couldn't make those changes. Open the editor and change it there."); return; }
      setBusy("Saving");
      const save = await fetch(`/api/studio/builds/${buildId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: j.edl }) });
      if (!save.ok) { setError("The changes couldn't be saved. Open the editor and change it there."); return; }
      onDone();
    } catch {
      setError("Couldn't reach SOCIA. Check your connection.");
    } finally { setBusy(null); }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o && !busy) onClose(); }}
      title="Storyboard"
      width={860}
      className="sb"
      description={`${title}. Check each shot before SOCIA makes the video. Nothing is exported until you say so in the editor.`}
      actions={
        <>
          <Button onClick={onDone} disabled={Boolean(busy)}>Skip, open the editor</Button>
          <Button variant="primary" onClick={() => void make()} busy={Boolean(busy)} disabled={!data || Boolean(busy) || kept === 0}>{instruction ? "Apply and open the editor" : "Looks good, open the editor"}</Button>
        </>
      }
    >
      {!data && !error && <p className="sb-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> Laying out the shots.</p>}
      {busy && <p className="sb-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> {busy}.</p>}
      {error && <p className="sb-status is-error" role="alert">{error}</p>}
      {data && (
        <>
          <div className="sb-bar" aria-hidden>
            {shots.map((s, i) => <i key={s.id} className={`is-${marks[i]}`} style={{ flexGrow: Math.max(0.3, s.to - s.from) }}>{i + 1}</i>)}
          </div>
          <p className="sb-sum">{shots.length} shots, {clock(shots[shots.length - 1]?.to ?? 0)} long. {kept === shots.length ? "All kept." : `${kept} kept, ${shots.length - kept} dropped.`}{kept === 0 ? " Keep at least one shot." : ""}</p>
          <ol className="sb-list">
            {shots.map((s, i) => (
              <li key={s.id} className={`is-${marks[i]}`}>
                <span className="sb-frame">
                  {s.video ? <video src={s.video} poster={s.thumb ?? undefined} preload="metadata" muted playsInline aria-hidden /> : s.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumb} alt="" />
                  ) : null}
                  <b>{i + 1}</b>
                </span>
                <span className="sb-body">
                  <span className="sb-head"><b>{s.label}</b><small>{clock(s.from)} to {clock(s.to)}, {(s.to - s.from).toFixed(1)} s</small></span>
                  {s.said && <q>{s.said}</q>}
                  {s.written.map((t) => <span key={t} className="sb-text">On screen: {t}</span>)}
                  {s.note && <small className="sb-note">{s.note}</small>}
                  <span className="sb-marks" role="radiogroup" aria-label={`Shot ${i + 1}`}>
                    {MARKS.map((m) => (
                      <button key={m.id} type="button" role="radio" aria-checked={marks[i] === m.id} className={marks[i] === m.id ? `on is-${m.id}` : undefined} disabled={Boolean(busy)} onClick={() => setMarks((x) => x.map((v, k) => (k === i ? m.id : v)))}>{m.label}</button>
                    ))}
                  </span>
                  {marks[i] === "maybe" && (
                    <input className="sb-input" type="text" maxLength={110} placeholder="What should change? Shorter, a different line, no text" aria-label={`What should change in shot ${i + 1}`} value={notes[i] ?? ""} disabled={Boolean(busy)} onChange={(e) => setNotes((x) => x.map((v, k) => (k === i ? e.target.value : v)))} />
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Dialog>
  );
}
