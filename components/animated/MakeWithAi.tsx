"use client";

// "Make it with AI" for one content plan post, or for a Calendar draft that is
// waiting for its video. Animated style: SOCIA writes the scenes, the person
// previews and edits them, and this browser renders the video and saves it as a
// draft in Create Post (or onto that Calendar draft, which keeps its day, time
// and caption). Nothing is posted from here.
import type { ScheduledPost } from "@/lib/scheduling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import { Loader2 } from "lucide-react";
import { Dialog, Button, ButtonLink, SegmentedControl, Field, Textarea } from "@/components/system";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ACCENTS, ANIMATED_FPS, ANIMATED_SIZE, specTimeline, type AnimatedScene, type AnimatedSpec, type AnimatedTheme } from "@/lib/animated/spec";
import { AnimatedComposition } from "./AnimatedComposition";

type Phase =
  | { kind: "writing" }
  | { kind: "ready" }
  | { kind: "rendering"; progress: number }
  | { kind: "uploading"; progress: number }
  | { kind: "saving" }
  | { kind: "done"; href: string }
  | { kind: "error"; message: string; canRetry: boolean };

const THEMES: { value: AnimatedTheme; label: string }[] = [
  { value: "ink", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "accent", label: "Colour" },
];

const SCENE_LABEL: Record<AnimatedScene["type"], string> = { hook: "Opening line", point: "Point", list: "List", quote: "Quote", cta: "Ending" };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? "SOCIA didn't answer. Check your connection and try again.");
  return j as T;
}

/** Where the video comes from: a plan post (a new draft is made) or a Calendar draft (the video goes onto it). */
export type MakeSource = { kind: "plan"; planId: string; index: number; day: string } | { kind: "draft"; postId: string; label: string };

export default function MakeWithAi({ open, onOpenChange, source, onAttached }: { open: boolean; onOpenChange: (o: boolean) => void; source: MakeSource; onAttached?: (post: ScheduledPost) => void }) {
  const ask = source.kind === "plan" ? { planId: source.planId, index: source.index } : { postId: source.postId };
  const askKey = JSON.stringify(ask);
  const [phase, setPhase] = useState<Phase>({ kind: "writing" });
  const [spec, setSpec] = useState<AnimatedSpec | null>(null);
  const abort = useRef<AbortController | null>(null);

  const write = useCallback(async () => {
    setPhase({ kind: "writing" }); setSpec(null);
    try {
      const r = await post<{ spec: AnimatedSpec }>("/api/animated/script", JSON.parse(askKey));
      setSpec(r.spec); setPhase({ kind: "ready" });
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message, canRetry: true });
    }
  }, [askKey]);

  // Write once when the dialog opens; closing it stops a render in progress.
  const started = useRef(false);
  useEffect(() => {
    if (open && !started.current) { started.current = true; void write(); }
    if (!open) abort.current?.abort();
  }, [open, write]);

  const total = useMemo(() => (spec ? specTimeline(spec).total : 1), [spec]);
  const busy = phase.kind === "rendering" || phase.kind === "uploading" || phase.kind === "saving";

  const setScene = (i: number, next: AnimatedScene) => setSpec((s) => (s ? { ...s, scenes: s.scenes.map((x, j) => (j === i ? next : x)) } : s));

  async function save() {
    if (!spec) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      setPhase({ kind: "rendering", progress: 0 });
      const { renderAnimated } = await import("./renderAnimated");
      const { blob } = await renderAnimated(spec, { signal: ctrl.signal, onProgress: (p) => setPhase({ kind: "rendering", progress: p }) });
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session ended. Sign in again, then save.");
      const path = `${user.id}/animated/${crypto.randomUUID()}.mp4`;
      setPhase({ kind: "uploading", progress: 0 });
      await uploadMedia(supabase, "scheduled-media", path, new File([blob], "video.mp4", { type: "video/mp4" }), (sent, all) => setPhase({ kind: "uploading", progress: all ? sent / all : 0 }));
      setPhase({ kind: "saving" });
      const caption = [spec.caption, spec.hashtags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
      const r = await post<{ href: string; post?: ScheduledPost }>("/api/animated/draft",
        source.kind === "plan" ? { path, caption, planId: source.planId, planDay: source.day } : { path, postId: source.postId });
      if (r.post) onAttached?.(r.post);
      setPhase({ kind: "done", href: r.href });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setPhase({ kind: "error", message: (e as Error).message, canRetry: false });
    }
  }

  const status =
    phase.kind === "rendering" ? `Making the video in this browser: ${Math.round(phase.progress * 100)}%`
    : phase.kind === "uploading" ? `Uploading: ${Math.round(phase.progress * 100)}%`
    : phase.kind === "saving" ? "Saving the draft"
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!busy) onOpenChange(o); }}
      title={`Make it with AI: ${source.kind === "plan" ? source.day : source.label}`}
      width={760}
      className="mwa"
      description={source.kind === "plan"
        ? "SOCIA writes the words from this plan post and animates them. Check the video and edit any line, then save it as a draft. Nothing posts until you schedule it."
        : "SOCIA writes the words from this draft's text and animates them. Check the video and edit any line, then add it to the draft. The draft keeps its day, time and caption, and nothing posts until you schedule it."}
      actions={
        phase.kind === "done" ? (
          <ButtonLink href={phase.href} variant="primary">Open the draft</ButtonLink>
        ) : (
          <>
            {spec && <Button onClick={() => void write()} disabled={busy || phase.kind === "writing"} title="Counts as another AI-made video">Write it again</Button>}
            <Button variant="primary" onClick={() => void save()} disabled={!spec || busy || phase.kind === "writing"} busy={busy}>{source.kind === "plan" ? "Save as draft" : "Add to the draft"}</Button>
          </>
        )
      }
    >
      {phase.kind === "writing" && <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> Writing the scenes from this post.</p>}
      {phase.kind === "error" && (
        <div className="mwa-status is-error" role="alert">
          <p>{phase.message}</p>
          {phase.canRetry && <Button size="sm" onClick={() => void write()}>Try again</Button>}
        </div>
      )}
      {status && <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> {status}</p>}
      {phase.kind === "done" && <p className="mwa-status" role="status">{source.kind === "plan" ? "Saved as a draft. Open it to pick a time and schedule it." : "The video is on the draft. Open it to check it and schedule it."}</p>}
      {spec && (
        <div className="mwa-body">
          <div className="mwa-preview">
            <Player
              component={AnimatedComposition}
              inputProps={{ spec }}
              durationInFrames={total}
              fps={ANIMATED_FPS}
              compositionWidth={ANIMATED_SIZE.width}
              compositionHeight={ANIMATED_SIZE.height}
              style={{ width: "100%", aspectRatio: "9 / 16" }}
              controls
              loop
              autoPlay
              acknowledgeRemotionLicense
            />
            <small>{Math.round(total / ANIMATED_FPS)} seconds, 9:16, no sound.</small>
          </div>
          <div className="mwa-edit">
            <SegmentedControl label="Background" options={THEMES} value={spec.theme} onChange={(theme) => setSpec((s) => (s ? { ...s, theme } : s))} />
            <div className="mwa-swatches" role="radiogroup" aria-label="Highlight colour">
              {ACCENTS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={spec.accent === c} aria-label={`Colour ${c}`} className={`mwa-swatch${spec.accent === c ? " is-on" : ""}`} style={{ background: c }} disabled={busy} onClick={() => setSpec((s) => (s ? { ...s, accent: c } : s))} />
              ))}
            </div>
            {spec.scenes.map((s, i) => (
              <Field key={i} label={SCENE_LABEL[s.type]} hint={s.type === "list" ? "First line is the title, then one item per line." : undefined}>
                {s.type === "list" ? (
                  <Textarea rows={Math.max(2, s.items.length + 1)} maxLength={400} disabled={busy} value={[s.title, ...s.items].join("\n")}
                    onChange={(e) => { const [title = "", ...items] = e.target.value.split("\n"); setScene(i, { ...s, title, items: items.slice(0, 4) }); }} />
                ) : (
                  <Textarea rows={2} maxLength={200} disabled={busy} value={s.text} onChange={(e) => setScene(i, { ...s, text: e.target.value } as AnimatedScene)} />
                )}
              </Field>
            ))}
            {source.kind === "plan" && <Field label="Caption" hint="Goes with the post, not on screen.">
              <Textarea rows={3} maxLength={2200} disabled={busy} value={[spec.caption, spec.hashtags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n")}
                onChange={(e) => setSpec((x) => (x ? { ...x, caption: e.target.value, hashtags: [] } : x))} />
            </Field>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
