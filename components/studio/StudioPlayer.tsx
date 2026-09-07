"use client";

// The content is the centre of the workspace: a large vertical player with
// real controls, SOCIA's structure and markers drawn on the timeline, and the
// sampled frames as a strip (one can be chosen as the cover). Images render
// in the same frame without the video chrome.

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { fmtT, type Marker, type Segment, type StudioKind } from "@/lib/studio";

export type SeekRequest = { t: number; n: number } | null;

const RATING_CLS: Record<Segment["rating"], string> = { weak: "weak", needs: "needs", good: "good", strong: "strong" };

export default function StudioPlayer({ url, kind, images, thumbs, markers, segments, seek, onTime, onDuration, cover, onCover, activeMarker, videoRef }: {
  url: string | null; kind: StudioKind; images: string[]; thumbs: { src: string; t: number }[]; markers: Marker[]; segments: Segment[];
  seek: SeekRequest; onTime: (t: number) => void; onDuration: (d: number) => void; cover: number | null; onCover: (i: number | null) => void; activeMarker: number | null;
  /** The parent samples frames from this same element. */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (videoRef) videoRef.current = video.current; });
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [slide, setSlide] = useState(0);

  useEffect(() => { if (seek && video.current) { video.current.currentTime = Math.max(0, Math.min(seek.t, dur || seek.t)); setT(video.current.currentTime); } }, [seek, dur]);
  useEffect(() => { setPlaying(false); setT(0); setDur(0); setSlide(0); }, [url]);

  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play().catch(() => null); } else v.pause(); };
  const step = (d: number) => { const v = video.current; if (!v) return; v.pause(); v.currentTime = Math.max(0, Math.min(dur, v.currentTime + d)); };

  if (!url) return null;
  if (kind !== "video") {
    return (
      <div className="stp">
        <div className="stp-stage image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[slide] ?? url} alt="" />
          {kind === "carousel" && images.length > 1 && (
            <div className="stp-slides">
              {images.map((_, i) => <button key={i} type="button" className={i === slide ? "on" : ""} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)} />)}
            </div>
          )}
        </div>
        <p className="stp-note">{kind === "carousel" ? `${images.length} slides · SOCIA analysed each one` : "Single image · analysed as the first (and only) frame"}</p>
      </div>
    );
  }
  const pct = dur ? (t / dur) * 100 : 0;
  return (
    <div className="stp">
      <div className="stp-stage" onClick={toggle} role="presentation">
        <video ref={video} src={url} playsInline muted={muted} preload="auto" crossOrigin={url.startsWith("blob:") ? undefined : "anonymous"}
          onTimeUpdate={(e) => { setT(e.currentTarget.currentTime); onTime(e.currentTarget.currentTime); }}
          onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); onDuration(e.currentTarget.duration); }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        {!playing && <span className="stp-bigplay" aria-hidden><Play size={22} fill="currentColor" /></span>}
        {markers.map((m, i) => (
          <span key={i} className={`stp-caption-marker${activeMarker === i ? " on" : ""}`} hidden={Math.abs(t - m.t) > 0.75}>{m.label}</span>
        ))}
      </div>
      <div className="stp-controls">
        <button type="button" className="stp-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
        <button type="button" className="stp-btn small" onClick={() => step(-1)} aria-label="Back one second"><SkipBack size={13} /></button>
        <button type="button" className="stp-btn small" onClick={() => step(1)} aria-label="Forward one second"><SkipForward size={13} /></button>
        <span className="stp-time">{fmtT(t)} <em>/ {fmtT(dur)}</em></span>
        <div className="stp-scrub" role="group" aria-label="Timeline">
          <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(t, dur || 0)} aria-label="Seek" onChange={(e) => { const v = video.current; if (!v) return; v.currentTime = Number(e.target.value); setT(v.currentTime); }} style={{ "--p": `${pct}%` } as React.CSSProperties} />
          <div className="stp-track" aria-hidden>
            {segments.map((s, i) => (
              <span key={i} className={`stp-seg ${RATING_CLS[s.rating]}`} style={{ left: `${dur ? (s.start / dur) * 100 : 0}%`, width: `${dur ? ((s.end - s.start) / dur) * 100 : 0}%` }} title={`${fmtT(s.start)}–${fmtT(s.end)} ${s.label}: ${s.rating}`} />
            ))}
          </div>
          <div className="stp-marks" aria-hidden>
            {markers.map((m, i) => (
              <button key={i} type="button" className={`stp-mark ${m.kind}${activeMarker === i ? " on" : ""}`} style={{ left: `${dur ? (m.t / dur) * 100 : 0}%` }} title={`${fmtT(m.t)} · ${m.label}`} onClick={(e) => { e.stopPropagation(); const v = video.current; if (v) { v.currentTime = m.t; setT(m.t); } }} />
            ))}
          </div>
        </div>
        <button type="button" className="stp-btn small" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
        <input type="range" className="stp-vol" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => { const v = Number(e.target.value); setVolume(v); setMuted(v === 0); if (video.current) video.current.volume = v; }} />
      </div>
      {thumbs.length > 0 && (
        <div className="stp-strip" aria-label="Sampled frames">
          {thumbs.map((th, i) => (
            <button key={i} type="button" className={`stp-thumb${cover === i ? " cover" : ""}`} title={`${fmtT(th.t)}${cover === i ? " · cover" : " · click to jump, double-click to set as cover"}`}
              onClick={() => { const v = video.current; if (v) { v.pause(); v.currentTime = th.t; setT(th.t); } }} onDoubleClick={() => onCover(cover === i ? null : i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={th.src} alt={`Frame at ${fmtT(th.t)}`} />
              <span>{fmtT(th.t)}</span>
              {cover === i && <em>Cover</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
