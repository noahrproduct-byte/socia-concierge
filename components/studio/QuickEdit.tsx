"use client";

// The one-drop edit: the first screen of the Video editor. Raw footage in, a
// finished video out, without another click. Two ways to a cut, chosen by
// what is in the footage, and both made of what the editor already has:
//   - one clip of someone talking: the clip becomes its own cut, its words
//     arrive, the pauses and repeated takes come out (lib/studioClips/quickEdit.ts
//     quickCut). Nothing is counted against the plan.
//   - several clips, or a clip where no one speaks: SOCIA understands what is
//     in the picture and makes the cut from it (the Video editor's own
//     "understand" and "brief" routes, which count on the plan as they do
//     there), then quickLook.
// Either way the look goes on, the music the person picked goes in with the
// cuts on its beat, the graphics its own words support are placed
// (lib/studioClips/scenes.ts), and the video is rendered in this browser and
// watched (components/studio/renderBuild.ts). ClipsStudio owns the uploads.
// Every step shows what was really measured; a step with nothing to report
// says nothing. No timer, no estimate, no invented score.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Columns2, Download, Loader2, RefreshCw, Scissors, Upload } from "lucide-react";
import { animate, motion, useReducedMotion } from "framer-motion";
import "./quick-edit.css";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { fileLabel } from "@/lib/publishing/postLabel";
import { cutSpeaks, startLevels } from "@/lib/music/taste";
import type { Track } from "@/lib/music/tracks";
import { beatOfTrack } from "@/lib/studioClips/beatClient";
import { AUTO_IMPROVE_TIMEOUT_MS } from "@/lib/studioClips/enhancePrompt";
import { PICTURE_BRIEF, quickCut, quickLook, quickStats, rawOf, type QuickStats } from "@/lib/studioClips/quickEdit";
import { renderFaults, type RenderReport } from "@/lib/studioClips/renderCheck";
import { DEFAULT_THEME_ID, THEMES, themeById } from "@/lib/studioClips/themes";
import { OUTPUT, type BuildPlayerData, type Edl, type StudioBuild } from "@/lib/studioClips/types";
import type { LocalClip } from "./ClipsViews";
import { renderBlocker, renderBuild } from "./renderBuild";

type Stage = "upload" | "words" | "picture" | "cut" | "render" | "check" | "done" | "error";
type Result = { buildId: string; title: string; blob: Blob; url: string; rawUrl: string | null; stats: QuickStats; clips: number; clipsUsed: number; picture: boolean; notes: string[]; lines: string[]; report: RenderReport | null; edl: Edl; look: string; music: string | null; width: number; height: number };
type Draft = { phase: "idle" } | { phase: "saving"; progress: number } | { phase: "saved"; postId: string } | { phase: "error"; message: string };
type Choice = { look: string; trackId: string; scenes: boolean; behind: boolean };

const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const isVideo = (f: File) => f.type.startsWith("video/") || VIDEO_RE.test(f.name);
/** The words are asked for again this often, for this long (five minutes), as the editor does. */
const WORDS_EVERY_MS = 3000, WORDS_TRIES = 100;
/** Several clips at once on a plan without SOCIA's own cuts. */
export const MANY_LOCKED = "Making one video from several clips is included from Starter. On your plan, drop one clip at a time, or use the full editor to cut them by hand.";
const LOOK_KEY = "socia.quickEdit.look", SCENES_KEY = "socia.quickEdit.scenes", BEHIND_KEY = "socia.quickEdit.behind";

const secs = (n: number) => `${n.toFixed(1)} s`;
const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); const e = new Error("Stopped."); e.name = "AbortError"; reject(e); }, { once: true });
});
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** A number that runs to its new value instead of jumping (the big percent). Still when motion is reduced. */
function Count({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) { setShown(value); from.current = value; return; }
    const run = animate(from.current, value, { duration: 0.5, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => run.stop();
  }, [value, reduced]);
  return <>{shown}</>;
}
const usable = (l: LocalClip) => l.phase === "done" && !!l.clip && (l.clip.status === "uploaded" || l.clip.status === "ready");

export default function QuickEdit({ locals, uploading, projectId, canTranscribe, canPicture, drag, onPick, understand, onOpenEditor, onReset, onFull }: {
  /** the dropped clips as ClipsStudio tracks them (their measuring and upload); empty before anything is dropped */
  locals: LocalClip[];
  /** clips are still being measured or uploaded */
  uploading: boolean;
  projectId: string | null;
  /** false: no transcription service on this server, so the words are not waited for; null: not known yet */
  canTranscribe: boolean | null;
  /** the plan includes a cut made by SOCIA from what is in the clips; null: not known yet */
  canPicture: boolean | null;
  /** a file is being dragged over the page */
  drag: boolean;
  onPick: (files: File[]) => void;
  /** SOCIA understands the clips (ClipsStudio's own job and its plan rules); an error to show, or null when it is done */
  understand: (say: (step: string) => void) => Promise<string | null>;
  onOpenEditor: (buildId: string, title: string) => void;
  /** back to the empty drop screen */
  onReset: () => void;
  /** the full editor: a prompt, a video to copy, an edit by hand */
  onFull: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  // Motion: each screen eases in, its parts one after another; a finished step's tick pops. None of it when motion is reduced.
  const reduced = useReducedMotion();
  const rise = (i = 0) => (reduced ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, ease: EASE_OUT, delay: 0.07 * i } });
  const grow = reduced ? {} : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.6, ease: EASE_OUT } };
  const pop = reduced ? {} : { initial: { scale: 0.3 }, animate: { scale: 1 }, transition: { type: "spring" as const, stiffness: 520, damping: 18 } };
  const [look, setLook] = useState<string>(DEFAULT_THEME_ID);
  const [scenesOn, setScenesOn] = useState(true);
  const [behindOn, setBehindOn] = useState(true);
  const [trackId, setTrackId] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => {
    try {
      const kept = window.localStorage.getItem(LOOK_KEY);
      if (kept && themeById(kept)) setLook(kept);
      if (window.localStorage.getItem(SCENES_KEY) === "off") setScenesOn(false);
      if (window.localStorage.getItem(BEHIND_KEY) === "off") setBehindOn(false);
    } catch { /* private mode: the defaults */ }
    let alive = true;
    // The person's own playlist (the Sound tool's): a sound from it can go in with the cut.
    fetch("/api/studio/tracks").then((r) => (r.ok ? r.json() : null)).then((j: { tracks?: Track[] } | null) => { if (alive && j?.tracks) setTracks(j.tracks); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const pickLook = (id: string) => { setLook(id); try { window.localStorage.setItem(LOOK_KEY, id); } catch { /* not kept */ } };
  const pickScenes = (on: boolean) => { setScenesOn(on); try { window.localStorage.setItem(SCENES_KEY, on ? "on" : "off"); } catch { /* not kept */ } };
  const pickBehind = (on: boolean) => { setBehindOn(on); try { window.localStorage.setItem(BEHIND_KEY, on ? "on" : "off"); } catch { /* not kept */ } };
  const theme = themeById(look) ?? themeById(DEFAULT_THEME_ID)!;

  // Whether this browser can render at all, asked once, before anything is uploaded.
  const [blocker, setBlocker] = useState<string | null>(null);
  useEffect(() => { let alive = true; renderBlocker(OUTPUT.width, OUTPUT.height).then((b) => { if (alive) setBlocker(b); }).catch(() => {}); return () => { alive = false; }; }, []);

  const [stage, setStage] = useState<Stage>("upload");
  const [progress, setProgress] = useState(0);
  const [picture, setPicture] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [heard, setHeard] = useState<{ words: number | null; note: string | null } | null>(null);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The step that was running when it failed, so the list shows how far it got. */
  const [failedAt, setFailedAt] = useState<Stage | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [compare, setCompare] = useState(false);
  const [draft, setDraft] = useState<Draft>({ phase: "idle" });
  const [pickNote, setPickNote] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const buildId = useRef<string | null>(null);
  /** The cut before any look went on it (the whole clip, or SOCIA's cut from the picture): another look starts from it again. */
  const base = useRef<Edl | null>(null);
  const viaPicture = useRef(false);
  /** The sound this screen put in the cut last, so a go without music takes it out again. */
  const musicIn = useRef<string | null>(null);
  const started = useRef(false);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { abort.current?.abort(); for (const u of urls.current) URL.revokeObjectURL(u); }, []);

  const ready = locals.filter(usable);
  const failed = locals.filter((l) => l.phase === "error" || l.phase === "duplicate");
  const settled = locals.length > 0 && !uploading && locals.every((l) => usable(l) || l.phase === "error" || l.phase === "duplicate");
  const many = locals.length > 1;
  const title = many ? `${fileLabel(locals[0]?.name) ?? "Your video"} and ${locals.length - 1} more` : fileLabel(locals[0]?.name) ?? locals[0]?.name ?? "Your video";
  const clipIds = ready.map((l) => l.clip!.id).join(",");

  const run = useCallback(async (choice: Choice) => {
    const ids = clipIds ? clipIds.split(",") : [];
    if (!projectId || !ids.length) return;
    const chosen = themeById(choice.look) ?? themeById(DEFAULT_THEME_ID)!;
    abort.current?.abort();
    const ctrl = new AbortController(); abort.current = ctrl;
    const { signal } = ctrl;
    setError(null); setFailedAt(null); setResult(null); setCompare(false); setDraft({ phase: "idle" }); setProgress(0); setStep(null);
    let cur: Stage = "words";
    const go = (s: Stage) => { cur = s; setStage(s); };
    const call = (url: string, init?: RequestInit) => fetch(url, { ...init, signal }).catch((e) => { if ((e as Error)?.name === "AbortError") throw e; return null; });
    const json = async (res: Response | null) => (res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null);
    const fail = (j: Record<string, unknown> | null, fallback: string) => new Error(typeof j?.error === "string" ? j.error : fallback);
    const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const read = async (id: string): Promise<BuildPlayerData> => {
      const res = await call(`/api/studio/builds/${id}`);
      const j = await json(res);
      if (!res?.ok || !j?.build) throw fail(j, "SOCIA couldn't be reached to read the cut. Check your connection and try again.");
      return j as unknown as BuildPlayerData;
    };
    /** SOCIA's own cut from what is in the clips: understood first, then made from the brief (both count on the plan, as in the Video editor). */
    const fromPicture = async (): Promise<string> => {
      go("picture");
      viaPicture.current = true; setPicture(true);
      const err = await understand((s) => setStep(s.replace(/…$/, "")));
      if (signal.aborted) { const e = new Error("Stopped."); e.name = "AbortError"; throw e; }
      if (err) throw new Error(err);
      go("cut");
      setStep("Fitting the brief to these clips");
      // The brief is fitted to what is in these clips first, as every prompt in the Video editor is; without it the cut is made from the brief as written.
      let brief = PICTURE_BRIEF;
      const tctl = new AbortController();
      const timer = setTimeout(() => tctl.abort(), AUTO_IMPROVE_TIMEOUT_MS);
      signal.addEventListener("abort", () => tctl.abort(), { once: true });
      try {
        const res = await fetch(`/api/studio/projects/${projectId}/brief/enhance`, { ...post({ prompt: PICTURE_BRIEF, hasReference: false }), signal: tctl.signal });
        const j = (await res.json().catch(() => null)) as { prompt?: string } | null;
        if (res.ok && j?.prompt) brief = j.prompt;
      } catch { /* slow or unreachable: the brief as written */ } finally { clearTimeout(timer); }
      if (signal.aborted) { const e = new Error("Stopped."); e.name = "AbortError"; throw e; }
      setStep("Choosing the shots");
      const res = await call(`/api/studio/projects/${projectId}/brief`, post({ prompt: brief, reference: null }));
      const j = await json(res);
      const id = (j?.build as { id?: unknown } | undefined)?.id;
      if (!res?.ok || typeof id !== "string") throw fail(j, "SOCIA couldn't make the cut from these clips. Try again.");
      setStep(null);
      return id;
    };
    try {
      let data: BuildPlayerData | null = null;
      if (!buildId.current) {
        base.current = null;
        if (ids.length > 1) {
          // Several clips: the cut is made from what is in them. Their words are heard as part of understanding them.
          if (canPicture === false) throw new Error(MANY_LOCKED);
          buildId.current = await fromPicture();
        } else {
          // One clip becomes its own cut (the whole clip, nothing counted).
          go("words");
          const res = await call(`/api/studio/projects/${projectId}/clip-build`, post({ clipId: ids[0] }));
          const j = await json(res);
          if (!res?.ok || typeof j?.id !== "string") throw fail(j, "SOCIA couldn't be reached to open the clip. Check your connection and try again.");
          const own = j.id;
          data = await read(own);
          // Its words, with times, from the transcription ClipsStudio started when the upload finished.
          let late = false;
          if (canTranscribe !== false) {
            const waiting = (d: BuildPlayerData) => d.sources.some((s) => (s.transcribing != null ? s.transcribing : s.hasAudio && !s.words));
            for (let i = 0; waiting(data); i++) {
              if (i >= WORDS_TRIES) { late = true; break; }
              await wait(WORDS_EVERY_MS, signal);
              data = await read(own);
            }
          }
          const n = data.sources.reduce((a, s) => a + (s.words?.length ?? 0), 0);
          const anySound = data.sources.some((s) => s.hasAudio !== false);
          const silent = canTranscribe !== false && !late && n === 0;
          setHeard({
            words: canTranscribe === false || late ? null : n,
            note: canTranscribe === false ? "No transcription service is set up on this server, so nothing is cut by speech and there are no captions."
              : late ? "The words hadn't arrived after five minutes, so this video has no speech edit and no captions. Make it again in a few minutes."
              : silent ? `${anySound ? "No speech was heard in this clip" : "This clip has no sound"}${canPicture === false ? ", so it plays whole. Cutting a clip by what is in the picture is included from Starter." : ", so SOCIA cuts it by what is in the picture."}` : null,
          });
          if (silent && canPicture !== false) { buildId.current = await fromPicture(); data = null; }
          else buildId.current = own;
        }
      }
      const id = buildId.current;
      data ??= await read(id);
      if (!data.build.edl) throw new Error("The cut came back empty. Try it again.");
      base.current ??= data.build.edl;
      if (viaPicture.current) {
        const n = data.sources.reduce((a, s) => a + (s.words?.length ?? 0), 0);
        setHeard((h) => h ?? { words: n, note: null });
      }

      // The look, the music and the graphics.
      go("cut");
      const wordsById = Object.fromEntries(data.sources.map((s) => [s.clipId, s.words]));
      let start = base.current;
      let music: Record<string, string> | undefined = data.music;
      let beat = null as Awaited<ReturnType<typeof beatOfTrack>>;
      let musicName: string | null = null;
      const musicNotes: string[] = [];
      if (choice.trackId) {
        setStep("Putting the music in");
        const speaks = cutSpeaks(start.segments, wordsById);
        const res = await call(`/api/studio/builds/${id}/music/${choice.trackId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...startLevels(speaks), ...(speaks ? { duck: true } : {}) }) });
        const j = await json(res);
        const st = j?.soundtrack as Edl["soundtrack"] | undefined;
        if (res?.ok && st && typeof j?.url === "string") {
          start = { ...start, soundtrack: st };
          music = { ...(music ?? {}), [st.trackId]: j.url };
          musicName = st.name;
          musicIn.current = st.trackId;
          beat = await beatOfTrack(j.url);
          musicNotes.push(beat ? `Music: ${st.name}${speaks ? ", low under the talking" : ""}.` : `Music: ${st.name}${speaks ? ", low under the talking" : ""}. It has no steady beat SOCIA could measure, so the cuts were not moved onto it.`);
        } else {
          musicNotes.push(`The music couldn't be put in (${typeof j?.error === "string" ? j.error.replace(/\.$/, "") : "SOCIA couldn't be reached"}), so this video has none. Add it in the editor, under Sound.`);
        }
      } else if (musicIn.current) {
        // No music asked for this time: the sound the last go put in comes out.
        await call(`/api/studio/builds/${id}/music/${musicIn.current}`, { method: "DELETE" });
        musicIn.current = null;
      }
      setStep(null);
      const opts = { scenes: choice.scenes, behind: choice.behind, beat };
      const cut = viaPicture.current ? quickLook(start, chosen, data.sources, opts) : quickCut(start, chosen, data.sources, opts);
      const saved = await call(`/api/studio/builds/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: cut.edl }) });
      const sj = await json(saved);
      if (!saved?.ok || !sj?.edl) throw fail(sj, "The cut couldn't be saved, so the video wasn't made. Check your connection and try again.");
      // What renders is the cut as the server kept it (cuts snapped to words), so the file and the editor agree.
      const build = sj as unknown as StudioBuild;
      const kept = build.edl as Edl;
      const st = quickStats(viaPicture.current ? rawOf(kept, data.sources) : base.current, kept, wordsById);
      setStats(st);

      go("render");
      const out = await renderBuild({ ...data, build, music }, { signal, onProgress: (f) => { setProgress(f); go(f >= 1 ? "check" : "render"); } });
      const url = URL.createObjectURL(out.blob);
      urls.current.push(url);
      const used = new Set([...kept.segments.map((s) => s.clipId), ...(kept.broll ?? []).map((b) => b.clipId)]).size;
      setResult({
        buildId: id, title, blob: out.blob, url, rawUrl: data.sources.length === 1 ? data.sources[0].url : null, stats: st, clips: data.sources.length, clipsUsed: used, picture: viaPicture.current,
        notes: [...cut.notes, ...musicNotes], lines: kept.text.map((t) => t.text.trim()).filter(Boolean), report: out.report, edl: kept, look: chosen.id, music: musicName, width: out.width, height: out.height,
      });
      setStage("done");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setStep(null);
      setError((e as Error)?.message || "The video couldn't be made this time. Try again; if it keeps failing, open SOCIA in Chrome or Edge on a computer.");
      setFailedAt(cur);
      setStage("error");
    }
  }, [projectId, clipIds, canTranscribe, canPicture, understand, title]);

  // The clips are in: the rest starts by itself, once.
  useEffect(() => {
    if (!settled || !ready.length || !projectId || started.current) return;
    started.current = true;
    void run({ look, trackId, scenes: scenesOn, behind: behindOn });
    // The choices are read when the clips land; changing them afterwards is "Make it again".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, ready.length, projectId, run]);

  /** Upload the finished file and keep it as a draft in the Calendar (the editor's own export path and rules). */
  const saveDraft = async () => {
    if (!result) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setDraft({ phase: "saving", progress: 0 });
    let path: string | null = null;
    try {
      const res = await fetch(`/api/studio/builds/${result.buildId}/export`, { method: "POST", signal: ctrl.signal }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { path?: string; error?: string } | null) : null;
      if (!res?.ok || !j?.path) throw new Error(j?.error ?? "SOCIA couldn't be reached to save the draft. The video is still here to download.");
      path = j.path;
      await uploadMedia(supabase, "scheduled-media", path, new File([result.blob], "video.mp4", { type: "video/mp4" }), (sent, total) => setDraft({ phase: "saving", progress: total ? sent / total : 0 }), ctrl.signal);
      const d = await fetch(`/api/studio/builds/${result.buildId}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, durationSec: result.stats.cutSec, caption: result.edl.caption }), signal: ctrl.signal });
      const dj = (await d.json().catch(() => null)) as { postId?: string; error?: string } | null;
      if (!d.ok || !dj?.postId) throw new Error(dj?.error ?? "Couldn't save the draft. The video is still here to download.");
      setDraft({ phase: "saved", postId: dj.postId });
    } catch (e) {
      // Nothing was kept, so anything the export counted is given back.
      if (path) void fetch(`/api/studio/builds/${result.buildId}/export`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null);
      if ((e as Error)?.name === "AbortError") { setDraft({ phase: "idle" }); return; }
      setDraft({ phase: "error", message: (e as Error)?.message?.replace(/^Upload failed: /, "") || "Couldn't save the draft. The video is still here to download." });
    }
  };

  const take = (list: FileList | File[]) => {
    const files = Array.from(list).filter(isVideo);
    if (!files.length) { setPickNote("That isn't a video file. Use an MP4 or MOV."); return; }
    if (files.length > 1 && canPicture === false) { setPickNote(MANY_LOCKED); return; }
    setPickNote(null);
    onPick(files);
  };
  const again = () => { abort.current?.abort(); onReset(); };

  const choices = (disabled: boolean, idPrefix: string) => (
    <div className="qe-choices">
      <label className="qe-field" htmlFor={`${idPrefix}-look`}>
        <span>Look</span>
        <select value={look} disabled={disabled} id={`${idPrefix}-look`} onChange={(e) => pickLook(e.target.value)}>
          {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <small>Best for {/^\p{Lu}(\p{Ll}|\s)/u.test(theme.bestFor) ? theme.bestFor.replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : theme.bestFor}</small>
      </label>
      <label className="qe-field" htmlFor={`${idPrefix}-music`}>
        <span>Music</span>
        <select value={trackId} disabled={disabled || !tracks.length} id={`${idPrefix}-music`} onChange={(e) => setTrackId(e.target.value)}>
          <option value="">None</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <small>{tracks.length ? "From your playlist. Cuts land on its beat; it sits low under talking." : "Your playlist is empty. Add sounds in the editor, under Sound."}</small>
      </label>
      <label className="qe-check"><input type="checkbox" checked={scenesOn} disabled={disabled} onChange={(e) => pickScenes(e.target.checked)} /> Animated graphics for the figures, lists and key lines that are said</label>
      <label className="qe-check"><input type="checkbox" checked={scenesOn && behindOn} disabled={disabled || !scenesOn} onChange={(e) => pickBehind(e.target.checked)} /> Put the graphics behind the person talking</label>
    </div>
  );

  // ------------------------------------------------------------ the drop ----
  if (!locals.length) {
    return (
      <section className="qe" aria-labelledby="qe-h">
        <div className="qe-hero">
          <motion.span className="qe-eyebrow" {...rise(0)}>AI video editor</motion.span>
          <motion.h2 id="qe-h" {...rise(1)}>Raw footage in. <em>Finished video</em> out.</motion.h2>
          <motion.p {...rise(2)}>Drop a clip of someone talking, or several clips of anything. It is cut, captioned, animated and mixed, then made into a ready-to-post video on this computer.</motion.p>
        </div>
        {blocker ? (
          <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {blocker}</p>
        ) : (
          <motion.div
            className={`qe-drop${drag ? " is-drag" : ""}`} role="button" tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            {...rise(3)}
          >
            <span className="qe-drop-ico"><Upload size={26} aria-hidden /></span>
            <b>{drag ? "Drop it" : "Drop your raw video here"}</b>
            <span>or click to choose. MP4 or MOV, one clip or several.</span>
          </motion.div>
        )}
        <input ref={input} type="file" hidden multiple accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { if (e.target.files) take(e.target.files); e.target.value = ""; }} />
        {pickNote && <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {pickNote}</p>}
        <motion.ul className="qe-does" aria-label="What it does" {...rise(4)}>
          <li><Check size={13} aria-hidden /> Cuts pauses and repeated takes</li>
          <li><Check size={13} aria-hidden /> Picks the best shots</li>
          <li><Check size={13} aria-hidden /> Captions</li>
          <li><Check size={13} aria-hidden /> Animated graphics</li>
          <li><Check size={13} aria-hidden /> Your music, cut on the beat</li>
        </motion.ul>
        <motion.div className="qe-wide" {...rise(5)}>{choices(false, "qe-start")}</motion.div>
        <p className="qe-fine">
          {canPicture === false
            ? "One talking clip counts nothing on your plan. A cut from several clips, or from a clip where no one speaks, is included from Starter; on your plan such a clip plays whole."
            : "One talking clip counts nothing on your plan. Several clips, or a clip where no one speaks, count one footage analysis and one AI-made video, as in the full editor."}
          {" "}For a prompt, a video to copy or an edit by hand, <button type="button" className="qe-link" onClick={onFull}>use the full editor</button>.
        </p>
      </section>
    );
  }

  // ---------------------------------------------------------- the result ----
  if (result && stage === "done") {
    const faults = renderFaults(result.report);
    const s = result.stats;
    const lookName = themeById(result.look)?.name ?? result.look;
    const changed = look !== result.look || (trackId ? tracks.find((t) => t.id === trackId)?.name ?? "" : null) !== result.music || scenesOn !== (s.scenes > 0) || (s.scenes > 0 && behindOn !== Boolean(result.edl.scenesBehind));
    return (
      <section className="qe" aria-labelledby="qe-done">
        <div className={`qe-stage${compare && result.rawUrl ? " is-compare" : ""}`}>
          <div className="qe-screens">
            {compare && result.rawUrl && (
              <figure className="qe-phone">
                <span className="qe-tag">Raw</span>
                <video src={result.rawUrl} controls playsInline preload="metadata" />
              </figure>
            )}
            <motion.figure className="qe-phone" {...grow}>
              <span className="qe-tag is-done">Edited</span>
              <video src={result.url} controls playsInline preload="metadata" />
            </motion.figure>
          </div>
          <div className="qe-side">
            <motion.span className="qe-pill" {...rise(0)}><Check size={13} aria-hidden /> Edited</motion.span>
            <motion.h2 id="qe-done" {...rise(1)}>Your video is <em>ready.</em></motion.h2>
            <motion.p className="qe-meta" {...rise(2)}>{result.title} · {result.width} × {result.height} · {(result.blob.size / 1048576).toFixed(1)} MB · {lookName}{result.music ? ` · ${result.music}` : ""}</motion.p>
            <motion.dl className="qe-tiles" {...rise(3)}>
              <div><dt>{result.picture ? "Footage to video" : "Runtime"}</dt><dd>{result.picture ? <><s>{clock(s.rawSec)}</s> {clock(s.cutSec)}</> : <><s>{secs(s.rawSec)}</s> {secs(s.cutSec)}</>}</dd></div>
              {result.picture
                ? <div><dt>Shots</dt><dd>{s.shots}<small>from {result.clipsUsed} of {result.clips} clips</small></dd></div>
                : <div><dt>Cuts</dt><dd>{s.removed}<small>{s.words > 0 ? `${s.words - s.wordsKept} words removed` : "no speech heard"}</small></dd></div>}
              <div><dt>Graphics</dt><dd>{s.scenes}<small>{s.captions ? "captions on" : "captions off"}</small></dd></div>
              <div><dt>Loudness</dt><dd>{result.report?.levelDb != null ? `${result.report.levelDb.toFixed(1)} dB` : "Not measured"}</dd></div>
            </motion.dl>
            {faults.length > 0 && (
              <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /><span>SOCIA watched the file twice and still found: {faults.map((f) => f.detail.replace(/\.$/, "")).join("; ")}. Play it before you post it, or open it in the editor to fix it.</span></p>
            )}
            <motion.div className="qe-actions" {...rise(4)}>
              <a className="qe-btn is-primary" href={result.url} download={`${result.title.replace(/[^\w -]+/g, "").trim() || "socia-video"}.mp4`}><Download size={15} aria-hidden /> Download MP4</a>
              {result.rawUrl && <button type="button" className="qe-btn" aria-pressed={compare} onClick={() => setCompare((c) => !c)}><Columns2 size={15} aria-hidden /> {compare ? "Hide raw" : "Compare with raw"}</button>}
              <button type="button" className="qe-btn" onClick={() => onOpenEditor(result.buildId, result.title)}><Scissors size={15} aria-hidden /> Open in the editor</button>
              <button type="button" className="qe-btn is-quiet" onClick={again}>Edit another</button>
            </motion.div>
            <div className="qe-actions">
              {draft.phase === "saved" ? (
                <Link className="qe-btn is-quiet" href={`/create?post=${draft.postId}`}>Saved as a draft. Review in Create Post <ArrowRight size={13} aria-hidden /></Link>
              ) : (
                <button type="button" className="qe-btn is-quiet" disabled={draft.phase === "saving"} onClick={() => void saveDraft()}>
                  {draft.phase === "saving" ? <><Loader2 size={13} className="spin" aria-hidden /> Saving the draft {Math.round(draft.progress * 100)}%</> : "Save as a draft in your Calendar"}
                </button>
              )}
            </div>
            {draft.phase === "error" && <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {draft.message}</p>}
            {result.picture && result.lines.length > 0 && (
              <p className="qe-fine">SOCIA wrote the words on screen from what it saw in the clips: {result.lines.map((l) => `"${l.replace(/\n/g, " ")}"`).join(", ")}. Read them before you post; retype or remove them in the editor, under Words.</p>
            )}
            {heard?.note && <p className="qe-fine">{heard.note}</p>}
            {result.notes.length > 0 && (
              <details className="qe-notes">
                <summary>What SOCIA did</summary>
                <ul>{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </details>
            )}
            <details className="qe-notes">
              <summary>Make it again with another look or music</summary>
              {choices(false, "qe-done")}
              <div className="qe-actions">
                <button type="button" className="qe-btn" disabled={!changed} onClick={() => void run({ look, trackId, scenes: scenesOn, behind: behindOn })}><RefreshCw size={14} aria-hidden /> Make it again</button>
              </div>
              <p className="qe-fine">Same cut, same clips: only the look, the music and the graphics change. Nothing more is counted.</p>
            </details>
          </div>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------ the steps ----
  const first = locals[0];
  const inUpload = !settled;
  const allFailed = settled && !ready.length;
  const showPicture = picture || many;
  const order: Stage[] = showPicture ? (many ? ["upload", "picture", "cut", "render", "check"] : ["upload", "words", "picture", "cut", "render", "check"]) : ["upload", "words", "cut", "render", "check"];
  const at = order.indexOf(stage === "error" ? failedAt ?? "upload" : stage);
  const state = (id: Stage): "on" | "done" | "" => (stage !== "error" && stage === id && !inUpload ? "on" : !inUpload && at > order.indexOf(id) ? "done" : "");
  const active = locals.find((l) => !usable(l) && l.phase !== "error" && l.phase !== "duplicate");
  const reading = inUpload && (!active || active.phase !== "uploading");
  const sending = inUpload && active?.phase === "uploading";
  const size = !many && first.clip?.width && first.clip?.height ? `${first.clip.width} × ${first.clip.height}` : null;
  const footage = locals.reduce((a, l) => a + (l.durationSec ?? 0), 0);
  const length = footage > 0 ? clock(footage) : null;
  const facts = many ? [`${locals.length} clips`, length].filter(Boolean).join(" · ") : [size, length].filter(Boolean).join(" · ");
  const upShare = locals.length ? locals.reduce((a, l) => a + (usable(l) || l.phase === "error" || l.phase === "duplicate" ? 1 : l.phase === "uploading" ? 0.5 + l.progress * 0.5 : 0.25), 0) / locals.length : 0;
  // How far along it is, from the work itself: the share of the footage uploaded, the steps finished, the share of the
  // video rendered. Steps whose length can't be known (hearing the words, understanding the picture) hold their place.
  const START: Partial<Record<Stage, number>> = { upload: 0, words: 30, picture: 36, cut: 46, render: 50, check: 97 };
  const pct = stage === "error" ? null : inUpload ? Math.round(upShare * 30) : stage === "render" ? Math.round(50 + progress * 47) : START[stage] ?? 0;
  const mark = (st: "on" | "done" | "") => (st === "done" ? <motion.span key="done" className="qe-mark is-done" {...pop}><Check size={12} aria-hidden /></motion.span> : st === "on" ? <span className="qe-mark is-on"><Loader2 size={13} className="spin" aria-hidden /></span> : <span className="qe-mark" aria-hidden />);
  let rows = 0;
  const row = (st: "on" | "done" | "", label: string, value: string) => <motion.li key={label} className={st ? `is-${st}` : ""} {...rise(2 + rows++)}>{mark(st)}<span>{label}</span><em>{value}</em></motion.li>;
  return (
    <section className="qe" aria-labelledby="qe-run">
      <div className="qe-stage">
        <div className="qe-screens">
          <motion.figure className="qe-phone" {...grow}>
            <span className="qe-tag">Raw</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- a frame of the clip, held in this tab as an object URL */}
            {first.thumb ? <img src={first.thumb} alt="" /> : <span className="qe-blank" aria-hidden />}
          </motion.figure>
        </div>
        <div className="qe-side">
          <p className="qe-file" id="qe-run"><b>{title}</b><span>{[facts, themeById(look)?.name].filter(Boolean).join(" · ")}</span></p>
          {pct != null && (
            <>
              <p className="qe-pct" aria-live="off"><b><Count value={pct} /></b><span>%</span></p>
              <div className="qe-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress"><i style={{ width: `${pct}%` }} /></div>
            </>
          )}
          <ul className="qe-steps" aria-live="polite">
            {row(reading ? "on" : (sending || !inUpload) && !allFailed ? "done" : "", "Reading footage", reading ? active?.stageNote ?? "" : facts)}
            {row(sending ? "on" : !inUpload && !allFailed ? "done" : "", "Uploading", inUpload ? (many ? `${locals.filter((l) => usable(l)).length} of ${locals.length} clips` : sending ? `${Math.round((active?.progress ?? 0) * 100)}%` : "") : "")}
            {order.includes("words") && row(state("words"), "Transcribing speech", heard ? (heard.words != null ? (heard.words ? `${heard.words} words` : "No speech") : "Skipped") : "")}
            {order.includes("picture") && row(state("picture"), "Understanding the picture", stage === "picture" ? "" : many && heard?.words != null ? (heard.words ? `${heard.words} words heard` : "No speech") : "")}
            {row(state("cut"), showPicture ? "Choosing the shots" : "Cutting pauses and retakes", stats ? (showPicture ? `${stats.shots} shots · ${clock(stats.cutSec)}` : stats.words ? `${secs(stats.rawSec)} → ${secs(stats.cutSec)}` : "Nothing to cut") : "")}
            {row(state("cut") === "done" ? "done" : "", "Captions, look and graphics", stats ? `${themeById(look)?.name ?? ""}${stats.scenes ? ` · ${stats.scenes} graphic${stats.scenes === 1 ? "" : "s"}` : ""}` : "")}
            {row(state("render"), "Rendering the video", stage === "render" ? `${Math.round(progress * 100)}%` : state("render") === "done" ? `${OUTPUT.width} × ${OUTPUT.height}` : "")}
            {row(state("check"), "Checking the finished file", "")}
          </ul>
          {step && stage !== "error" && <p className="qe-fine" role="status">{step}</p>}
          {heard?.note && <p className="qe-fine">{heard.note}</p>}
          {failed.map((l) => <p key={l.key} className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {many ? `${l.name}: ` : ""}{l.phase === "duplicate" ? "This clip is already in this video." : l.error ?? "This clip couldn't be added."}{many && ready.length ? " The video is made without it." : ""}</p>)}
          {stage === "error" && error && <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {error}</p>}
          <div className="qe-actions">
            {stage === "error" && ready.length > 0 && <button type="button" className="qe-btn is-primary" onClick={() => void run({ look, trackId, scenes: scenesOn, behind: behindOn })}><RefreshCw size={14} aria-hidden /> Try again</button>}
            {stage === "error" && buildId.current && <button type="button" className="qe-btn" onClick={() => onOpenEditor(buildId.current!, title)}>Open it in the editor instead</button>}
            <button type="button" className="qe-btn is-quiet" onClick={again}>{allFailed || stage === "error" ? "Use other footage" : "Stop"}</button>
          </div>
          {!allFailed && stage !== "error" && <p className="qe-fine">Keep this tab open. The video is made on this computer, so more footage takes longer.</p>}
        </div>
      </div>
    </section>
  );
}
