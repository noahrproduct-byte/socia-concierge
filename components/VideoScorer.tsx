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
import {
  Upload,
  FolderOpen,
  Check,
  ArrowRight,
  Lock,
} from "lucide-react";

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

const TIPS = [
  "Use your final draft",
  "Good lighting + clean audio",
  "Keep it under 3 minutes",
  "Avoid heavy filters or effects",
];

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

      {/* upload panel — the focal point */}
      <div
        className={`vs2-drop ${dragging ? "drag" : ""} ${videoUrl ? "compact" : ""}`}
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
        <div className="vs2-drop-main">
          <div className="vs2-drop-ico">
            <Upload size={22} strokeWidth={2.2} />
          </div>
          <div className="vs2-drop-title">
            {dragging
              ? "Drop it"
              : file
              ? `${file.name} — click to try another`
              : "Drop a video here, or click to browse"}
          </div>
          <div className="vs2-drop-note">
            MP4 or MOV · up to 3 minutes · never leaves your device
          </div>
          <button className="vs2-browse" type="button" disabled={busy}>
            <FolderOpen size={14} /> Browse files
          </button>
        </div>

        {/* tips live inside the panel but never trigger the file dialog */}
        <aside
          className="vs2-tips"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <b>Tips for best results</b>
          <ul>
            {TIPS.map((t) => (
              <li key={t}>
                <Check size={13} /> {t}
              </li>
            ))}
          </ul>
          <button
            className="vs2-tips-link"
            type="button"
            onClick={() =>
              document
                .getElementById("vs2-example")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            View examples <ArrowRight size={12} />
          </button>
        </aside>

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

      {/* optional context */}
      <div className="vs2-context">
        <label>
          <span>
            Voiceover or on-screen text <small>(optional, improves accuracy a lot)</small>
          </span>
          <span className="vs2-field">
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste what's said or shown on screen…"
              disabled={busy}
            />
            <em className="vs2-count">{transcript.length}/2000</em>
          </span>
        </label>
        <label>
          <span>
            Planned caption <small>(optional)</small>
          </span>
          <span className="vs2-field">
            <textarea
              rows={3}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="The caption you'll post with it…"
              disabled={busy}
            />
            <em className="vs2-count">{caption.length}/1000</em>
          </span>
        </label>
      </div>

      {error && <div className="vs2-error vs-in">{error}</div>}

      {busy && (
        <div className="vs2-steps vs-in">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`vs2-step ${i < step ? "done" : ""} ${i === step ? "active" : ""}`}
            >
              <span className="vs2-dot">{i < step ? "✓" : ""}</span>
              <span className="vs2-step-label">
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
          <div className="vs2-bar">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Empty state — the page used to be blank below the fields until an upload */}
      {!videoUrl && !busy && !error && <EmptyState />}

      {videoUrl && (
        <div className="vs2-layout">
          <aside className="vs2-player vs-in">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            />
            <div className="vs2-time">
              {fmt(currentTime)} / {fmt(duration)}
            </div>

            {thumbs.length > 0 && (
              <>
                <span className="vs2-note vs2-strip-label">Frames analysed — click to jump</span>
                <div className="vs2-strip">
                  {thumbs.map((th, i) => (
                    <button
                      key={i}
                      type="button"
                      className="vs2-thumb"
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

          <div className="vs2-results-col">
            {result && (
              <div className="vs2-results vs-in">
                <section className="vs2-card">
                  <div className="vs2-top">
                    <div className="vs2-overall">
                      <Ring score={result.overall} />
                      <div className="vs2-verdict">
                        <b>{result.verdict}</b>
                        <span>{result.verdictDetail}</span>
                      </div>
                    </div>
                    <div className="vs2-dims">
                      {result.dims.map((d, i) => (
                        <div className="vs2-dim" key={d.label} title={d.note}>
                          <span className="vs2-dim-label">{d.label}</span>
                          <span className="vs2-dim-track">
                            <span
                              className={`vs2-dim-fill c${i % 4} vs-fill`}
                              style={{
                                width: `${d.value}%`,
                                animationDelay: `${200 + i * 110}ms`,
                              }}
                            />
                          </span>
                          <span className="vs2-dim-val">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <ul className="vs2-dim-notes">
                    {result.dims.map((d) => (
                      <li key={d.label}>
                        <b>{d.label}</b> {d.note}
                      </li>
                    ))}
                  </ul>

                  <div className="vs2-card-head" style={{ marginTop: 22 }}>
                    <h3>Predicted retention</h3>
                    <span className="vs2-note">Click the curve to jump there</span>
                  </div>
                  <RetentionChart
                    retention={result.retention}
                    dropSec={result.biggestDropSec}
                    duration={duration}
                    playhead={currentTime}
                    onSeek={seekTo}
                  />
                </section>

                <section className="vs2-card">
                  <div className="vs2-card-head">
                    <h3>Fix list</h3>
                    <span className="vs2-note">Click one to see it</span>
                  </div>
                  <ul className="vs2-fixes">
                    {result.fixes.map((f, i) => (
                      <li
                        key={i}
                        className={`vs2-fix ${activeFix === i ? "on" : ""}`}
                        style={{ animationDelay: `${120 + i * 90}ms` }}
                        onClick={() => {
                          setActiveFix(i);
                          seekTo(parseTime(f.time));
                        }}
                      >
                        <span className={`vs2-time-chip ${f.sev}`}>{f.time}</span>
                        <span className="vs2-fix-body">
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

      <div className="vs2-privacy">
        <Lock size={12} /> Frames are read on your device. The video file is never uploaded
        anywhere.
      </div>
    </>
  );
}

// Example breakdown for the labeled demo card. The tooltips describe what each
// category measures — product facts, not results.
const EX_DIMS = [
  { k: "Hook", v: 88, tip: "Whether the first seconds create enough curiosity to keep watching." },
  { k: "Script", v: 82, tip: "Pacing, clarity and payoff of what's said and shown." },
  { k: "Visual", v: 81, tip: "Framing, lighting and visual variety across the video." },
  { k: "Audio", v: 85, tip: "Voice clarity and how well sound supports the content." },
];

const band = (v: number) => (v >= 84 ? "Strong" : v >= 70 ? "Good" : v >= 55 ? "Fair" : "Weak");

/**
 * Shown before anything is uploaded. Explains what the tool returns using small
 * animated demos. Every panel is explicitly labelled as an example — this must never
 * be mistaken for a real result, which is exactly what the old mockup got wrong.
 */
function EmptyState() {
  const shown = useCountUp(84, 650);
  const low = EX_DIMS.reduce((a, b) => (b.v < a.v ? b : a));
  return (
    <div className="vs2-empty vs-in" id="vs2-example">
      <div className="vs2-empty-head">
        <span className="vs2-badge">Example — not your data</span>
        <p>Drop a video above and you&apos;ll get these three things back in about 30 seconds.</p>
      </div>

      <div className="vs2-egrid">
        <div className="vs2-ecard" style={{ animationDelay: "60ms" }}>
          <span className="vs2-elabel">Overall score</span>
          <div className="vs3-top">
            <div className="vs3-ring" aria-hidden>
              <svg viewBox="0 0 118 118" width="118" height="118">
                <circle cx="59" cy="59" r="52" className="vs3-track" />
                <circle cx="59" cy="59" r="52" className="vs3-fill" transform="rotate(-90 59 59)" />
              </svg>
              <span className="vs3-center">
                <b>{shown}</b>
                <small>/100</small>
                <em>{band(84)}</em>
              </span>
            </div>
            <div className="vs3-exp">
              <h4>Strong overall. Your hook is doing most of the work.</h4>
              <p>
                Hook, script, visual and audio are scored separately so you know exactly what to
                improve.
              </p>
            </div>
          </div>
          <div className="vs3-break">
            {EX_DIMS.map((d, i) => (
              <div
                className={`vs3-m c${i}`}
                key={d.k}
                title={`${d.k} — ${d.tip}`}
                style={{ animationDelay: `${250 + i * 80}ms` }}
              >
                <small>{d.k}</small>
                <b>{d.v}</b>
                <em>
                  {band(d.v)}
                  {d === low ? " · lowest" : ""}
                </em>
                <span className="vs3-bar">
                  <i style={{ width: `${d.v}%`, animationDelay: `${320 + i * 80}ms` }} />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="vs2-ecard" style={{ animationDelay: "160ms" }}>
          <span className="vs2-elabel">Where people leave</span>
          <svg viewBox="0 0 300 120" className="vs2-ecurve" aria-hidden>
            {/* grid + axes */}
            {[14, 52, 90].map((gy) => (
              <line key={gy} x1={34} y1={gy} x2={292} y2={gy} className="eg" />
            ))}
            <text x={30} y={17} className="ea" textAnchor="end">100%</text>
            <text x={30} y={55} className="ea" textAnchor="end">50%</text>
            <text x={30} y={93} className="ea" textAnchor="end">0%</text>
            {["0:00", "0:15", "0:30", "0:45", "1:00"].map((t, i) => (
              <text key={t} x={38 + i * 62} y={112} className="ea" textAnchor="middle">
                {t}
              </text>
            ))}
            {/* curve with a sharp drop around 0:06 */}
            <path
              d="M38,16 L52,20 L62,42 L80,50 L110,56 L150,62 L200,70 L250,76 L292,80"
              className="el"
            />
            <circle cx={62} cy={42} r="4" className="ed" />
            {/* tooltip */}
            <g className="et">
              <rect x={74} y={18} width={92} height={34} rx={8} />
              <text x={84} y={32}>Steepest drop</text>
              <text x={84} y={45} className="etv">0:06</text>
            </g>
          </svg>
          <p className="vs2-ecap">
            A predicted retention curve, with the steepest drop marked to the second.
          </p>
        </div>

        <div className="vs2-ecard" style={{ animationDelay: "260ms" }}>
          <span className="vs2-elabel">Top moments to fix</span>
          <ul className="vs2-efixes">
            <li>
              <span className="vs2-time-chip high">0:00</span>
              <span>Cut the logo intro</span>
            </li>
            <li>
              <span className="vs2-time-chip med">0:06</span>
              <span>Move the payoff earlier</span>
            </li>
            <li>
              <span className="vs2-time-chip low">0:11</span>
              <span>Caption the CTA</span>
            </li>
          </ul>
          <h4>Fixes, not feedback</h4>
          <p>Timestamped and specific. Click one and the video jumps there.</p>
        </div>
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
    <svg viewBox="0 0 120 120" className="vs2-ring" width="120" height="120">
      <circle cx="60" cy="60" r={r} className="vs2-ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="vs2-ring-fill vs-ring-fill"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ ["--ring-c" as string]: `${c}` }}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" className="vs2-ring-num" textAnchor="middle" dominantBaseline="central">
        {shown}
      </text>
      <text x="60" y="82" className="vs2-ring-den" textAnchor="middle">
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
      className="vs2-chart"
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
          <stop offset="0%" stopColor="#4C86FF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#4C86FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((gy, i) => (
        <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} className="vs2-grid" />
      ))}
      {[0, 25, 50, 75, 100].map((p) => (
        <text key={p} x={padL - 6} y={y(p) + 3} className="vs2-axis" textAnchor="end">
          {p}
        </text>
      ))}
      <path d={area} fill="url(#retFill)" className="vs-area" />
      <line
        x1={x(dropIdx)}
        y1={padT}
        x2={x(dropIdx)}
        y2={padT + plotH}
        className="vs2-dropline"
      />
      <polyline points={line} className="vs2-line vs-line" />
      <circle cx={x(dropIdx)} cy={y(dropPct)} r="4.5" className="vs2-dropdot vs-pulse">
        <title>{`Biggest drop at ${fmt(dropSec)} — ${lost}% leave`}</title>
      </circle>
      {playhead > 0 && (
        <line
          x1={x(headIdx)}
          y1={padT}
          x2={x(headIdx)}
          y2={padT + plotH}
          className="vs2-playhead"
        />
      )}
      {ticks.map((t, i) => (
        <text key={i} x={x(t.i)} y={H - 8} className="vs2-axis" textAnchor="middle">
          {t.label}
        </text>
      ))}
    </svg>
  );
}

/** Scoped styles — kept here so this feature doesn't collide with globals.css.
 *  Dark cinematic surface matching the app-wide dark intelligence layer. */
function ScorerStyles() {
  return (
    <style>{`
      @keyframes vsIn { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
      @keyframes vsPop { from { opacity:0; transform: scale(.94) } to { opacity:1; transform:none } }
      @keyframes vsGrow { from { width: 0 } }
      @keyframes vsDraw { from { stroke-dashoffset: 2400 } to { stroke-dashoffset: 0 } }
      @keyframes vsRing { from { stroke-dashoffset: var(--ring-c) } }
      @keyframes vsPulse { 0%,100% { r:4.5; opacity:1 } 50% { r:7; opacity:.6 } }
      @keyframes vsShine { to { background-position: 200% 0 } }
      @keyframes vsCurveDemo { from { stroke-dashoffset: 420 } to { stroke-dashoffset: 0 } }

      .vs-in { animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; }

      /* ---- upload panel ---- */
      .vs2-drop {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 265px;
        gap: 22px;
        align-items: center;
        margin-top: 20px;
        padding: 34px 30px;
        border: 1.5px dashed rgba(var(--primary-rgb), .4);
        border-radius: 14px;
        background:
          radial-gradient(480px 200px at 50% 0%, rgba(var(--primary-rgb), .06), transparent 70%),
          var(--surface);
        cursor: pointer;
        transition: border-color .2s, background .2s, box-shadow .2s, transform .18s, padding .3s ease;
        animation: vsIn .45s cubic-bezier(.22,1,.36,1) both;
      }
      .vs2-drop:hover { border-color: rgba(var(--primary-rgb), .65); transform: translateY(-1px); }
      .vs2-drop:focus-visible { outline: none; border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(var(--primary-rgb), .18); }
      .vs2-drop.drag { border-color: var(--primary); border-style: solid;
        background: rgba(var(--primary-rgb), .08); box-shadow: 0 0 0 3px rgba(var(--primary-rgb), .14),
        0 0 42px rgba(var(--primary-rgb), .18); }
      .vs2-drop.compact { grid-template-columns: 1fr; padding: 16px 20px; }
      .vs2-drop.compact .vs2-drop-ico, .vs2-drop.compact .vs2-drop-note,
      .vs2-drop.compact .vs2-browse, .vs2-drop.compact .vs2-tips { display: none; }
      .vs2-drop.compact .vs2-drop-title { font-size: 13px; }

      .vs2-drop-main { display: flex; flex-direction: column; align-items: center; text-align: center; }
      .vs2-drop-ico {
        display: grid; place-items: center; width: 54px; height: 54px; border-radius: 15px;
        color: var(--primary-text); border: 1.5px solid rgba(var(--primary-rgb), .55);
        background: rgba(var(--primary-rgb), .08); box-shadow: 0 0 26px rgba(var(--primary-rgb), .18);
        margin-bottom: 14px;
      }
      .vs2-drop-title { font-size: 19px; font-weight: 740; letter-spacing: -0.3px; color: var(--text-primary); }
      .vs2-drop-note { margin-top: 6px; font-size: 12.5px; color: var(--text-secondary); }
      .vs2-browse {
        display: inline-flex; align-items: center; gap: 8px; margin-top: 16px;
        background: var(--surface-elevated); border: 1px solid var(--border);
        border-radius: 10px; padding: 9px 16px; font-size: 12.5px; font-weight: 650;
        color: var(--text-primary); cursor: pointer;
        transition: transform .18s, border-color .18s, background .18s;
      }
      .vs2-browse:hover { transform: translateY(-1px); border-color: var(--border-strong);
        background: var(--surface-elevated); }
      .vs2-browse:disabled { opacity: .5; cursor: default; transform: none; }

      .vs2-tips {
        cursor: default;
        background: var(--surface-muted); border: 1px solid var(--border);
        border-radius: 12px; padding: 15px 17px;
      }
      .vs2-tips > b { display: block; font-size: 12.5px; font-weight: 700; color: var(--text-primary);
        margin-bottom: 10px; }
      .vs2-tips ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .vs2-tips li { display: flex; align-items: center; gap: 8px; font-size: 12px;
        color: var(--text-secondary); }
      .vs2-tips li svg { color: var(--success-text); flex: none; }
      .vs2-tips-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
        background: none; border: none; padding: 0; font-size: 12px; font-weight: 650;
        color: var(--primary-text); cursor: pointer; }
      .vs2-tips-link svg { transition: transform .2s; }
      .vs2-tips-link:hover svg { transform: translateX(3px); }

      /* ---- optional context ---- */
      .vs2-context { display: grid; gap: 14px; margin: 16px 0 6px;
        animation: vsIn .45s cubic-bezier(.22,1,.36,1) both; animation-delay: .07s; }
      @media (min-width: 860px) { .vs2-context { grid-template-columns: 1.4fr 1fr; } }
      .vs2-context label { display: block; }
      .vs2-context label > span:first-child { display: block; font-size: 12px; font-weight: 650;
        margin-bottom: 6px; color: var(--text-secondary); }
      .vs2-context small { font-weight: 500; color: var(--text-muted); }
      .vs2-field { position: relative; display: block; }
      .vs2-context textarea { width: 100%; resize: vertical; font: inherit; font-size: 13px;
        line-height: 1.55; padding: 10px 12px 24px; border-radius: 11px;
        border: 1px solid var(--border); background: var(--surface); color: var(--text-primary);
        transition: border-color .2s, box-shadow .2s; }
      .vs2-context textarea::placeholder { color: var(--text-muted); }
      .vs2-context textarea:focus { outline: none; border-color: rgba(var(--primary-rgb), .55);
        box-shadow: 0 0 0 3px rgba(var(--primary-rgb), .13); }
      .vs2-context textarea:disabled { opacity: .55; }
      .vs2-count { position: absolute; right: 10px; bottom: 9px; font-size: 10px; font-style: normal;
        color: var(--text-muted); font-variant-numeric: tabular-nums; pointer-events: none; }

      .vs2-error { margin: 14px 0; padding: 11px 14px; border-radius: 11px; font-size: 12.5px;
        line-height: 1.55; color: var(--danger-text); border: 1px solid rgba(var(--danger-rgb), .25);
        background: rgba(var(--danger-rgb), .08); }

      /* ---- analysis steps ---- */
      .vs2-steps { margin: 18px 0 6px; background: var(--surface-muted);
        border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
      .vs2-step { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 13px;
        color: var(--text-muted); transition: color .3s; }
      .vs2-step.active, .vs2-step.done { color: var(--text-primary); }
      .vs2-step em { font-style: normal; color: var(--text-secondary); }
      .vs2-dot { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
        font-size: 10px; border: 1.5px solid var(--border-strong); flex: none; }
      .vs2-step.done .vs2-dot { background: var(--success); border-color: var(--success); color: #052e1e; }
      .vs2-step.active .vs2-dot { border-color: var(--primary);
        background: linear-gradient(90deg,transparent,rgba(var(--primary-rgb), .5),transparent);
        background-size: 200% 100%; animation: vsShine 1.1s linear infinite; }
      .vs2-bar { height: 3px; border-radius: 99px; background: var(--surface-elevated);
        overflow: hidden; margin-top: 10px; }
      .vs2-bar > span { display: block; height: 100%; background: linear-gradient(90deg,var(--primary),var(--primary-bright));
        transition: width .5s cubic-bezier(.22,1,.36,1); }

      /* ---- example empty state ---- */
      .vs2-empty { margin-top: 28px; animation-delay: .14s; }
      .vs2-empty-head { text-align: center; margin-bottom: 18px; }
      .vs2-badge { display: inline-block; font-size: 10px; font-weight: 750; letter-spacing: .09em;
        text-transform: uppercase; padding: 5px 12px; border-radius: 99px;
        color: var(--text-secondary); background: var(--surface-elevated);
        border: 1px solid var(--border); }
      .vs2-empty-head p { margin: 10px 0 0; font-size: 13.5px; color: var(--text-secondary); }
      .vs2-egrid { display: grid; gap: 14px; }
      @media (min-width: 980px) { .vs2-egrid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
      .vs2-ecard { background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; padding: 16px 18px;
        animation: vsIn .5s cubic-bezier(.22,1,.36,1) both;
        transition: transform .2s cubic-bezier(.22,1,.36,1), border-color .2s; }
      .vs2-ecard:hover { transform: translateY(-3px); border-color: rgba(var(--primary-rgb), .3); }
      .vs2-elabel { display: block; font-size: 9.5px; font-weight: 750; letter-spacing: .11em;
        text-transform: uppercase; color: var(--text-muted); margin-bottom: 14px; }
      .vs2-ecard h4 { margin: 12px 0 4px; font-size: 14px; font-weight: 700; color: var(--text-primary); }
      .vs2-ecard p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary); }

      /* refined overall-score card: hero ring, quiet copy, one breakdown row */
      .vs3-top { display: flex; align-items: center; gap: 20px; }
      .vs3-ring { position: relative; width: 118px; height: 118px; flex: none; }
      .vs3-track { fill: none; stroke: var(--text-muted); stroke-width: 5; }
      .vs3-fill { fill: none; stroke: #3b76ff; stroke-width: 5; stroke-linecap: round;
        stroke-dasharray: 327; stroke-dashoffset: 52.3;
        filter: drop-shadow(0 0 5px rgba(var(--primary-rgb), .4));
        animation: vs3Ring .7s cubic-bezier(.22,1,.36,1) both; animation-delay: .15s; }
      @keyframes vs3Ring { from { stroke-dashoffset: 327 } }
      .vs3-center { position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; line-height: 1.1; }
      .vs3-center b { font-size: 27px; font-weight: 800; letter-spacing: -1px; color: var(--text-primary);
        font-variant-numeric: tabular-nums; }
      .vs3-center small { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
      .vs3-center em { font-style: normal; font-size: 8.5px; font-weight: 750;
        letter-spacing: .1em; text-transform: uppercase; color: var(--success-text); margin-top: 4px; }
      .vs3-exp h4 { margin: 0 0 5px; font-size: 13.5px; font-weight: 700; color: var(--text-primary);
        line-height: 1.45; }
      .vs3-exp p { margin: 0; font-size: 12px; line-height: 1.55; color: var(--text-secondary); }

      .vs3-break { display: grid; grid-template-columns: repeat(4, minmax(0,1fr));
        margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
      .vs3-m { padding: 2px 12px 0; animation: vsIn .4s cubic-bezier(.22,1,.36,1) both; }
      .vs3-m:first-child { padding-left: 0; }
      .vs3-m + .vs3-m { border-left: 1px solid var(--border); }
      .vs3-m small { display: block; font-size: 9px; font-weight: 750; letter-spacing: .1em;
        text-transform: uppercase; color: var(--text-muted); }
      .vs3-m b { display: block; margin-top: 4px; font-size: 18px; font-weight: 780;
        letter-spacing: -.4px; font-variant-numeric: tabular-nums; transition: filter .18s; }
      .vs3-m em { display: block; font-style: normal; margin-top: 1px; font-size: 10px;
        color: var(--text-secondary); white-space: nowrap; }
      .vs3-bar { display: block; height: 2px; border-radius: 99px;
        background: var(--surface-elevated); margin-top: 9px; overflow: hidden; }
      .vs3-bar i { display: block; height: 100%; border-radius: 99px; opacity: .65;
        transition: opacity .18s; animation: vsGrow .5s cubic-bezier(.22,1,.36,1) both; }
      .vs3-m.c0 b { color: var(--primary-text); } .vs3-m.c0 .vs3-bar i { background: var(--primary-bright); }
      .vs3-m.c1 b { color: var(--primary-text); } .vs3-m.c1 .vs3-bar i { background: var(--primary-bright); }
      .vs3-m.c2 b { color: var(--success-text); } .vs3-m.c2 .vs3-bar i { background: var(--success); }
      .vs3-m.c3 b { color: var(--warning-text); } .vs3-m.c3 .vs3-bar i { background: var(--warning); }
      .vs3-m:hover b { filter: brightness(1.25); }
      .vs3-m:hover .vs3-bar i { opacity: 1; }
      @media (max-width: 560px) {
        .vs3-top { flex-direction: column; text-align: center; gap: 12px; }
        .vs3-break { grid-template-columns: repeat(2, minmax(0,1fr)); row-gap: 14px; }
        .vs3-m { padding-left: 12px; }
        .vs3-m:nth-child(odd) { border-left: none; padding-left: 0; }
      }

      .vs2-ecurve { width: 100%; height: auto; }
      .vs2-ecurve .eg { stroke: var(--text-muted); stroke-width: 1; }
      .vs2-ecurve .ea { fill: var(--text-muted); font-size: 8.5px; }
      .vs2-ecurve .el { fill: none; stroke: var(--primary-bright); stroke-width: 2.5; stroke-linecap: round;
        stroke-linejoin: round; stroke-dasharray: 420;
        animation: vsCurveDemo 1.6s ease-out both; animation-delay: .45s; }
      .vs2-ecurve .ed { fill: var(--danger-text); filter: drop-shadow(0 0 5px rgba(var(--danger-rgb), .8));
        animation: vsPulse 2s ease-in-out infinite; animation-delay: 1.8s; }
      .vs2-ecurve .et rect { fill: var(--surface-elevated); stroke: rgba(var(--danger-rgb), .35); }
      .vs2-ecurve .et text { fill: var(--text-secondary); font-size: 9px; }
      .vs2-ecurve .et .etv { fill: var(--danger-text); font-weight: 700; }
      .vs2-ecap { margin-top: 10px !important; }

      .vs2-efixes { list-style: none; margin: 0 0 4px; padding: 0; display: grid; gap: 8px; }
      .vs2-efixes li { display: flex; align-items: center; gap: 10px; font-size: 12.5px;
        color: var(--text-secondary); border-radius: 9px; padding: 4px 6px;
        animation: vsIn .4s ease both; transition: background .18s; }
      .vs2-efixes li:hover { background: var(--surface-muted); }
      .vs2-efixes li:nth-child(1){ animation-delay:.5s }
      .vs2-efixes li:nth-child(2){ animation-delay:.62s }
      .vs2-efixes li:nth-child(3){ animation-delay:.74s }

      .vs2-time-chip { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 7px;
        flex: none; font-variant-numeric: tabular-nums; }
      .vs2-time-chip.high { background: rgba(var(--danger-rgb), .14); color: var(--danger-text); }
      .vs2-time-chip.med  { background: rgba(var(--warning-rgb), .15);  color: var(--warning-text); }
      .vs2-time-chip.low  { background: rgba(var(--primary-rgb), .16);  color: var(--primary-text); }

      .vs2-privacy { display: flex; align-items: center; justify-content: center; gap: 7px;
        margin-top: 26px; font-size: 12px; color: var(--text-muted); }

      /* ---- results ---- */
      .vs2-layout { display: grid; gap: 18px; margin-top: 20px; align-items: start; }
      @media (min-width: 1040px) { .vs2-layout { grid-template-columns: 300px minmax(0,1fr); } }
      .vs2-layout > * { min-width: 0; }

      .vs2-player { position: sticky; top: 74px; background: var(--surface);
        border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
      .vs2-player video { width: 100%; border-radius: 11px; display: block; background: var(--surface); }
      .vs2-time { font-size: 12px; color: var(--text-secondary); margin-top: 8px;
        font-variant-numeric: tabular-nums; }
      .vs2-note { font-size: 11px; color: var(--text-muted); }
      .vs2-strip-label { display: block; margin: 12px 0 8px; }
      .vs2-strip { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
      .vs2-thumb { padding: 0; border: 1px solid var(--border); background: none;
        border-radius: 8px; overflow: hidden; cursor: pointer; position: relative; line-height: 0;
        animation: vsPop .4s cubic-bezier(.22,1,.36,1) both;
        transition: transform .15s, border-color .15s; }
      .vs2-thumb:hover { transform: translateY(-2px); border-color: var(--primary); }
      .vs2-thumb img { width: 100%; display: block; }
      .vs2-thumb span { position: absolute; left: 3px; bottom: 3px; font-size: 9px; line-height: 1;
        padding: 2px 4px; border-radius: 4px; background: var(--surface); color: var(--text-primary); }

      .vs2-results { display: grid; gap: 16px; }
      @media (min-width: 1400px) { .vs2-results { grid-template-columns: 1.55fr 1fr; } }
      .vs2-results > * { min-width: 0; }
      .vs2-card { background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; padding: 16px 18px; }
      .vs2-card-head { display: flex; align-items: baseline; justify-content: space-between;
        gap: 12px; margin-bottom: 12px; }
      .vs2-card-head h3 { font-size: 10.5px; font-weight: 750; letter-spacing: .11em;
        text-transform: uppercase; color: var(--text-muted); margin: 0; }

      .vs2-top { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; }
      .vs2-overall { display: flex; align-items: center; gap: 14px; }
      .vs2-verdict { max-width: 200px; }
      .vs2-verdict b { display: block; font-size: 15px; font-weight: 750; color: var(--text-primary); }
      .vs2-verdict span { display: block; margin-top: 3px; font-size: 12px; line-height: 1.5;
        color: var(--text-secondary); }
      .vs2-ring-track { fill: none; stroke: var(--text-muted); stroke-width: 8; }
      .vs2-ring-fill { fill: none; stroke: var(--primary-text); stroke-width: 8; stroke-linecap: round; }
      .vs2-ring-num { fill: var(--text-primary); font-size: 30px; font-weight: 800; letter-spacing: -1px; }
      .vs2-ring-den { fill: var(--text-muted); font-size: 10px; font-weight: 650; }

      .vs2-dims { flex: 1; min-width: 210px; display: grid; gap: 10px; }
      .vs2-dim { display: grid; grid-template-columns: 52px 1fr 28px; gap: 10px; align-items: center; }
      .vs2-dim-label { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); }
      .vs2-dim-track { height: 6px; border-radius: 99px; background: var(--surface-elevated);
        overflow: hidden; }
      .vs2-dim-fill { display: block; height: 100%; border-radius: 99px; }
      .vs2-dim-fill.c0 { background: linear-gradient(90deg,var(--primary),var(--primary-bright)); }
      .vs2-dim-fill.c1 { background: linear-gradient(90deg,var(--primary),var(--primary-bright)); }
      .vs2-dim-fill.c2 { background: linear-gradient(90deg,var(--success),var(--success)); }
      .vs2-dim-fill.c3 { background: linear-gradient(90deg,var(--warning),var(--warning)); }
      .vs2-dim-val { font-size: 12.5px; font-weight: 700; color: var(--text-primary); text-align: right;
        font-variant-numeric: tabular-nums; }

      .vs2-dim-notes { list-style: none; margin: 16px 0 0; padding: 0; }
      .vs2-dim-notes li { font-size: 12.5px; line-height: 1.55; color: var(--text-secondary);
        padding: 7px 0; border-top: 1px solid var(--border); }
      .vs2-dim-notes li:first-child { border-top: none; }
      .vs2-dim-notes b { color: var(--text-primary); margin-right: 6px; }

      .vs2-chart { width: 100%; height: auto; }
      .vs2-grid { stroke: var(--text-muted); stroke-width: 1; }
      .vs2-axis { fill: var(--text-muted); font-size: 10px; }
      .vs2-line { fill: none; stroke: var(--primary-bright); stroke-width: 2.5; stroke-linecap: round;
        stroke-linejoin: round; }
      .vs2-dropline { stroke: rgba(var(--danger-rgb), .4); stroke-width: 1; stroke-dasharray: 3 3; }
      .vs2-dropdot { fill: var(--danger-text); filter: drop-shadow(0 0 5px rgba(var(--danger-rgb), .7)); }
      .vs2-playhead { stroke: var(--primary-text); stroke-width: 1.5; opacity: .75; }

      .vs2-fixes { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
      .vs2-fix { display: flex; align-items: flex-start; gap: 11px; padding: 9px 10px;
        border-radius: 10px; cursor: pointer;
        animation: vsIn .45s cubic-bezier(.22,1,.36,1) both;
        transition: background .18s, transform .18s; }
      .vs2-fix:hover { background: rgba(var(--primary-rgb), .07); transform: translateX(2px); }
      .vs2-fix.on { background: rgba(var(--primary-rgb), .12); box-shadow: inset 2px 0 0 var(--primary); }
      .vs2-fix-body b { display: block; font-size: 12.5px; font-weight: 700; color: var(--text-primary); }
      .vs2-fix-body small { display: block; margin-top: 2px; font-size: 12px; line-height: 1.5;
        color: var(--text-secondary); }

      .vs-fill { animation: vsGrow .8s cubic-bezier(.22,1,.36,1) both; }
      .vs-ring-fill { animation: vsRing 1s cubic-bezier(.22,1,.36,1) both; }
      .vs-line { stroke-dasharray: 2400; animation: vsDraw 1.1s ease-out both; }
      .vs-area { animation: vsIn .8s ease-out both; animation-delay: .25s; }
      .vs-pulse { animation: vsPulse 2s ease-in-out infinite; }

      @media (max-width: 900px) {
        .vs2-drop { grid-template-columns: 1fr; padding: 26px 20px; }
        .vs2-tips { order: 2; }
      }

      @media (prefers-reduced-motion: reduce) {
        .vs-in, .vs-fill, .vs-ring-fill, .vs-line, .vs-area, .vs2-thumb, .vs2-fix,
        .vs-pulse, .vs2-drop, .vs2-context, .vs2-empty, .vs2-ecard, .vs3-fill,
        .vs3-m, .vs3-bar i, .vs2-ecurve .el, .vs2-ecurve .ed, .vs2-efixes li,
        .vs2-step.active .vs2-dot { animation: none !important; }
        .vs2-drop:hover, .vs2-ecard:hover, .vs2-browse:hover { transform: none; }
        .vs2-ecurve .el { stroke-dashoffset: 0; }
      }
    `}</style>
  );
}
