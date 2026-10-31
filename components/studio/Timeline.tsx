"use client";

// The editor's multi-track timeline (Editor V2): video cuts, text lines and
// captions on one time scale under the player, with the playhead. Click to
// move the playhead; drag a text line to move it, or its ends to change
// when it shows; with the keyboard, arrows move a focused line by 0.1 s and
// Shift+arrows stretch its end. A drag is one undo step.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import { moveSpan, resizeSpan, rulerTicks, type Tracks } from "@/lib/studioClips/tracks";

type Drag = { index: number; mode: "move" | "start" | "end"; x0: number; at0: number; end0: number };

export default function Timeline({ tracks, fps, player, canEdit, onTextStart, onTextLive }: {
  tracks: Tracks;
  fps: number;
  player: RefObject<PlayerRef | null>;
  canEdit: boolean;
  /** Called once when a drag or key change begins (pushes one undo step). */
  onTextStart: () => void;
  /** The line's new times while it moves. */
  onTextLive: (index: number, at: number, end: number) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const drag = useRef<Drag | null>(null);
  const d = Math.max(0.1, tracks.duration);
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), d) / d) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, b - a) / d) * 100}%`;

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setNow(e.detail.frame / fps);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [player, fps]);

  const secAt = (clientX: number) => {
    const r = area.current?.getBoundingClientRect();
    return r && r.width ? ((clientX - r.left) / r.width) * d : 0;
  };
  const seek = (clientX: number) => {
    const t = Math.min(Math.max(0, secAt(clientX)), d);
    player.current?.seekTo(Math.round(t * fps));
    setNow(t);
  };

  const startDrag = (e: PointerEvent, index: number, mode: Drag["mode"]) => {
    if (!canEdit) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t = tracks.text[index];
    drag.current = { index, mode, x0: e.clientX, at0: t.start, end0: t.end };
    onTextStart();
  };
  const onMove = (e: PointerEvent) => {
    const g = drag.current;
    const r = area.current?.getBoundingClientRect();
    if (!g || !r) return;
    const delta = ((e.clientX - g.x0) / r.width) * d;
    const next = g.mode === "move" ? moveSpan(g.at0, g.end0, delta, d) : resizeSpan(g.at0, g.end0, g.mode, delta, d);
    onTextLive(g.index, next.at, next.end);
  };
  const endDrag = () => { drag.current = null; };

  const onKey = (e: KeyboardEvent, index: number) => {
    if (!canEdit || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const t = tracks.text[index];
    const delta = e.key === "ArrowLeft" ? -0.1 : 0.1;
    onTextStart();
    const next = e.shiftKey ? resizeSpan(t.start, t.end, "end", delta, d) : moveSpan(t.start, t.end, delta, d);
    onTextLive(index, next.at, next.end);
  };

  return (
    <div className="cbb-tl" aria-label="Timeline">
      <div className="cbb-tl-labels" aria-hidden>
        <span />
        <span>Video</span>
        <span>Text</span>
        {tracks.captions.length > 0 && <span>Captions</span>}
      </div>
      <div className="cbb-tl-area" ref={area} onPointerDown={(e) => seek(e.clientX)} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className="cbb-tl-ruler">
          {rulerTicks(d).map((t) => <span key={t} style={{ left: pct(t) }}>{t}s</span>)}
        </div>
        <div className="cbb-tl-track">
          {tracks.video.map((v) => (
            <span key={v.index} className={`cbb-tl-clip${v.index % 2 ? " alt" : ""}`} style={{ left: pct(v.start), width: width(v.start, v.end) }} title={`${v.label}, ${v.start.toFixed(1)}s to ${v.end.toFixed(1)}s`}>{v.label}</span>
          ))}
        </div>
        <div className="cbb-tl-track">
          {tracks.text.map((t) => (
            <span
              key={t.index}
              className="cbb-tl-text"
              style={{ left: pct(t.start), width: width(t.start, t.end) }}
              role="slider"
              tabIndex={canEdit ? 0 : -1}
              aria-label={`Text line: ${t.label}`}
              aria-valuemin={0}
              aria-valuemax={Math.round(d * 10) / 10}
              aria-valuenow={t.start}
              aria-valuetext={`${t.start.toFixed(1)} to ${t.end.toFixed(1)} seconds`}
              onPointerDown={(e) => startDrag(e, t.index, "move")}
              onKeyDown={(e) => onKey(e, t.index)}
            >
              <i className="cbb-tl-edge start" onPointerDown={(e) => startDrag(e, t.index, "start")} aria-hidden />
              <em>{t.label}</em>
              <i className="cbb-tl-edge end" onPointerDown={(e) => startDrag(e, t.index, "end")} aria-hidden />
            </span>
          ))}
        </div>
        {tracks.captions.length > 0 && (
          <div className="cbb-tl-track">
            {tracks.captions.map((c, i) => <span key={i} className="cbb-tl-cap" style={{ left: pct(c.start), width: width(c.start, c.end) }} />)}
          </div>
        )}
        <span className="cbb-tl-head" style={{ left: pct(now) }} aria-hidden />
      </div>
    </div>
  );
}
