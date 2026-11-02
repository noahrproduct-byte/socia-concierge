"use client";

// The editor's timeline: video cuts, text lines and captions on one time
// scale under the player, with a toolbar and the playhead. It works like a
// video editor's:
// - press anywhere on the ruler or an empty track and drag to scrub;
// - drag a cut's edges to trim it, drag its body to move it to another place;
// - drag a text line, or its ends, to time it (it snaps to cuts and the playhead);
// - click a cut or a line to select it (Delete removes it);
// - zoom in to work on short moments; while zoomed the view follows the playhead.
// Every drag is one undo step. Keyboard shortcuts live in ClipBuilder; on a
// focused text line, arrows move it by 0.1 s and Shift+arrows stretch its end.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import { Pause, Play, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { dropIndex, dropMarker, fmtTenths, moveSpan, resizeSpan, rulerTicks, snapTo, type Tracks } from "@/lib/studioClips/tracks";

export type TimelineSelection = { kind: "cut" | "text"; index: number } | null;

type Drag =
  | { kind: "scrub" }
  | { kind: "text"; index: number; mode: "move" | "start" | "end"; x0: number; at0: number; end0: number; pps: number }
  | { kind: "trim"; index: number; edge: "in" | "out"; x0: number; pps: number }
  | { kind: "cut"; index: number; x0: number; moved: boolean };

const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];

/**
 * Whether a key pressed on `target` is the editor's to handle: never while
 * typing in a field; Space not on a button, link or tab (that presses it);
 * arrows not on a focused text line (it moves the line).
 */
export function editorKey(target: EventTarget | null, key: string): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return true;
  if (el.closest("input, textarea, select, [contenteditable='true'], [role='dialog'] [role='combobox']")) return false;
  if (key === " " && el.closest("button, a, [role='tab'], [role='switch']")) return false;
  if ((key === "ArrowLeft" || key === "ArrowRight") && el.closest("[role='slider']")) return false;
  return true;
}
/** How close (in pixels) a dragged text edge must come to a boundary to snap onto it. */
const SNAP_PX = 8;

export default function Timeline({
  tracks, fps, player, canEdit, selected, onSelect,
  onTextStart, onTextLive, onCutStart, onCutTrimLive, onCutMove,
  onSplit, onDelete, onUndo, onRedo, canUndo, canRedo, note,
}: {
  tracks: Tracks;
  fps: number;
  player: RefObject<PlayerRef | null>;
  canEdit: boolean;
  selected: TimelineSelection;
  onSelect: (s: TimelineSelection) => void;
  /** Called once when a text drag or key change begins (pushes one undo step). */
  onTextStart: () => void;
  /** The line's new times while it moves. */
  onTextLive: (index: number, at: number, end: number) => void;
  /** Called once when a trim drag begins (pushes one undo step). */
  onCutStart: () => void;
  /** A cut's edge dragged by `delta` output seconds from where the drag began. */
  onCutTrimLive: (index: number, edge: "in" | "out", delta: number) => void;
  /** A cut dropped at a new place (one undo step). */
  onCutMove: (from: number, to: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** A short message from the last action that couldn't be done (a split too close to an edge). */
  note?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [ghost, setGhost] = useState<{ index: number; dx: number; to: number } | null>(null);
  // The track's width in pixels, so ruler labels are spaced for the screen and the zoom.
  const [areaW, setAreaW] = useState(0);
  const drag = useRef<Drag | null>(null);
  const d = Math.max(0.1, tracks.duration);
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), d) / d) * 100}%`;
  const width = (a: number, b: number) => `${(Math.max(0, b - a) / d) * 100}%`;
  const pps = () => (area.current?.getBoundingClientRect().width ?? 0) / d;

  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setAreaW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      const t = e.detail.frame / fps;
      setNow(t);
      // Zoomed in and playing: keep the playhead in view.
      const sc = scroller.current, ar = area.current;
      if (!sc || !ar || sc.scrollWidth <= sc.clientWidth) return;
      const x = (t / d) * ar.scrollWidth;
      if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 24) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.2);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  }, [player, fps, d]);

  const secAt = (clientX: number) => {
    const r = area.current?.getBoundingClientRect();
    return r && r.width ? Math.min(Math.max(0, ((clientX - r.left) / r.width) * d), d) : 0;
  };
  const seek = (clientX: number) => {
    const t = secAt(clientX);
    player.current?.seekTo(Math.min(Math.round(t * fps), Math.max(0, Math.round(d * fps) - 1)));
    setNow(t);
  };

  // ---- pointer -----------------------------------------------------------
  const capture = (e: PointerEvent) => { try { area.current?.setPointerCapture(e.pointerId); } catch { /* not capturable */ } };

  const onAreaDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    capture(e);
    drag.current = { kind: "scrub" };
    onSelect(null);
    seek(e.clientX);
  };
  const startText = (e: PointerEvent, index: number, mode: "move" | "start" | "end") => {
    e.stopPropagation();
    onSelect({ kind: "text", index });
    if (!canEdit) return;
    capture(e);
    const t = tracks.text[index];
    drag.current = { kind: "text", index, mode, x0: e.clientX, at0: t.start, end0: t.end, pps: pps() };
    onTextStart();
  };
  const startTrim = (e: PointerEvent, index: number, edge: "in" | "out") => {
    e.stopPropagation();
    onSelect({ kind: "cut", index });
    if (!canEdit) return;
    capture(e);
    drag.current = { kind: "trim", index, edge, x0: e.clientX, pps: pps() };
    onCutStart();
  };
  const startCut = (e: PointerEvent, index: number) => {
    e.stopPropagation();
    onSelect({ kind: "cut", index });
    capture(e);
    drag.current = { kind: "cut", index, x0: e.clientX, moved: false };
    seek(e.clientX);
  };

  const onMove = (e: PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    if (g.kind === "scrub") return seek(e.clientX);
    if (g.kind === "trim") {
      // Measured against the scale when the drag began: the track resizes as the cut does.
      onCutTrimLive(g.index, g.edge, (e.clientX - g.x0) / Math.max(1, g.pps));
      return;
    }
    if (g.kind === "text") {
      const delta = (e.clientX - g.x0) / Math.max(1, g.pps);
      const targets = [0, d, now, ...tracks.video.map((v) => v.end)];
      const tol = SNAP_PX / Math.max(1, g.pps);
      if (g.mode === "move") {
        const next = moveSpan(g.at0, g.end0, delta, d);
        const len = next.end - next.at;
        const atSnap = snapTo(next.at, targets, tol), endSnap = snapTo(next.end, targets, tol);
        const at = atSnap !== next.at ? atSnap : endSnap !== next.end ? endSnap - len : next.at;
        const moved = moveSpan(at, at + len, 0, d);
        onTextLive(g.index, moved.at, moved.end);
      } else {
        const next = resizeSpan(g.at0, g.end0, g.mode, delta, d);
        const snapped = g.mode === "start" ? resizeSpan(snapTo(next.at, targets, tol), next.end, "start", 0, d) : resizeSpan(next.at, snapTo(next.end, targets, tol), "end", 0, d);
        onTextLive(g.index, snapped.at, snapped.end);
      }
      return;
    }
    // Moving a cut: only once the pointer has really moved, so a click stays a click.
    const dx = e.clientX - g.x0;
    if (!g.moved && Math.abs(dx) < 4) return;
    if (!canEdit || tracks.video.length < 2) return;
    g.moved = true;
    setGhost({ index: g.index, dx, to: dropIndex(tracks.video, secAt(e.clientX), g.index) });
  };
  const onUp = () => {
    const g = drag.current;
    drag.current = null;
    if (g?.kind === "cut" && g.moved && ghost && ghost.to !== g.index) onCutMove(g.index, ghost.to);
    setGhost(null);
  };

  const onTextKey = (e: KeyboardEvent, index: number) => {
    if (!canEdit || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const t = tracks.text[index];
    const delta = e.key === "ArrowLeft" ? -0.1 : 0.1;
    onTextStart();
    const next = e.shiftKey ? resizeSpan(t.start, t.end, "end", delta, d) : moveSpan(t.start, t.end, delta, d);
    onTextLive(index, next.at, next.end);
  };

  const zoomBy = (dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + dir))]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !editorKey(e.target, e.key)) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const isSel = (kind: "cut" | "text", i: number) => selected?.kind === kind && selected.index === i;

  return (
    <div className="cbb-tl-wrap">
      <div className="cbb-tl-bar" role="toolbar" aria-label="Timeline tools">
        <button type="button" className="cbb-tl-btn" onClick={() => player.current?.toggle()} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause (Space)" : "Play (Space)"}>
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <span className="cbb-tl-time" aria-live="off">{fmtTenths(now)} <span>/ {fmtTenths(d)}</span></span>
        <span className="cbb-tl-sep" aria-hidden />
        <button type="button" className="cbb-tl-btn" onClick={onSplit} disabled={!canEdit} title="Split at the playhead (S)">
          <Scissors size={14} aria-hidden /> <span>Split</span>
        </button>
        <button type="button" className="cbb-tl-btn" onClick={onDelete} disabled={!canEdit || !selected} title="Delete the selected cut or line (Delete)">
          <Trash2 size={14} aria-hidden /> <span>Delete</span>
        </button>
        <button type="button" className="cbb-tl-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Cmd or Ctrl+Z)"><Undo2 size={14} aria-hidden /></button>
        <button type="button" className="cbb-tl-btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Shift+Cmd or Ctrl+Z)"><Redo2 size={14} aria-hidden /></button>
        <span className="cbb-tl-note" role="status">{note}</span>
        <button type="button" className="cbb-tl-btn" onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out" title="Zoom out (-)"><ZoomOut size={14} aria-hidden /></button>
        <button type="button" className="cbb-tl-btn" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" title="Zoom in (+)"><ZoomIn size={14} aria-hidden /></button>
      </div>
      <div className="cbb-tl" aria-label="Timeline" data-zoom={zoom}>
        <div className="cbb-tl-labels" aria-hidden>
          <span />
          <span>Video</span>
          <span>Text</span>
          {tracks.captions.length > 0 && <span>Captions</span>}
        </div>
        <div className="cbb-tl-scroll" ref={scroller}>
          <div
            className="cbb-tl-area"
            ref={area}
            style={{ width: `${zoom * 100}%` }}
            onPointerDown={onAreaDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className="cbb-tl-ruler">
              {rulerTicks(d, areaW ? areaW / d : undefined).map((t) => <span key={t} style={{ left: pct(t) }}>{t}s</span>)}
            </div>
            <div className="cbb-tl-track">
              {tracks.video.map((v) => (
                <span
                  key={v.index}
                  className={`cbb-tl-clip${v.index % 2 ? " alt" : ""}${isSel("cut", v.index) ? " on" : ""}${ghost?.index === v.index ? " lifted" : ""}`}
                  style={{ left: pct(v.start), width: width(v.start, v.end), transform: ghost?.index === v.index ? `translateX(${ghost.dx}px)` : undefined }}
                  title={`${v.label}, ${v.start.toFixed(1)}s to ${v.end.toFixed(1)}s. Drag the edges to trim, drag the middle to move.`}
                  onPointerDown={(e) => startCut(e, v.index)}
                >
                  {canEdit && <i className="cbb-tl-cut-edge start" onPointerDown={(e) => startTrim(e, v.index, "in")} aria-hidden />}
                  <em>{v.label}</em>
                  {canEdit && <i className="cbb-tl-cut-edge end" onPointerDown={(e) => startTrim(e, v.index, "out")} aria-hidden />}
                </span>
              ))}
              {ghost && <span className="cbb-tl-drop" style={{ left: pct(dropMarker(tracks.video, ghost.index, ghost.to)) }} aria-hidden />}
            </div>
            <div className="cbb-tl-track">
              {tracks.text.map((t) => (
                <span
                  key={t.index}
                  className={`cbb-tl-text${isSel("text", t.index) ? " on" : ""}`}
                  style={{ left: pct(t.start), width: width(t.start, t.end) }}
                  role="slider"
                  tabIndex={canEdit ? 0 : -1}
                  aria-label={`Text line: ${t.label}`}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(d * 10) / 10}
                  aria-valuenow={t.start}
                  aria-valuetext={`${t.start.toFixed(1)} to ${t.end.toFixed(1)} seconds`}
                  onPointerDown={(e) => startText(e, t.index, "move")}
                  onKeyDown={(e) => onTextKey(e, t.index)}
                  onFocus={() => onSelect({ kind: "text", index: t.index })}
                >
                  <i className="cbb-tl-edge start" onPointerDown={(e) => startText(e, t.index, "start")} aria-hidden />
                  <em>{t.label}</em>
                  <i className="cbb-tl-edge end" onPointerDown={(e) => startText(e, t.index, "end")} aria-hidden />
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
      </div>
      <p className="cbb-tl-keys">Space plays, S splits at the playhead, Delete removes what&apos;s selected, arrows step a frame (Shift: a second), + and - zoom.</p>
    </div>
  );
}
