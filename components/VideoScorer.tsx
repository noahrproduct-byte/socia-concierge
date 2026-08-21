// components/VideoScorer.tsx
//
// The interactive half of the Video Scorer. Frames are sampled in the browser with
// <video> + <canvas> and posted to /api/scorer — no FFmpeg, no upload storage,
// and the video file itself never leaves the user's machine.

"use client";

import { useCallback, useRef, useState } from "react";

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

/**
 * Sample frames from a video file entirely in the browser.
 * Sampling is weighted toward the first few seconds because that's where
 * retention is won or lost, and it's what the Hook score depends on.
 */
async function extractFrames(file: File): Promise<{
  frames: string[];
  times: number[];
  duration: number;
  posterUrl: string;
}> {
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

  // Front-load the sample times, then spread the rest across the video.
  const early = [0, 0.7, 1.5, 2.5].filter((t) => t < duration);
  const remaining = FRAME_COUNT - early.length;
  const rest: number[] = [];
  for (let i = 1; i <= remaining; i++) {
    const t = 2.5 + (i / (remaining + 1)) * Math.max(0, duration - 2.5);
    if (t < duration) rest.push(Number(t.toFixed(2)));
  }
  const times = [...early, ...rest];

  const frames: string[] = [];
  for (const t of times) {
    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener("seeked", done);
        resolve();
      };
      video.addEventListener("seeked", done);
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6).split(",")[1]);
  }

  // Reuse the first frame as a poster so the user sees what was analysed.
  const posterUrl = `data:image/jpeg;base64,${frames[0]}`;
  URL.revokeObjectURL(url);
  return { frames, times, duration, posterUrl };
}

export default function VideoScorer({ niche }: { niche?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<"idle" | "reading" | "scoring">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoScore | null>(null);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);

  const run = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setFileName(file.name);
      setStage("reading");

      try {
        const { frames, times, duration: dur, posterUrl } = await extractFrames(file);
        setPoster(posterUrl);
        setDuration(dur);
        setStage("scoring");

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

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Scoring failed. Please try again.");
          return;
        }
        setResult(data as VideoScore);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong reading that video.");
      } finally {
        setStage("idle");
      }
    },
    [transcript, caption, niche]
  );

  const busy = stage !== "idle";

  return (
    <>
      {/* Scoped styles for the few elements the mockup didn't have. Kept here rather
          than in globals.css so this feature doesn't collide with other work. */}
      <style>{`
        .scorer-context { display: grid; gap: 14px; margin: 18px 0 6px; }
        @media (min-width: 860px) { .scorer-context { grid-template-columns: 1.4fr 1fr; } }
        .scorer-context label { display: block; }
        .scorer-context label > span {
          display: block; font-size: 13px; font-weight: 600;
          margin-bottom: 6px; opacity: .85;
        }
        .scorer-context label small { font-weight: 400; opacity: .6; }
        .scorer-context textarea {
          width: 100%; resize: vertical; font: inherit; font-size: 14px;
          padding: 10px 12px; border-radius: 12px;
          border: 1px solid rgba(128,128,128,.28);
          background: rgba(128,128,128,.06); color: inherit;
        }
        .scorer-context textarea:focus {
          outline: none; border-color: #2563FF;
          box-shadow: 0 0 0 3px rgba(37,99,255,.15);
        }
        .scorer-error {
          margin: 14px 0; padding: 12px 14px; border-radius: 12px; font-size: 14px;
          border: 1px solid rgba(220,38,38,.35); background: rgba(220,38,38,.08);
        }
        .dim-notes { list-style: none; margin: 16px 0 0; padding: 0; }
        .dim-notes li {
          font-size: 13px; line-height: 1.55; opacity: .75;
          padding: 6px 0; border-top: 1px solid rgba(128,128,128,.16);
        }
        .dim-notes li:first-child { border-top: none; }
        .dim-notes b { opacity: 1; margin-right: 6px; }
        .scorer-poster { margin-top: 18px; }
        .scorer-poster img {
          display: block; width: 100%; max-width: 240px; margin-top: 8px;
          border-radius: 12px; border: 1px solid rgba(128,128,128,.2);
        }
      `}</style>

      {/* Dropzone */}
      <div
        className="dropzone"
        role="button"
        tabIndex={0}
        style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.65 : 1 }}
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
        <div className="drop-icon">⬆</div>
        <div className="drop-title">
          {stage === "reading"
            ? "Reading frames…"
            : stage === "scoring"
            ? "Scoring your video…"
            : dragging
            ? "Drop it"
            : fileName
            ? `${fileName} — click to try another`
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

      {/* Optional context — meaningfully improves Script and Audio scores */}
      <div className="scorer-context">
        <label>
          <span>Voiceover or on-screen text <small>(optional, improves accuracy a lot)</small></span>
          <textarea
            rows={3}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste what's said or shown on screen…"
            disabled={busy}
          />
        </label>
        <label>
          <span>Planned caption <small>(optional)</small></span>
          <textarea
            rows={2}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="The caption you'll post with it…"
            disabled={busy}
          />
        </label>
      </div>

      {error && <div className="scorer-error">{error}</div>}

      {busy && (
        <div className="score-eyebrow">
          {stage === "reading"
            ? "Sampling frames in your browser…"
            : "Analysing hook, script, visuals and pacing…"}
        </div>
      )}

      {result && !busy && (
        <>
          <div className="score-eyebrow">
            Analysis · {fileName} · {Math.round(duration)}s
          </div>

          <div className="panel-grid">
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
                  {result.dims.map((d) => (
                    <div className="dim-row" key={d.label} title={d.note}>
                      <span className="dim-label">{d.label}</span>
                      <span className="dim-track">
                        <span className="dim-fill" style={{ width: `${d.value}%` }} />
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
                <span className="head-note">Where viewers drop off</span>
              </div>
              <RetentionChart
                retention={result.retention}
                dropSec={result.biggestDropSec}
                duration={duration}
              />
            </section>

            <section className="chart-card">
              <div className="chart-head">
                <h3>Fix list</h3>
                <span className="head-note">Ranked by impact</span>
              </div>
              <ul className="fix-listx">
                {result.fixes.map((f, i) => (
                  <li key={i}>
                    <span className={`fix-time ${f.sev}`}>{f.time}</span>
                    <span className="fix-body">
                      <b>{f.type}</b>
                      <small>{f.text}</small>
                    </span>
                  </li>
                ))}
              </ul>
              {poster && (
                <div className="scorer-poster">
                  <span className="head-note">First frame analysed</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={poster} alt="First frame of the uploaded video" />
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Ring({ score }: { score: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg viewBox="0 0 120 120" className="ring" width="120" height="120">
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" className="ring-num" textAnchor="middle" dominantBaseline="central">
        {score}
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
}: {
  retention: number[];
  dropSec: number;
  duration: number;
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

  const fmt = (s: number) => `0:${String(Math.round(s)).padStart(2, "0")}`;
  const ticks = [0, 0.33, 0.66, 1].map((t) => ({
    i: Math.round(t * (n - 1)),
    label: fmt(t * duration),
  }));

  return (
    <svg
      className="svgchart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Predicted viewer retention over time"
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
      <path d={area} fill="url(#retFill)" />
      <line x1={x(dropIdx)} y1={padT} x2={x(dropIdx)} y2={padT + plotH} className="drop-line" />
      <polyline points={line} className="line you" />
      <circle cx={x(dropIdx)} cy={y(dropPct)} r="4.5" className="drop-dot">
        <title>{`Biggest drop at ${fmt(dropSec)} — ${lost}% leave`}</title>
      </circle>
      {ticks.map((t, i) => (
        <text key={i} x={x(t.i)} y={H - 8} className="axislabel" textAnchor="middle">
          {t.label}
        </text>
      ))}
    </svg>
  );
}
