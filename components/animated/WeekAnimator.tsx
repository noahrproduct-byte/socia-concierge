"use client";

// "Generate animated videos" for a whole content plan week:
// 1. SOCIA reads the week and says which days suit an animated video (and why);
//    the person can change the choice.
// 2. It writes each chosen day's video (one AI-made video each) and makes it in
//    this browser.
// 3. The person reviews all of them together and presses Schedule all: each
//    goes onto its day at the audience's hour. Nothing posts before that press.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Player } from "@remotion/player";
import { Loader2 } from "lucide-react";
import { Dialog, Button, Checkbox } from "@/components/system";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ANIMATED_FPS, ANIMATED_SIZE, specTimeline, type AnimatedSpec } from "@/lib/animated/spec";
import { AnimatedComposition } from "./AnimatedComposition";

type Pick = { index: number; day: string; animated: boolean; reason: string };
type Made = { index: number; day: string; spec: AnimatedSpec; blob: Blob; keep: boolean };
type Phase =
  | { kind: "picking" }
  | { kind: "choose" }
  | { kind: "making"; done: number; total: number; current: string; step: "writing" | "making" }
  | { kind: "review" }
  | { kind: "scheduling"; done: number; total: number }
  | { kind: "done"; scheduled: number; drafts: number; skipped: string[] }
  | { kind: "error"; message: string };

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error ?? "SOCIA didn't answer. Check your connection and try again."), { status: r.status });
  return j as T;
}

const whenLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "No time this week");

export default function WeekAnimator({ open, onOpenChange, planId, skip, whenFor, canSchedule, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  planId: string;
  /** Plan days already scheduled or posted: not offered. */
  skip: number[];
  /** When a day would post (the audience's hour that week), or null when that day has passed. */
  whenFor: (index: number) => string | null;
  canSchedule: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "picking" });
  const [picks, setPicks] = useState<Pick[]>([]);
  const [made, setMade] = useState<Made[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!open || started.current) return;
    started.current = true;
    post<{ days: Pick[] }>("/api/animated/week/pick", { planId, skip })
      .then((r) => { setPicks(r.days.map((d) => ({ ...d, animated: d.animated && whenFor(d.index) != null }))); setPhase({ kind: "choose" }); })
      .catch((e) => setPhase({ kind: "error", message: (e as Error).message }));
  }, [open, planId, skip, whenFor]);
  useEffect(() => () => abort.current?.abort(), []);

  const chosen = picks.filter((p) => p.animated);
  const busy = phase.kind === "making" || phase.kind === "scheduling" || phase.kind === "picking";

  async function make() {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const out: Made[] = [];
    setNote(null);
    const { renderAnimated } = await import("./renderAnimated");
    for (const [n, p] of chosen.entries()) {
      try {
        setPhase({ kind: "making", done: n, total: chosen.length, current: p.day, step: "writing" });
        const { spec } = await post<{ spec: AnimatedSpec }>("/api/animated/script", { planId, index: p.index }, ctrl.signal);
        setPhase({ kind: "making", done: n, total: chosen.length, current: p.day, step: "making" });
        const { blob } = await renderAnimated(spec, { signal: ctrl.signal });
        out.push({ index: p.index, day: p.day, spec, blob, keep: true });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        // Out of AI-made videos, or a day that failed: keep what was made and say why.
        setNote(`${p.day} wasn't made: ${(e as Error).message}`);
        if ((e as { status?: number }).status === 402 || (e as { status?: number }).status === 403) break;
      }
    }
    setMade(out);
    setPhase(out.length ? { kind: "review" } : { kind: "error", message: "No video was made. Try again in a moment." });
  }

  async function scheduleAll() {
    const keep = made.filter((m) => m.keep);
    if (!keep.length) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session ended. Sign in again, then schedule.");
      const items = [];
      for (const [n, m] of keep.entries()) {
        setPhase({ kind: "scheduling", done: n, total: keep.length });
        const path = `${user.id}/animated/${crypto.randomUUID()}.mp4`;
        await uploadMedia(supabase, "scheduled-media", path, new File([m.blob], "video.mp4", { type: "video/mp4" }));
        const caption = [m.spec.caption, m.spec.hashtags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
        items.push({ index: m.index, day: m.day, path, caption, scheduledAt: whenFor(m.index) });
      }
      setPhase({ kind: "scheduling", done: keep.length, total: keep.length });
      const r = await post<{ scheduled: number; drafts: number; skipped: string[] }>("/api/animated/week/schedule", { planId, items }, ctrl.signal);
      setPhase({ kind: "done", ...r });
      onDone();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  const title = "Generate animated videos";
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;
  if (phase.kind === "picking") {
    body = <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> Reading the week to see which days suit an animated video.</p>;
  } else if (phase.kind === "choose") {
    body = (
      <>
        <p className="wka-lead">SOCIA picked the days that work as an animated video. Days that need real footage are left for filming. Change any of them.</p>
        <ul className="wka-days">
          {picks.map((p) => {
            const when = whenFor(p.index);
            return (
              <li key={p.index}>
                <Checkbox checked={p.animated} disabled={!when} onChange={(e) => { const v = e.target.checked; setPicks((ps) => ps.map((x) => (x.index === p.index ? { ...x, animated: v } : x))); }} label={`${p.day}: ${when ? whenLabel(when) : "this day has passed"}`} />
                {p.reason && <small>{p.reason}</small>}
              </li>
            );
          })}
        </ul>
        {!picks.length && <p className="wka-lead">Every day of this plan is already scheduled, posted or turned down.</p>}
      </>
    );
    actions = <Button variant="primary" disabled={!chosen.length} onClick={() => void make()} title="Each video counts as one AI-made video">{chosen.length ? `Make ${chosen.length} video${chosen.length === 1 ? "" : "s"}` : "Choose a day"}</Button>;
  } else if (phase.kind === "making") {
    body = <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> {phase.step === "writing" ? "Writing" : "Making"} {phase.current} ({phase.done + 1} of {phase.total}). Keep this window open.</p>;
  } else if (phase.kind === "review" || phase.kind === "scheduling") {
    const n = made.filter((m) => m.keep).length;
    body = (
      <>
        <p className="wka-lead">{canSchedule ? "Check each video. Schedule all puts each one on its day; it posts at that time." : "Check each video. Your plan saves them to the Calendar as drafts; posting needs a plan with scheduling."}</p>
        <ul className="wka-grid">
          {made.map((m) => (
            <li key={m.index} className={m.keep ? "" : "is-off"}>
              <Player component={AnimatedComposition} inputProps={{ spec: m.spec }} durationInFrames={specTimeline(m.spec).total} initialFrame={45} fps={ANIMATED_FPS} compositionWidth={ANIMATED_SIZE.width} compositionHeight={ANIMATED_SIZE.height} style={{ width: "100%", aspectRatio: "9 / 16" }} controls loop acknowledgeRemotionLicense />
              <b>{m.day}</b>
              <small>{whenLabel(whenFor(m.index))}</small>
              <Checkbox checked={m.keep} disabled={phase.kind === "scheduling"} onChange={(e) => { const v = e.target.checked; setMade((ms) => ms.map((x) => (x.index === m.index ? { ...x, keep: v } : x))); }} label="Include" />
            </li>
          ))}
        </ul>
        {phase.kind === "scheduling" && <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> Uploading {Math.min(phase.done + 1, phase.total)} of {phase.total}.</p>}
      </>
    );
    actions = <Button variant="primary" disabled={!n || phase.kind === "scheduling"} busy={phase.kind === "scheduling"} onClick={() => void scheduleAll()}>{canSchedule ? `Schedule all ${n}` : `Save ${n} to the Calendar`}</Button>;
  } else if (phase.kind === "done") {
    const parts = [phase.scheduled ? `${phase.scheduled} scheduled` : null, phase.drafts ? `${phase.drafts} saved as drafts` : null].filter(Boolean).join(", ");
    body = (
      <p className="mwa-status" role="status">
        {parts || "Nothing new was added"}.{phase.skipped.length ? ` Left alone because they already had a video or were scheduled: ${phase.skipped.join(", ")}.` : ""}
      </p>
    );
    actions = <Link href="/plan/calendar" className="s-btn s-btn--primary">Open the Calendar</Link>;
  } else if (phase.kind === "error") {
    body = <p className="mwa-status is-error" role="alert">{phase.message}</p>;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }} title={title} width={820} className="mwa"
      description="SOCIA makes an animated video for each day that suits one. You see them all before anything is scheduled.">
      {body}
      {note && <p className="mwa-status is-error" role="alert">{note}</p>}
      {actions && <div className="s-dialog-actions">{actions}</div>}
    </Dialog>
  );
}
