// components/VideoScorer.tsx
//
// The interactive half of the Video Scorer. Frames are sampled in the browser with
// <video> + <canvas> and posted to /api/scorer — no FFmpeg, no upload storage, and
// the video file itself never leaves the user's machine.
//
// The video stays on screen next to the results, and every timestamp in the fix list
// (and every point on the retention curve) seeks the player to that exact moment.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Dim = { label: string; value: number; note: string };

type VideoScore = {
  overall: number;
  verdict: string;
  verdictDetail: string;
  dims: Dim[];
  retention: number[];
  biggestDropSec: number;
  fixes: { time: string; type: string; sev: "high" | "med" | "low"; text: string }[];
};

const MAX_SECONDS = 180;
const FRAME_COUNT = 8;
const FRAME_WIDTH = 512;

/** "0:06" or "0:06–0:09" → 6 */
function parseTime(label: string): number {
  const first = label.split(/[–—-]/)[0].trim();
  const parts = first.split(":").map((p) => parseInt(p, 10));
  if (parts.some(Number.isNaN)) return 0;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function extractFrames(
  file: File,
  onProgress: (done: number, total: number) => void
): Promise<{ frames: string[]; times: number[]; duration: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read that video file."));
  });

  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("Could not read the length of that video.");
  }
  if (duration > MAX_SECONDS) {
    URL.revokeObjectURL(url);
    throw new Error(
      `That video is ${Math.round(duration)}s. Please use one under ${MAX_SECONDS / 60} minutes.`
    );
  }

  const canvas = document.createElement("canvas");
  const scale = FRAME_WIDTH / (video.videoWidth || FRAME_WIDTH);
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.max(1, Math.round((video.videoHeight || FRAME_WIDTH) * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Your browser blocked frame extraction.");
  }

  // Front-load the sample times — the first 3 seconds decide retention.
  const early = [0, 0.7, 1.5, 2.5].filter((t) => t < duration);
  const remaining = FRAME_COUNT - early.length;
  const rest: number[] = [];
  for (let i = 1; i <= remaining; i++) {
    const t = 2.5 + (i / (remaining + 1)) * Math.max(0, duration - 2.5);
    if (t < duration) rest.push(Number(t.toFixed(2)));
  }
  const times = [...early, ...rest];

  const frames: string[] = [];
  for (let i = 0; i < times.length; i++) {
    video.currentTime = Math.min(times[i], Math.max(0, duration - 0.05));
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      video.addEventListener("seeked", done);
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6).split(",")[1]);
    onProgress(i + 1, times.length);
  }

  URL.revokeObjectURL(url);
  return { frames, times, duration };
}

/** Counts a number up when it first appears. */
function useCountUp(target: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

const STEPS = ["Reading video", "Sampling frames", "Analysing", "Scoring"] as const;

export default function VideoScorer({ niche }: { niche?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ src: string; t: number }[]>([]);
  const [transcript, setTranscript] = useState("");
  const [caption, setCaption] = useState("");
  const [step, setStep] = useState(-1);
  const [frameProgress, setFrameProgress] = useState({ done: 0, total: FRAME_COUNT });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoScore | null>(null);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [activeFix, setActiveFix] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const busy = step >= 0;

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const seekTo = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec);
    v.play().catch(() => {
      /* autoplay may be blocked — the seek still worked */
    });
  }, []);

  const run = useCallback(
    async (f: File) => {
      setError(null);
      setResult(null);
      setActiveFix(null);
      setThumbs([]);
      setCurrentTime(0);
      setFile(f);

      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(f);
      urlRef.current = url;
      setVideoUrl(url);

      setStep(0);
      try {
        setStep(1);
        const { frames, times, duration: dur } = await extractFrames(f, (done, total) =>
          setFrameProgress({ done, total })
        );
        setThumbs(
          frames.map((src, i) => ({ src: `data:image/jpeg;base64,${src}`, t: times[i] }))
        );
        setDuration(dur);
        setStep(2);

        const res = await fetch("/api/scorer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frames,
            frameTimes: times,
            durationSec: dur,
            transcript: transcript.trim() || undefined,
            caption: caption.trim() || undefined,
            niche,
          }),
        });

        setStep(3);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Scoring failed. Please try again.");
          return;
        }
        setResult(data as VideoScore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong reading that video.");
      } finally {
        setStep(-1);
      }
    },
    [transcript, caption, niche]
  );

  return (
    <>
      <ScorerStyles />

      <div
        className={`dropzone vs-drop ${dragging ? "vs-drag" : ""} ${videoUrl ? "vs-compact" : ""}`}
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) run(f);
        }}
      >
        <div className="drop-icon vs-bob">⬆</div>
        <div className="drop-title">
          {dragging
            ? "Drop it"
            : file
            ? `${file.name} — click to try another`
            : "Drop a video here, or click to browse"}
        </div>
        <div className="drop-note">MP4 or MOV · up to 3 minutes · never leaves your device</div>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="scorer-context">
        <label>
          <span>
            Voiceover or on-screen text <small>(optional, improves accuracy a lot)</small>
          </span>
          <textarea
            rows={3}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste what's said or shown on screen…"
            disabled={busy}
          />
        </label>
        <label>
          <span>
            Planned caption <small>(optional)</small>
          </span>
          <textarea
            rows={2}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="The caption you'll post with it…"
            disabled={busy}
          />
        </label>
      </div>

      {error && <div className="scorer-error vs-in">{error}</div>}

      {busy && (
        <div className="vs-steps vs-in">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`vs-step ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}
            >
              <span className="vs-dot">{i < step ? "✓" : ""}</span>
              <span className="vs-step-label">
                {s}
                {i === 1 && step === 1 && (
                  <em>
                    {" "}
                    {frameProgress.done}/{frameProgress.total}
                  </em>
                )}
              </span>
            </div>
          ))}
          <div className="vs-bar">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Empty state — the page used to be blank below the fields until an upload */}
      {!videoUrl && !busy && !error && <EmptyState />}

      {videoUrl && (
        <div className="vs-layout">
          <aside className="vs-player vs-in">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            />
            <div className="vs-time">
              {fmt(currentTime)} / {fmt(duration)}
            </div>

            {thumbs.length > 0 && (
              <>
                <span className="head-note vs-strip-label">Frames analysed — click to jump</span>
                <div className="vs-strip">
                  {thumbs.map((th, i) => (
                    <button
                      key={i}
                      type="button"
                      className="vs-thumb"
                      style={{ animationDelay: `${i * 55}ms` }}
                      onClick={() => seekTo(th.t)}
                      title={`Jump to ${fmt(th.t)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={th.src} alt={`Frame at ${fmt(th.t)}`} />
                      <span>{fmt(th.t)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          <div className="vs-results">
            {result && (
              <div className="panel-grid vs-in">
                <section className="chart-card">
                  <div className="scorer-top">
                    <div className="overall">
                      <Ring score={result.overall} />
                      <div className="overall-verdict">
                        <b>{result.verdict}</b>
                        <span>{result.verdictDetail}</span>
                      </div>
                    </div>
                    <div className="dims">
                      {result.dims.map((d, i) => (
                        <div className="dim-row" key={d.label} title={d.note}>
                          <span className="dim-label">{d.label}</span>
                          <span className="dim-track">
                            <span
                              className="dim-fill vs-fill"
                              style={{
                                width: `${d.value}%`,
                                animationDelay: `${200 + i * 110}ms`,
                              }}
                            />
                          </span>
                          <span className="dim-val">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ul className="dim-notes">
                    {result.dims.map((d) => (
                      <li key={d.label}>
                        <b>{d.label}</b> {d.note}
                      </li>
                    ))}
                  </ul>

                  <div className="chart-head" style={{ marginTop: 22 }}>
                    <h3>Predicted retention</h3>
                    <span className="head-note">Click the curve to jump there</span>
                  </div>
                  <RetentionChart
                    retention={result.retention}
                    dropSec={result.biggestDropSec}
                    duration={duration}
                    playhead={currentTime}
                    onSeek={seekTo}
                  />
                </section>

                <section className="chart-card">
                  <div className="chart-head">
                    <h3>Fix list</h3>
                    <span className="head-note">Click one to see it</span>
                  </div>
                  <ul className="fix-listx vs-fixes">
                    {result.fixes.map((f, i) => (
                      <li
                        key={i}
                        className={`vs-fix ${activeFix === i ? "vs-fix-on" : ""}`}
                        style={{ animationDelay: `${120 + i * 90}ms` }}
                        onClick={() => {
                          setActiveFix(i);
                          seekTo(parseTime(f.time));
                        }}
                      >
                        <span className={`fix-time ${f.sev}`}>{f.time}</span>
                        <span className="fix-body">
                          <b>{f.type}</b>
                          <small>{f.text}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Shown before anything is uploaded. Explains what the tool returns using small
 * animated demos. Every panel is explicitly labelled as an example — this must never
 * be mistaken for a real result, which is exactly what the old mockup got wrong.
 */
function EmptyState() {
  return (
    <div className="vs-empty vs-in">
      <div className="vs-empty-head">
        <span className="vs-badge">Example — not your data</span>
        <p>Drop a video above and you&apos;ll get these three things back in about 30 seconds.</p>
      </div>

      <div className="vs-empty-grid">
        <div className="vs-ecard" style={{ animationDelay: "60ms" }}>
          <div className="vs-ering">
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle cx="40" cy="40" r="33" className="vs-ering-track" />
              <circle
                cx="40"
                cy="40"
                r="33"
                className="vs-ering-fill"
                transform="rotate(-90 40 40)"
              />
            </svg>
            <b>84</b>
          </div>
          <h4>A score you can argue with</h4>
          <p>Hook, script, visual and audio rated separately — each with the reason.</p>
        </div>

        <div className="vs-ecard" style={{ animationDelay: "160ms" }}>
          <svg viewBox="0 0 160 70" className="vs-ecurve" preserveAspectRatio="none">
            <polyline
              points="0,6 16,10 32,34 48,40 64,45 80,49 96,53 112,56 128,59 144,61 160,63"
              className="vs-ecurve-line"
            />
            <circle cx="32" cy="34" r="3.5" className="vs-ecurve-dot" />
          </svg>
          <h4>Where people leave</h4>
          <p>A predicted retention curve, with the steepest drop marked to the second.</p>
        </div>

        <div className="vs-ecard" style={{ animationDelay: "260ms" }}>
          <ul className="vs-efixes">
            <li>
              <span className="vs-etime high">0:00</span>
              <span>Cut the logo intro</span>
            </li>
            <li>
              <span className="vs-etime med">0:06</span>
              <span>Move the payoff earlier</span>
            </li>
            <li>
              <span className="vs-etime low">0:11</span>
              <span>Caption the CTA</span>
            </li>
          </ul>
          <h4>Fixes, not feedback</h4>
          <p>Timestamped and specific. Click one and the video jumps there.</p>
        </div>
      </div>

      <div className="vs-empty-note">
        Frames are read on your device. The video file is never uploaded anywhere.
      </div>
    </div>
  );
}

function Ring({ score }: { score: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const off = c * (1 - clamped / 100);
  const shown = useCountUp(clamped);

  return (
    <svg viewBox="0 0 120 120" className="ring vs-ring" width="120" height="120">
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-fill vs-ring-fill"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ ["--ring-c" as string]: `${c}` }}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" className="ring-num" textAnchor="middle" dominantBaseline="central">
        {shown}
      </text>
      <text x="60" y="82" className="ring-den" textAnchor="middle">
        / 100
      </text>
    </svg>
  );
}

function RetentionChart({
  retention,
  dropSec,
  duration,
  playhead,
  onSeek,
}: {
  retention: number[];
  dropSec: number;
  duration: number;
  playhead: number;
  onSeek: (s: number) => void;
}) {
  const W = 680,
    H = 200,
    padL = 34,
    padR = 14,
    padT = 14,
    padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = retention.length;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(100, v)) / 100) * plotH;
  const line = retention.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(retention[0])} ${retention
    .map((v, i) => `L${x(i)},${y(v)}`)
    .join(" ")} L${x(n - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * plotH);

  const dropIdx = Math.max(0, Math.min(n - 1, Math.round(dropSec)));
  const dropPct = retention[dropIdx] ?? 0;
  const prevPct = retention[Math.max(0, dropIdx - 1)] ?? dropPct;
  const lost = Math.max(0, Math.round(prevPct - dropPct));

  const secPerIdx = duration / Math.max(1, n - 1);
  const headIdx = Math.min(n - 1, playhead / Math.max(0.001, secPerIdx));

  const ticks = [0, 0.33, 0.66, 1].map((t) => ({
    i: Math.round(t * (n - 1)),
    label: fmt(t * duration),
  }));

  return (
    <svg
      className="svgchart vs-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Predicted viewer retention over time"
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const idx = ((px - padL) / plotW) * (n - 1);
        onSeek(Math.max(0, Math.min(duration, idx * secPerIdx)));
      }}
    >
      <defs>
        <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563FF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#2563FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((gy, i) => (
        <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="grid" />
      ))}
      {[0, 25, 50, 75, 100].map((p) => (
        <text key={p} x={padL - 6} y={y(p) + 3} className="axislabel" textAnchor="end">
          {p}
        </text>
      ))}
      <path d={area} fill="url(#retFill)" className="vs-area" />
      <line x1={x(dropIdx)} y1={padT} x2={x(dropIdx)} y2={padT + plotH} className="drop-line" />
      <polyline points={line} className="line you vs-line" />
      <circle cx={x(dropIdx)} cy={y(dropPct)} r="4.5" className="drop-dot vs-pulse">
        <title>{`Biggest drop at ${fmt(dropSec)} — ${lost}% leave`}</title>
      </circle>
      {playhead > 0 && (
        <line
          x1={x(headIdx)}
          y1={padT}
          x2={x(headIdx)}
          y2={padT + plotH}
          className="vs-playhead"
        />
      )}
      {ticks.map((t, i) => (
        <text key={i} x={x(t.i)} y={H - 8} className="axislabel" textAnchor="middle">
          {t.label}
        </text>
      ))}
    </svg>
  );
}

/** Scoped styles — kept here so this feature doesn't collide with globals.css. */
function ScorerStyles() {
  return (
    <style>{`
      @keyframes vsIn { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
      @keyframes vsPop { from { opacity:0; transform: scale(.94) } to { opacity:1; transform:none } }
      @keyframes vsGrow { from { width: 0 } }
      @keyframes vsDraw { from { stroke-dashoffset: 2400 } to { stroke-dashoffset: 0 } }
      @keyframes vsRing { from { stroke-dashoffset: var(--ring-c) } }
      @keyframes vsPulse { 0%,100% { r:4.5; opacity:1 } 50% { r:7; opacity:.65 } }
      @keyframes vsBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      @keyframes vsShine { to { background-position: 200% 0 } }

      @keyframes vsSweep { to { transform: translateX(220%) } }
      @keyframes vsRingDemo { from { stroke-dashoffset: 207 } to { stroke-dashoffset: 33 } }
      @keyframes vsCurveDemo { from { stroke-dashoffset: 260 } to { stroke-dashoffset: 0 } }
      @keyframes vsFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }

      .vs-in { animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; }

      /* Dropzone gets a light sweep so it reads as interactive, and lifts on hover */
      .vs-drop { position:relative; overflow:hidden;
                 transition: border-color .2s, background .2s, padding .3s ease,
                             transform .18s, box-shadow .18s;
                 animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; }
      .vs-drop::after { content:''; position:absolute; top:0; left:-60%; width:40%; height:100%;
                        background: linear-gradient(90deg, transparent,
                          rgba(37,99,255,.07), transparent);
                        animation: vsSweep 3.4s ease-in-out infinite; pointer-events:none; }
      .vs-drop:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,.10); }
      .vs-drop.vs-drag { border-color:#2563FF !important; background: rgba(37,99,255,.07);
                         transform: scale(1.008); }
      .vs-drop.vs-compact { padding-top:18px; padding-bottom:18px; }
      .vs-drop.vs-compact::after { display:none; }
      .vs-bob { animation: vsBob 2.4s ease-in-out infinite; }

      .scorer-context { animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; animation-delay:.07s; }

      /* Empty state */
      .vs-empty { margin-top: 26px; animation-delay:.14s; }
      .vs-empty-head { text-align:center; margin-bottom:18px; }
      .vs-badge { display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.7px;
                  text-transform:uppercase; padding:4px 10px; border-radius:99px;
                  background: rgba(128,128,128,.12); opacity:.7; }
      .vs-empty-head p { margin:10px 0 0; font-size:14.5px; opacity:.6; }
      .vs-empty-grid { display:grid; gap:14px; }
      @media (min-width: 820px) { .vs-empty-grid { grid-template-columns: repeat(3,1fr); } }
      .vs-ecard { border:1px solid rgba(128,128,128,.16); border-radius:16px; padding:20px;
                  animation: vsIn .5s cubic-bezier(.22,1,.36,1) both;
                  transition: transform .18s, border-color .18s; }
      .vs-ecard:hover { transform: translateY(-3px); border-color: rgba(37,99,255,.35); }
      .vs-ecard h4 { margin:14px 0 5px; font-size:14.5px; }
      .vs-ecard p { margin:0; font-size:13px; line-height:1.5; opacity:.62; }

      .vs-ering { position:relative; width:80px; height:80px; animation: vsFloat 3.6s ease-in-out infinite; }
      .vs-ering b { position:absolute; inset:0; display:grid; place-items:center;
                    font-size:22px; letter-spacing:-.5px; }
      .vs-ering-track { fill:none; stroke:rgba(128,128,128,.16); stroke-width:7; }
      .vs-ering-fill { fill:none; stroke:#2563FF; stroke-width:7; stroke-linecap:round;
                       stroke-dasharray:207; animation: vsRingDemo 1.6s cubic-bezier(.22,1,.36,1) both;
                       animation-delay:.3s; }

      .vs-ecurve { width:100%; height:70px; }
      .vs-ecurve-line { fill:none; stroke:#2563FF; stroke-width:2.5; stroke-linecap:round;
                        stroke-dasharray:260; animation: vsCurveDemo 1.6s ease-out both;
                        animation-delay:.45s; }
      .vs-ecurve-dot { fill:#ef4444; animation: vsPulse 2s ease-in-out infinite; animation-delay:1.8s; }

      .vs-efixes { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
      .vs-efixes li { display:flex; align-items:center; gap:9px; font-size:12.5px; opacity:.8;
                      animation: vsIn .4s ease both; }
      .vs-efixes li:nth-child(1){ animation-delay:.5s }
      .vs-efixes li:nth-child(2){ animation-delay:.62s }
      .vs-efixes li:nth-child(3){ animation-delay:.74s }
      .vs-etime { font-size:10.5px; font-weight:700; padding:3px 7px; border-radius:6px; flex:none;
                  font-variant-numeric:tabular-nums; }
      .vs-etime.high { background:rgba(239,68,68,.14); color:#dc2626; }
      .vs-etime.med  { background:rgba(245,158,11,.14); color:#d97706; }
      .vs-etime.low  { background:rgba(37,99,255,.12); color:#2563FF; }

      .vs-empty-note { margin-top:16px; text-align:center; font-size:12.5px; opacity:.45; }

      .vs-steps { margin:18px 0 6px; }
      .vs-step { display:flex; align-items:center; gap:10px; padding:5px 0; font-size:13.5px;
                 opacity:.45; transition: opacity .3s; }
      .vs-step.active, .vs-step.done { opacity:1; }
      .vs-step em { font-style:normal; opacity:.6; }
      .vs-dot { width:18px; height:18px; border-radius:50%; display:grid; place-items:center;
                font-size:10px; border:1.5px solid currentColor; opacity:.5; flex:none; }
      .vs-step.done .vs-dot { background:#22c55e; border-color:#22c55e; color:#063; opacity:1; }
      .vs-step.active .vs-dot { border-color:#2563FF; opacity:1;
        background: linear-gradient(90deg,transparent,rgba(37,99,255,.5),transparent);
        background-size:200% 100%; animation: vsShine 1.1s linear infinite; }
      .vs-bar { height:3px; border-radius:99px; background:rgba(128,128,128,.18);
                overflow:hidden; margin-top:10px; }
      .vs-bar > span { display:block; height:100%; background:#2563FF;
                       transition: width .5s cubic-bezier(.22,1,.36,1); }

      .vs-layout { display:grid; gap:20px; margin-top:20px; align-items:start; }
      @media (min-width:1040px) { .vs-layout { grid-template-columns: 300px 1fr; } }

      .vs-player { position:sticky; top:16px; }
      .vs-player video { width:100%; border-radius:14px; display:block; background:#000;
                         border:1px solid rgba(128,128,128,.2); }
      .vs-time { font-size:12px; opacity:.55; margin-top:6px; font-variant-numeric:tabular-nums; }
      .vs-strip-label { display:block; margin:14px 0 8px; }
      .vs-strip { display:grid; grid-template-columns: repeat(4,1fr); gap:6px; }
      .vs-thumb { padding:0; border:1px solid rgba(128,128,128,.22); background:none;
                  border-radius:8px; overflow:hidden; cursor:pointer; position:relative; line-height:0;
                  animation: vsPop .4s cubic-bezier(.22,1,.36,1) both;
                  transition: transform .15s, border-color .15s; }
      .vs-thumb:hover { transform: translateY(-2px); border-color:#2563FF; }
      .vs-thumb img { width:100%; display:block; }
      .vs-thumb span { position:absolute; left:3px; bottom:3px; font-size:9px; line-height:1;
                       padding:2px 4px; border-radius:4px; background:rgba(0,0,0,.66); color:#fff; }

      .vs-fill { animation: vsGrow .8s cubic-bezier(.22,1,.36,1) both; }
      .vs-ring-fill { animation: vsRing 1s cubic-bezier(.22,1,.36,1) both; }
      .vs-line { stroke-dasharray:2400; animation: vsDraw 1.1s ease-out both; }
      .vs-area { animation: vsIn .8s ease-out both; animation-delay:.25s; }
      .vs-pulse { animation: vsPulse 2s ease-in-out infinite; }
      .vs-playhead { stroke:#2563FF; stroke-width:1.5; opacity:.75; }

      .vs-fixes li { animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; cursor:pointer;
                     border-radius:10px; transition: background .18s, transform .18s; }
      .vs-fixes li:hover { background: rgba(37,99,255,.07); transform: translateX(2px); }
      .vs-fix-on { background: rgba(37,99,255,.12) !important; box-shadow: inset 2px 0 0 #2563FF; }

      .scorer-context { display:grid; gap:14px; margin:18px 0 6px; }
      @media (min-width:860px) { .scorer-context { grid-template-columns:1.4fr 1fr; } }
      .scorer-context label { display:block; }
      .scorer-context label > span { display:block; font-size:13px; font-weight:600;
                                     margin-bottom:6px; opacity:.85; }
      .scorer-context label small { font-weight:400; opacity:.6; }
      .scorer-context textarea { width:100%; resize:vertical; font:inherit; font-size:14px;
        padding:10px 12px; border-radius:12px; border:1px solid rgba(128,128,128,.28);
        background:rgba(128,128,128,.06); color:inherit;
        transition: border-color .15s, box-shadow .15s; }
      .scorer-context textarea:focus { outline:none; border-color:#2563FF;
        box-shadow:0 0 0 3px rgba(37,99,255,.15); }
      .scorer-error { margin:14px 0; padding:12px 14px; border-radius:12px; font-size:14px;
        border:1px solid rgba(220,38,38,.35); background:rgba(220,38,38,.08); }
      .dim-notes { list-style:none; margin:16px 0 0; padding:0; }
      .dim-notes li { font-size:13px; line-height:1.55; opacity:.75; padding:6px 0;
        border-top:1px solid rgba(128,128,128,.16); }
      .dim-notes li:first-child { border-top:none; }
      .dim-notes b { opacity:1; margin-right:6px; }

      @media (prefers-reduced-motion: reduce) {
        .vs-in, .vs-fill, .vs-ring-fill, .vs-line, .vs-area, .vs-thumb, .vs-fixes li,
        .vs-pulse, .vs-bob, .vs-step.active .vs-dot, .vs-drop, .scorer-context,
        .vs-empty, .vs-ecard, .vs-ering, .vs-ering-fill, .vs-ecurve-line,
        .vs-ecurve-dot, .vs-efixes li { animation: none !important; }
        .vs-drop::after { display: none; }
        .vs-drop:hover, .vs-ecard:hover { transform: none; }
        .vs-ering-fill { stroke-dashoffset: 33; }
        .vs-ecurve-line { stroke-dashoffset: 0; }
      }
    `}</style>
  );
}
