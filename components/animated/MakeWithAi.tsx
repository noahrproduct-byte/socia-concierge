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
import { Dialog, Button, ButtonLink, SegmentedControl, Field, Input, Textarea, Checkbox } from "@/components/system";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ACCENTS, ANIMATED_FPS, ANIMATED_SIZE, specTimeline, type AnimatedCompare, type AnimatedCounter, type AnimatedScene, type AnimatedSpec, type AnimatedTheme, type CompareHeadline } from "@/lib/animated/spec";
import { AnimatedComposition } from "./AnimatedComposition";
import type { Storyboard } from "@/lib/animated/board";

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

  // Change it in the person's own words: SOCIA writes the whole video again with that change.
  const [changeText, setChangeText] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeErr, setChangeErr] = useState<string | null>(null);
  async function change() {
    if (!spec || !changeText.trim()) return;
    setChanging(true); setChangeErr(null);
    try {
      const r = await post<{ spec: AnimatedSpec }>("/api/animated/script", { ...JSON.parse(askKey), change: changeText.trim(), current: spec });
      setSpec(r.spec); setChangeText("");
    } catch (e) {
      setChangeErr((e as Error).message);
    } finally { setChanging(false); }
  }

  const total = useMemo(() => (spec ? specTimeline(spec).total : 1), [spec]);
  const busy = phase.kind === "rendering" || phase.kind === "uploading" || phase.kind === "saving";

  const setScene = (i: number, next: AnimatedScene) => setSpec((s) => (s ? { ...s, scenes: s.scenes.map((x, j) => (j === i ? next : x)) } : s));
  const setCompare = (patch: Partial<AnimatedCompare>) => setSpec((s) => (s?.compare ? { ...s, compare: { ...s.compare, ...patch } } : s));
  const setCounter = (patch: Partial<AnimatedCounter>) => setSpec((s) => (s?.counter ? { ...s, counter: { ...s.counter, ...patch } } : s));

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
        ? "SOCIA writes an animated video from this plan post. Check it and edit any line or number, then save it as a draft. Nothing posts until you schedule it."
        : "SOCIA writes an animated video from this draft's text. Check it and edit any line or number, then add it to the draft. The draft keeps its day, time and caption, and nothing posts until you schedule it."}
      actions={
        phase.kind === "done" ? (
          <ButtonLink href={phase.href} variant="primary">Open the draft</ButtonLink>
        ) : (
          <>
            {spec && <Button onClick={() => void write()} disabled={busy || phase.kind === "writing"} title="Counts as another animated video">Write it again</Button>}
            <Button variant="primary" onClick={() => void save()} disabled={!spec || busy || phase.kind === "writing"} busy={busy}>{source.kind === "plan" ? "Save as draft" : "Add to the draft"}</Button>
          </>
        )
      }
    >
      {phase.kind === "writing" && <p className="mwa-status" role="status"><Loader2 size={14} className="spin" aria-hidden /> Writing the video from this post.</p>}
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
              initiallyMuted
              acknowledgeRemotionLicense
            />
            <small>{Math.round(total / ANIMATED_FPS)} seconds, 9:16, with sound effects (unmute the preview to hear them).{spec.board ? " Made for your account." : spec.compare ? " Comparison style." : spec.counter ? " Counter style." : ""}</small>
          </div>
          <div className="mwa-edit">
            {spec.review && (spec.review.passed
              ? <p className="mwa-check ok">SOCIA checked it: one clear point, aimed at your goal{spec.cta ? ", with your call to action at the end" : ""}.</p>
              : spec.review.problems.length > 0 && (
                <div className="mwa-check">
                  <b>SOCIA&apos;s check still found:</b>
                  <ul>{spec.review.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <small>Fix it below, or tell SOCIA what to change.</small>
                </div>
              ))}
            <Field label="Tell SOCIA what to change" hint="It writes the whole video again with your change. This doesn't use another animated video.">
              <Textarea rows={2} maxLength={300} disabled={busy || changing} value={changeText} placeholder="e.g. Make it about joining the waitlist, use the tutorial style, shorter headlines" onChange={(e) => setChangeText(e.target.value)} />
            </Field>
            <div className="mwa-change">
              <Button size="sm" onClick={() => void change()} busy={changing} disabled={busy || changing || !changeText.trim()}>Change it</Button>
              {changeErr && <small role="alert">{changeErr}</small>}
            </div>
            {spec.cta && (
              <>
                <Field label="Ending line" hint="Names what you do. Shown instead of the comment question.">
                  <Input maxLength={140} disabled={busy} value={spec.cta.line} onChange={(e) => setSpec((x) => (x?.cta ? { ...x, cta: { ...x.cta, line: e.target.value } } : x))} />
                </Field>
                <Field label="Call to action">
                  <Input maxLength={60} disabled={busy} value={spec.cta.action} onChange={(e) => setSpec((x) => (x?.cta ? { ...x, cta: { ...x.cta, action: e.target.value } } : x))} />
                </Field>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSpec((x) => (x ? { ...x, cta: null } : x))}>End on a comment question instead</Button>
              </>
            )}
            {spec.look ? (
              <p className="mwa-note">Drawn in your video style. Change it in Settings, under Your video style.</p>
            ) : (
            <>
            <SegmentedControl label="Background" options={spec.compare || spec.counter ? THEMES.filter((x) => x.value !== "accent") : THEMES} value={spec.theme} onChange={(theme) => setSpec((s) => (s ? { ...s, theme } : s))} />
            <div className="mwa-swatches" role="radiogroup" aria-label="Highlight colour">
              {ACCENTS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={spec.accent === c} aria-label={`Colour ${c}`} className={`mwa-swatch${spec.accent === c ? " is-on" : ""}`} style={{ background: c }} disabled={busy} onClick={() => setSpec((s) => (s ? { ...s, accent: c } : s))} />
              ))}
            </div>
            </>
            )}
            {spec.board && <BoardFields board={spec.board} busy={busy} onChange={(board) => setSpec((x) => (x ? { ...x, board } : x))} />}
            {spec.compare && <CompareFields compare={spec.compare} busy={busy} onChange={setCompare} />}
            {spec.counter && <CounterFields counter={spec.counter} busy={busy} onChange={setCounter} />}
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

/** Edit a storyboard's words: each caption phrase and the ending card. What is on the stage changes through "Tell SOCIA what to change". */
function BoardFields({ board, busy, onChange }: { board: Storyboard; busy: boolean; onChange: (b: Storyboard) => void }) {
  const setPhrase = (i: number, text: string) => onChange({ ...board, phrases: board.phrases.map((p, k) => (k === i ? { ...p, text } : p)) });
  const setRow = (i: number, patch: Partial<Storyboard["end"]["rows"][number]>) => onChange({ ...board, end: { ...board.end, rows: board.end.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) } });
  return (
    <>
      <Field label="Captions" hint="One line each, in order. Each appears word by word.">
        <div className="mwa-phrases">
          {board.phrases.map((p, i) => <Input key={i} aria-label={`Caption ${i + 1}`} maxLength={90} disabled={busy} value={p.text} onChange={(e) => setPhrase(i, e.target.value)} />)}
        </div>
      </Field>
      <Field label="Ending title" hint="Two lines.">
        <Textarea rows={2} maxLength={60} disabled={busy} value={board.end.title.join("\n")} onChange={(e) => { const [a = "", b = ""] = e.target.value.split("\n"); onChange({ ...board, end: { ...board.end, title: [a, b] } }); }} />
      </Field>
      {board.end.rows.map((r, i) => (
        <Field key={i} label={`Ending line ${i + 1}`}>
          <Input maxLength={70} disabled={busy} value={[r.a, r.b].filter(Boolean).join(" / ")} onChange={(e) => { const [a = "", b = ""] = e.target.value.split(" / "); setRow(i, { a, b }); }} />
        </Field>
      ))}
    </>
  );
}

const HEADLINE_LABEL: [keyof Pick<AnimatedCompare, "hook" | "turn" | "close">, string][] = [["hook", "Opening headline"], ["turn", "Second headline"], ["close", "Last headline"]];

/** Edit the comparison: headlines, each column's label, value and stamp, the end question. */
function CompareFields({ compare, busy, onChange }: { compare: AnimatedCompare; busy: boolean; onChange: (patch: Partial<AnimatedCompare>) => void }) {
  const setHeadline = (k: "hook" | "turn" | "close", text: string) => {
    const [a = "", b = ""] = text.split("\n");
    const h: CompareHeadline = { lines: [a, b], key: compare[k].key };
    onChange({ [k]: h });
  };
  return (
    <>
      {HEADLINE_LABEL.map(([k, label]) => (
        <Field key={k} label={label} hint="Two lines.">
          <Textarea rows={2} maxLength={120} disabled={busy} value={compare[k].lines.join("\n")} onChange={(e) => setHeadline(k, e.target.value)} />
        </Field>
      ))}
      {compare.columns.map((c, i) => (
        <div key={i} className="mwa-col">
          <Field label={`Column ${i + 1}`}>
            <Input maxLength={30} disabled={busy} value={c.label} onChange={(e) => onChange({ columns: compare.columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
          </Field>
          <Field label={compare.format === "clock" ? "Seconds" : compare.unit ? `Value (${compare.unit})` : "Value"}>
            <Input type="number" min={0} step="any" disabled={busy} value={String(c.value)}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange({ columns: compare.columns.map((x, j) => (j === i ? { ...x, value: v } : x)) }); }} />
          </Field>
          <Field label="Stamp">
            <Input maxLength={20} disabled={busy} value={c.stamp} onChange={(e) => onChange({ columns: compare.columns.map((x, j) => (j === i ? { ...x, stamp: e.target.value.toUpperCase() } : x)) })} />
          </Field>
        </div>
      ))}
      <Checkbox checked={compare.illustrative} disabled={busy} onChange={(e) => onChange({ illustrative: e.target.checked })}
        label={"Show \u201cExample numbers\u201d on the video"} />
      <Field label="Question at the end">
        <Input maxLength={60} disabled={busy} value={compare.question} onChange={(e) => onChange({ question: e.target.value })} />
      </Field>
    </>
  );
}

/** Edit the counter: headlines, each round's label, title and value, what it counts, the end question. */
function CounterFields({ counter, busy, onChange }: { counter: AnimatedCounter; busy: boolean; onChange: (patch: Partial<AnimatedCounter>) => void }) {
  const setHeadline = (k: "hook" | "close", text: string) => {
    const [a = "", b = ""] = text.split("\n");
    onChange({ [k]: { lines: [a, b], key: counter[k].key } as CompareHeadline });
  };
  const setRound = (i: number, patch: Partial<AnimatedCounter["rounds"][number]>) => onChange({ rounds: counter.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <>
      <Field label="Opening headline" hint="Two lines.">
        <Textarea rows={2} maxLength={120} disabled={busy} value={counter.hook.lines.join("\n")} onChange={(e) => setHeadline("hook", e.target.value)} />
      </Field>
      {counter.rounds.map((r, i) => (
        <div key={i} className="mwa-col">
          <Field label={r.label || `Round ${i + 1}`}>
            <Input maxLength={40} disabled={busy} value={r.title} onChange={(e) => setRound(i, { title: e.target.value })} />
          </Field>
          <Field label={counter.format === "clock" ? "Seconds" : counter.unit ? `Value (${counter.unit})` : "Value"}>
            <Input type="number" min={0} step="any" disabled={busy} value={String(r.value)}
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setRound(i, { value: v }); }} />
          </Field>
          <Field label="Headline after">
            <Input maxLength={60} disabled={busy} value={r.result.lines.join(" / ")}
              onChange={(e) => { const [a = "", b = ""] = e.target.value.split(" / "); setRound(i, { result: { lines: [a, b], key: r.result.key } }); }} />
          </Field>
        </div>
      ))}
      <Field label="What it counts">
        <Input maxLength={30} disabled={busy} value={counter.measure} onChange={(e) => onChange({ measure: e.target.value })} />
      </Field>
      <Field label="Last headline" hint="Two lines.">
        <Textarea rows={2} maxLength={120} disabled={busy} value={counter.close.lines.join("\n")} onChange={(e) => setHeadline("close", e.target.value)} />
      </Field>
      <Checkbox checked={counter.illustrative} disabled={busy} onChange={(e) => onChange({ illustrative: e.target.checked })}
        label={"Show \u201cExample numbers\u201d on the video"} />
      <Field label="Question at the end">
        <Input maxLength={60} disabled={busy} value={counter.question} onChange={(e) => onChange({ question: e.target.value })} />
      </Field>
    </>
  );
}
