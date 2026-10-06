"use client";
/* eslint-disable @next/next/no-img-element -- keyframes are short-lived signed URLs and local blob URLs; next/image cannot optimise them */

// Presentational pieces of Build from Clips: the clip grid, the understanding
// progress, the Content Yield, one opportunity's edit guide, and the project
// list. No fetching here — ClipsStudio owns the flow and hands these data.
import Link from "next/link";
import { FileVideo, AlertTriangle, Check, Clock, Trash2, ChevronLeft, Copy, ArrowRight, Scissors, Type, SunMedium, Volume2, Captions, Music, Timer, Flag, Loader2, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import type { GuideStep, Opportunity, StudioBuild, StudioClip, UnderstandProgress, YieldResult } from "@/lib/studioClips/types";
import { clipLabel, fmtClock } from "@/lib/studioClips/types";
import { evidenceLine, yieldHeadline } from "@/lib/studioClips/yield";
import type { ProjectSummary } from "@/lib/studioClips/server";

export type LocalPhase = "reading" | "registering" | "analyzing" | "uploading" | "done" | "error" | "duplicate";

/** A clip as the page tracks it: server row when there is one, plus what the browser is doing to it. */
export type LocalClip = {
  key: string;
  name: string;
  phase: LocalPhase;
  /** 0..1 inside the current phase */
  progress: number;
  stageNote: string | null;
  error: string | null;
  thumb: string | null;
  clip: StudioClip | null;
  durationSec: number | null;
  reused: boolean;
};

const fmtMb = (b: number) => `${(b / 1024 / 1024).toFixed(b >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
export const fmtMinutes = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min` : `${Math.round(s)} sec`);

export function ClipGrid({ clips, onRemove, busy }: { clips: LocalClip[]; onRemove: (c: LocalClip) => void; busy: boolean }) {
  return (
    <ul className="cb-grid">
      {clips.map((c) => {
        const pos = c.clip?.position ?? clips.indexOf(c);
        const facts = c.clip?.facts;
        const flags = [
          facts?.visual?.brightness === "dark" ? "dark" : facts?.visual?.brightness === "bright" ? "bright" : null,
          facts?.audio?.level === "quiet" ? "quiet audio" : facts?.audio?.level === "silent" ? "no sound" : facts?.audio?.hasAudio === false ? "no audio track" : null,
        ].filter(Boolean) as string[];
        return (
          <li key={c.key} className={`cb-clip ${c.phase}`}>
            <div className="cb-clip-thumb">
              {c.thumb ? <img src={c.thumb} alt="" /> : <span className="cb-clip-ph"><FileVideo size={18} /></span>}
              {c.durationSec != null && <small className="cb-clip-dur">{fmtClock(c.durationSec)}</small>}
              {c.phase !== "done" && c.phase !== "error" && c.phase !== "duplicate" && (
                <span className="cb-clip-progress" aria-hidden><i style={{ width: `${Math.round(c.progress * 100)}%` }} /></span>
              )}
            </div>
            <div className="cb-clip-meta">
              <b>{clipLabel(pos)}</b>
              <small title={c.name}>{c.name}</small>
              {c.phase === "done" ? (
                <span className="cb-clip-state ok"><Check size={11} /> {c.reused ? "Analysis reused" : c.clip?.card ? "Understood" : "Ready"}{flags.length ? ` · ${flags.join(", ")}` : ""}</span>
              ) : c.phase === "error" ? (
                <span className="cb-clip-state bad"><AlertTriangle size={11} /> {c.error ?? "Failed"}</span>
              ) : c.phase === "duplicate" ? (
                <span className="cb-clip-state"><Clock size={11} /> Already in this project</span>
              ) : (
                <span className="cb-clip-state"><Loader2 size={11} className="spin" /> {c.stageNote ?? phaseCopy(c.phase)}</span>
              )}
            </div>
            {(c.phase === "done" || c.phase === "error" || c.phase === "duplicate") && (
              <button type="button" className="cb-clip-x" aria-label={`Remove ${clipLabel(pos)}`} disabled={busy} onClick={() => onRemove(c)}><Trash2 size={13} /></button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function phaseCopy(p: LocalPhase): string {
  switch (p) {
    case "reading": return "Reading the file";
    case "registering": return "Checking your plan";
    case "analyzing": return "Measuring picture and sound";
    case "uploading": return "Uploading";
    default: return "";
  }
}

const STAGES: { id: UnderstandProgress["stage"]; label: string }[] = [
  { id: "transcribing", label: "Transcribing speech" },
  { id: "understanding", label: "Understanding footage" },
  { id: "grouping", label: "Grouping related clips" },
  { id: "building", label: "Building post opportunities" },
];

export function UnderstandCard({ progress, clipCount }: { progress: UnderstandProgress | null; clipCount: number }) {
  const idx = progress ? STAGES.findIndex((s) => s.id === progress.stage) : 0;
  // Transcription runs before cards; a run with nothing to transcribe skips that line.
  const stages = progress?.stage === "transcribing" || (progress?.transcribing ?? 0) > 0 || idx > 0 ? STAGES : STAGES.filter((s) => s.id !== "transcribing");
  return (
    <div className="ov-card st-progress cb-understand" aria-live="polite">
      <b>SOCIA is understanding your footage</b>
      <ul>
        {stages.map((s) => {
          const i = STAGES.findIndex((x) => x.id === s.id);
          const state = !progress ? (i === 1 ? "on" : "") : i < idx ? "done" : i === idx ? "on" : "";
          let detail = "";
          if (progress && s.id === "understanding") detail = ` ${Math.min(progress.done, progress.total)}/${progress.total || clipCount}`;
          if (progress && s.id === "transcribing" && progress.stage === "transcribing") detail = progress.transcribing ? ` · ${progress.transcribing} clip${progress.transcribing === 1 ? "" : "s"} at the transcriber` : "";
          return <li key={s.id} className={state}><i />{s.label}{detail}</li>;
        })}
      </ul>
      <p className="ov-source">
        {progress?.noTranscription ? "No transcription service is configured, so clips are understood from their frames and measured sound only. " : ""}
        Each clip is understood once and remembered; adding clips later only costs the new ones. Usually one to three minutes.
      </p>
    </div>
  );
}

export function YieldView({ y, clips, builds, onOpen, onAddMore, stale }: { y: YieldResult; clips: StudioClip[]; builds: number[]; onOpen: (o: Opportunity) => void; onAddMore: () => void; stale: boolean }) {
  const byId = new Map(clips.map((c) => [c.id, c]));
  return (
    <div className="cb-yield">
      <div className="ov-card cb-hero">
        <h2>{yieldHeadline(y)}</h2>
        {y.summary && <p>{y.summary}</p>}
        <div className="cb-hero-meta">
          <span>{fmtMinutes(y.footageSec)} of footage</span>
          <span>{y.rejected.length ? `${y.rejected.length} idea${y.rejected.length === 1 ? "" : "s"} didn't have enough distinct footage` : "Every idea had enough footage"}</span>
          <button type="button" className="ov-btn ghost small" onClick={onAddMore}>Add more clips</button>
        </div>
        {stale && <p className="cb-stale"><AlertTriangle size={12} /> Footage changed since these results — understand it again to refresh them.</p>}
      </div>

      {y.opportunities.length > 0 && (
        <ul className="cb-opps">
          {y.opportunities.map((o) => (
            <li key={o.idx} className={`ov-card cb-opp ${o.strength}`}>
              <div className="cb-opp-head">
                <span className={`cb-badge ${o.strength}`}>{o.strength === "strong" ? "Strong post" : "Possible post"}</span>
                {builds.includes(o.idx) && <span className="cb-badge built"><Check size={11} /> Guide ready</span>}
              </div>
              <h3>{o.title}</h3>
              <p className="cb-opp-angle">{o.angle}</p>
              <p className="cb-evidence">{evidenceLine(o).split(" · ").map((part, i) => <span key={i}>{part}</span>)}</p>
              <ul className="cb-opp-clips">
                {o.clipIds.slice(0, 6).map((id) => {
                  const c = byId.get(id);
                  return <li key={id} title={c ? `${clipLabel(c.position)} · ${c.name}` : id}>{c?.frames[0]?.url ? <img src={c.frames[0].url} alt="" /> : <span className="cb-clip-ph small"><FileVideo size={12} /></span>}<small>{c ? clipLabel(c.position) : "?"}</small></li>;
                })}
                {o.clipIds.length > 6 && <li className="cb-more">+{o.clipIds.length - 6}</li>}
              </ul>
              <button type="button" className="ov-btn primary small" onClick={() => onOpen(o)}>{builds.includes(o.idx) ? "Open the edit guide" : "Show me how to make it"} <ArrowRight size={13} /></button>
            </li>
          ))}
        </ul>
      )}

      {y.rejected.length > 0 && (
        <div className="ov-card cb-rejected">
          <h3>Didn't make the cut</h3>
          <ul>{y.rejected.map((r, i) => <li key={i}><b>{r.title}</b><span>{r.reason}</span></li>)}</ul>
          <p className="ov-source">An idea is shown only when its clips add up to enough distinct, usable footage. These didn't — more clips of the same moment would change that.</p>
        </div>
      )}
    </div>
  );
}

const STEP_ICON: Record<GuideStep["kind"], ReactNode> = {
  cut: <Scissors size={13} />, text: <Type size={13} />, enhance: <SunMedium size={13} />, audio: <Volume2 size={13} />,
  captions: <Captions size={13} />, music: <Music size={13} />, length: <Timer size={13} />, ending: <Flag size={13} />,
};

export function OpportunityView({ o, build, clips, loading, error, onBack, onRetry }: { o: Opportunity; build: StudioBuild | null; clips: StudioClip[]; loading: boolean; error: string | null; onBack: () => void; onRetry: () => void }) {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const guideText = build ? build.guide.map((s) => `${s.n}. ${s.text}`).join("\n") : "";
  const createHref = build?.caption ? `/create?caption=${encodeURIComponent(build.caption)}&source=studio` : "/create?source=studio";
  return (
    <div className="cb-opp-view">
      <button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> All posts</button>
      <div className="ov-card cb-opp-detail">
        <div className="cb-opp-head"><span className={`cb-badge ${o.strength}`}>{o.strength === "strong" ? "Strong post" : "Possible post"}</span></div>
        <h2>{o.title}</h2>
        <p className="cb-opp-angle">{o.angle}</p>
        <p className="cb-evidence">{evidenceLine(o).split(" · ").map((part, i) => <span key={i}>{part}</span>)}</p>
        <ul className="cb-moments">
          {o.moments.map((m, i) => {
            const c = byId.get(m.clipId);
            const frame = c?.frames.reduce<{ t: number; url: string } | null>((best, f) => (f.t >= m.start && f.t <= m.end && (!best || f.t < best.t) ? f : best), null) ?? c?.frames[0] ?? null;
            return (
              <li key={i}>
                {frame ? <img src={frame.url} alt="" /> : <span className="cb-clip-ph small"><FileVideo size={12} /></span>}
                <span><b>{c ? clipLabel(c.position) : "Clip"}</b><small>{fmtClock(m.start)}–{fmtClock(m.end)}</small></span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ov-card cb-guide">
        <div className="st-block-head">
          <h3><Scissors size={14} /> How to make it</h3>
          {build && <button type="button" className="ov-btn ghost small" onClick={() => navigator.clipboard?.writeText(guideText)}><Copy size={12} /> Copy steps</button>}
        </div>
        {loading && (
          <ul className="st-progress"><li className="on"><i />Writing the edit guide from the chosen moments</li></ul>
        )}
        {error && !loading && (
          <div className="st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Couldn't write the guide</b><p>{error}</p><button type="button" className="ov-btn ghost small" onClick={onRetry}>Try again</button></div></div>
        )}
        {build && !loading && (
          <>
            {build.footageExpired && <p className="cb-stale"><AlertTriangle size={12} /> Some of this post's raw footage has expired; the steps still describe it.</p>}
            <ol className="cb-steps">
              {build.guide.map((s) => {
                const c = s.clipId ? byId.get(s.clipId) : null;
                const frame = c?.frames.find((f) => s.range && f.t >= s.range[0] && f.t <= s.range[1]) ?? c?.frames[0] ?? null;
                return (
                  <li key={s.n} className={`k-${s.kind}`}>
                    <span className="cb-step-ico">{STEP_ICON[s.kind]}</span>
                    <span className="cb-step-text">{s.text}</span>
                    {frame && <img className="cb-step-thumb" src={frame.url} alt="" />}
                  </li>
                );
              })}
            </ol>
            {build.edl.notes.length > 0 && <ul className="cb-notes">{build.edl.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            {build.caption && (
              <div className="cb-caption">
                <b>Caption</b>
                <p>{build.caption}</p>
                <div className="st-row-actions">
                  <button type="button" className="ov-btn ghost small" onClick={() => navigator.clipboard?.writeText(build.caption!)}><Copy size={12} /> Copy caption</button>
                  <Link className="ov-btn ghost small" href={createHref}>Start this post in Create Post <ArrowRight size={12} /></Link>
                </div>
              </div>
            )}
            <p className="ov-source">Times are inside each clip. Cuts avoid the middle of words when a transcript exists. Picture and sound fixes are listed only where the measurements support them. Music is a recommendation — SOCIA never adds a track.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function ProjectList({ projects, onOpen, onDelete, busy }: { projects: ProjectSummary[]; onOpen: (id: string) => void; onDelete: (id: string) => void; busy: boolean }) {
  if (!projects.length) return null;
  return (
    <div className="ov-card cb-projects">
      <div className="ov-card-head"><h2><FolderOpen size={15} /> Your clip projects</h2></div>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={busy} onClick={() => onOpen(p.id)}>
              <span>
                <b>{p.title || `Project from ${new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</b>
                <small>{p.clips} clip{p.clips === 1 ? "" : "s"}{p.posts != null ? ` · ${p.posts} post${p.posts === 1 ? "" : "s"} found` : p.status === "understanding" ? " · understanding…" : ""} · {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
              </span>
            </button>
            <button type="button" className="cb-clip-x" aria-label="Delete project" disabled={busy} onClick={() => onDelete(p.id)}><Trash2 size={13} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
