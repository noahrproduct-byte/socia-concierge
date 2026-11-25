"use client";

// The Video editor's one screen (Noah, 2026-11-25: the old full editor and the
// one-drop edit combined). Raw footage in, a finished video out: the footage,
// what the person wants the video to look like (always asked for), a reference
// video to make it like, SOCIA's recommended creative direction with every
// setting open to change, an optional voiceover, and a summary of what will be
// made and what it counts before anything is. Nothing is made until "Make the
// video" is pressed. Two ways to a cut, chosen by what is in the footage and
// what was asked for, and both made of what the editor already has:
//   - one clip of someone talking: the clip becomes its own cut, its words
//     arrive, the pauses and repeated takes come out (lib/studioClips/quickEdit.ts
//     quickCut). Nothing is counted against the plan.
//   - several clips, a clip where no one speaks, a reference video or a
//     voiceover: SOCIA understands what is in the picture and makes the cut
//     from the prompt, the reference and the voiceover (the Video editor's own
//     "understand" and "brief" routes, which count on the plan as they do
//     there), then quickLook.
// Either way the look goes on, the music the person picked goes in with the
// cuts on its beat, the graphics its own words support are placed
// (lib/studioClips/scenes.ts), and the video is rendered in this browser and
// watched (components/studio/renderBuild.ts). ClipsStudio owns the uploads.
// Every step shows what was really measured; a step with nothing to report
// says nothing. No timer, no estimate, no invented score.
import { PROMPT_MAX } from "@/lib/studioClips/reference";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Columns2, Download, Film, Link2, Loader2, PenLine, RefreshCw, Scissors, SlidersHorizontal, Undo2, Upload, X } from "lucide-react";
import { animate, motion, useReducedMotion } from "framer-motion";
import "./quick-edit.css";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { fileLabel } from "@/lib/publishing/postLabel";
import { cutSpeaks, startLevels } from "@/lib/music/taste";
import type { Track } from "@/lib/music/tracks";
import { analysisOfTrack, beatOfTrack } from "@/lib/studioClips/beatClient";
import { bestParts, clampStart, clock as partClock } from "@/lib/music/bestPart";
import { alignSection, envelopeFromRms, partLabel } from "@/lib/music/referenceMusic";
import { rankLibrary } from "@/lib/music/libraryMatch";
import ReferenceMusicCard from "./ReferenceMusicCard";
import { beatFromStart } from "@/lib/studioClips/beats";
import { timeline } from "@/lib/studioClips/timeline";
import { useSpeech } from "./useSpeech";
import { SCENE_FX, isSceneFx, type SceneFxId } from "@/lib/studioClips/sceneFx";
import { EffectTiles } from "./MotionEffectsPanel";
import { SPLIT_SKINS, SPLIT_SKIN_IDS, isSplitSkin, type SplitSkinId } from "@/lib/studioClips/splitSkins";
import type { EdlScene } from "@/lib/studioClips/scenes";
import MicButton from "./MicButton";
import { lookAtCut } from "@/lib/studioClips/lookAtCut";
import { placeClear, placeNote, samplesFor } from "@/lib/studioClips/placement";
import { PICTURE_BRIEF, quickCut, quickLook, quickStats, rawOf, type QuickStats } from "@/lib/studioClips/quickEdit";
import { renderFaults, type RenderReport } from "@/lib/studioClips/renderCheck";
import { DEFAULT_THEME_ID, THEMES, themeById } from "@/lib/studioClips/themes";
import { OUTPUT, type BuildPlayerData, type Edl, type StudioBuild } from "@/lib/studioClips/types";
import { ClipGrid, type LocalClip } from "./ClipsViews";
import VoiceoverAsk from "./VoiceoverAsk";
import Inspiration from "./Inspiration";
import { servedVideoOf, sourceOfReel } from "@/lib/studioClips/referenceSource";
import { useReference, type Reference } from "./useReference";
import { actionCredits } from "@/lib/credits/config";
import { setThemeOverride } from "@/lib/studioClips/themes/apply";
import type { CreativeStyle } from "@/lib/research/direction";
import type { HandoffReference } from "@/lib/studioClips/handoff";
import type { LibraryClip } from "@/lib/studioClips/library";
import { CAPTION_ANIMATIONS, CAPTION_STYLES } from "@/lib/studioClips/style";
import { ASPECTS, TRANSITIONS } from "@/lib/studioClips/types";
import {
  COLOURS, DEFAULT_CREATIVE, DURATIONS, FOCUSES, GRAPHICS, MUSIC_MODES, PACES, aspectLabel, aspectSize, composeBrief, creativeSummary, durationLabel, recommend, themePatch,
  type Creative, type CreativeKey,
} from "@/lib/studioClips/creative";
import { renderBlocker, renderBuild } from "./renderBuild";

type Stage = "setup" | "upload" | "words" | "picture" | "cut" | "render" | "check" | "done" | "error";
type Result = { creative: Creative; ref: string | null; voice: boolean; buildId: string; title: string; blob: Blob; url: string; rawUrl: string | null; stats: QuickStats; clips: number; clipsUsed: number; picture: boolean; prompt: string; fx: SceneFxId[]; notes: string[]; lines: string[]; report: RenderReport | null; edl: Edl; look: string; music: string | null; width: number; height: number };
type Draft = { phase: "idle" } | { phase: "saving"; progress: number } | { phase: "saved"; postId: string } | { phase: "error"; message: string };
type Choice = {
  look: string; /** the person picked the style themselves (not SOCIA's default or the one kept on this computer) */ lookPicked: boolean;
  trackId: string; /** the person's library, for "similar" music SOCIA picks */ tracks: Track[]; behind: boolean; split: boolean;
  /** what the video should look like, typed or spoken */ prompt: string;
  /** the effects the person picked; none = SOCIA picks */ fx: SceneFxId[]; /** the look a split screen wears */ skin: SplitSkinId; /** a short sound as each graphic lands */ sound: boolean;
  /** the creative settings (lib/studioClips/creative.ts) */ creative: Creative;
  /** the reference video, as read in this browser */ ref: Reference | null;
  /** a voiceover with an approved script */ voice: { notes: string; voiceId: string | null } | null;
};
const PROMPT_KEY = "socia.quickEdit.prompt";
const FX_KEY = "socia.quickEdit.fx";
const SKIN_KEY = "socia.quickEdit.skin";
const SOUND_KEY = "socia.quickEdit.sound";
const keptFx = (): SceneFxId[] => { try { return (window.localStorage.getItem(FX_KEY) ?? "").split(",").filter(isSceneFx).slice(0, 4); } catch { return []; } };
/** Sent with the person's words to the step that changes the cut, so asks for pictures (made in their own step) are not answered as "can't". */
const NOT_PICTURES = " (Requests for pictures, graphics or visuals are handled in another step: leave them out, and do not mention them in the reply.)";
/** Where the graphics sit: a card over the picture, behind the person talking, or a split screen. */
type Place = "over" | "behind" | "split";
const placeOf = (edl: { scenesBehind?: true; scenesSplit?: true }): Place => (edl.scenesSplit ? "split" : edl.scenesBehind ? "behind" : "over");

const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const isVideo = (f: File) => f.type.startsWith("video/") || VIDEO_RE.test(f.name);
/** The words are asked for again this often, for this long (five minutes), as the editor does. */
const WORDS_EVERY_MS = 3000, WORDS_TRIES = 100;
/** Several clips at once on a plan without SOCIA's own cuts. */
export const MANY_LOCKED = "Making one video from several clips is included from Starter. On your plan, drop one clip at a time, or use the full editor to cut them by hand.";
const LOOK_KEY = "socia.quickEdit.look", BEHIND_KEY = "socia.quickEdit.behind";

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

export default function QuickEdit({ viewerId, locals, uploading, projectId, understood, canTranscribe, canPicture, drag, onPick, onRemove, understand, onOpenEditor, onManual, manualBusy, onReset, onRunning, handed }: {
  viewerId: string;
  /** the clips as ClipsStudio tracks them (their measuring and upload); empty before anything is added */
  locals: LocalClip[];
  /** clips are still being measured or uploaded */
  uploading: boolean;
  projectId: string | null;
  /** these clips were already understood: a cut from the picture doesn't count a new footage analysis */
  understood: boolean;
  /** false: no transcription service on this server, so the words are not waited for; null: not known yet */
  canTranscribe: boolean | null;
  /** the plan includes a cut made by SOCIA from what is in the clips (several clips, a reference, a voiceover); null: not known yet */
  canPicture: boolean | null;
  /** a file is being dragged over the page */
  drag: boolean;
  onPick: (files: File[]) => void;
  /** take a clip out of this video */
  onRemove: (c: LocalClip) => void;
  /** SOCIA understands the clips (ClipsStudio's own job and its plan rules); an error to show, or null when it is done */
  understand: (say: (step: string) => void) => Promise<string | null>;
  onOpenEditor: (buildId: string, title: string) => void;
  /** the person's own edit of these clips, by hand (no AI, nothing counted) */
  onManual: () => void;
  manualBusy: boolean;
  /** back to an empty screen */
  onReset: () => void;
  /** a video is being made: ClipsStudio holds new footage until it's done */
  onRunning?: (on: boolean) => void;
  /** What another part of SOCIA sent here (Planner, Discover, Ask SOCIA, a Dashboard idea): the prompt, a Reel to make it like, a creative style, the goal. */
  handed?: { prompt?: string | null; reference?: HandoffReference | null; style?: CreativeStyle | null; goal?: string | null };
}) {
  const input = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  // Motion: each screen eases in, its parts one after another; a finished step's tick pops. None of it when motion is reduced.
  const reduced = useReducedMotion();
  const rise = (i = 0) => (reduced ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, ease: EASE_OUT, delay: 0.07 * i } });
  const grow = reduced ? {} : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.6, ease: EASE_OUT } };
  const pop = reduced ? {} : { initial: { scale: 0.3 }, animate: { scale: 1 }, transition: { type: "spring" as const, stiffness: 520, damping: 18 } };
  const [look, setLook] = useState<string>(DEFAULT_THEME_ID);
  const [place, setPlace] = useState<Place>("behind");
  const [skin, setSkin] = useState<SplitSkinId>("socia");
  const [soundOn, setSoundOn] = useState(true);
  const pickSound = (on: boolean) => { setSoundOn(on); try { window.localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* not kept */ } };
  const pickSkin = (id: SplitSkinId) => { setSkin(id); try { window.localStorage.setItem(SKIN_KEY, id); } catch { /* not kept */ } };
  const [trackId, setTrackId] = useState("");
  // The effects picked before the drop (kept on this computer); none picked = SOCIA picks.
  const [fxPick, setFxPick] = useState<SceneFxId[]>([]);
  const toggleFx = (id: SceneFxId) => setFxPick((was) => {
    const next = was.includes(id) ? was.filter((x) => x !== id) : was.length >= 4 ? was : [...was, id];
    try { window.localStorage.setItem(FX_KEY, next.join(",")); } catch { /* not kept */ }
    return next;
  });
  // How the person wants it, typed or spoken; it goes with the cut and decides the pictures.
  const [prompt, setPromptState] = useState("");
  // Kept for this tab, so what was typed before the drop is still there when the clips land and after the video is made.
  const setPrompt = useCallback((next: string | ((was: string) => string)) => setPromptState((was) => {
    const v = typeof next === "function" ? next(was) : next;
    try { if (v) window.sessionStorage.setItem(PROMPT_KEY, v); else window.sessionStorage.removeItem(PROMPT_KEY); } catch { /* not kept */ }
    return v;
  }), []);
  // Read before the first paint of this screen, so the run that starts when the clips land has it.
  const promptRef = useRef("");
  if (typeof window !== "undefined" && !promptRef.current && !prompt) {
    // A brief handed over (a planned post, a Discover idea, Ask SOCIA) starts the box; otherwise the words typed last in this tab.
    if (handed?.prompt?.trim()) promptRef.current = handed.prompt.trim().slice(0, PROMPT_MAX);
    else { try { promptRef.current = window.sessionStorage.getItem(PROMPT_KEY)?.slice(0, PROMPT_MAX) ?? ""; } catch { /* none */ } }
  }
  useEffect(() => { if (promptRef.current) setPromptState(promptRef.current); }, []);
  // A brief handed over after this screen opened (Discover, Ask SOCIA and Dashboard ideas arrive a moment later) fills the box too.
  const handedPrompt = useRef<string | null>(null);
  useEffect(() => {
    const p = handed?.prompt?.trim();
    if (!p || handedPrompt.current === p) return;
    handedPrompt.current = p;
    setPrompt(p.slice(0, PROMPT_MAX));
  }, [handed?.prompt, setPrompt]);
  const spokenFrom = useRef("");
  const speech = useSpeech((words) => setPrompt((spokenFrom.current ? `${spokenFrom.current} ${words}` : words).slice(0, PROMPT_MAX)));
  const toggleMic = () => { if (!speech.listening) spokenFrom.current = prompt.trim(); speech.toggle(); };
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => {
    try {
      const kept = window.localStorage.getItem(LOOK_KEY);
      if (kept && themeById(kept)) setLook(kept);
      if (window.localStorage.getItem(SOUND_KEY) === "off") setSoundOn(false);
      const keptSkin = window.localStorage.getItem(SKIN_KEY);
      if (isSplitSkin(keptSkin)) setSkin(keptSkin);
      const effects = keptFx();
      if (effects.length) setFxPick(effects);
      const where = window.localStorage.getItem(BEHIND_KEY);
      if (where === "off") setPlace("over");
      else if (where === "split") setPlace("split");
    } catch { /* private mode: the defaults */ }
    let alive = true;
    // The person's own playlist (the Sound tool's): a sound from it can go in with the cut.
    fetch("/api/studio/tracks").then((r) => (r.ok ? r.json() : null)).then((j: { tracks?: Track[] } | null) => { if (alive && j?.tracks) setTracks(j.tracks); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // The style picked on this screen is the person's: a cut made from a reference or a voiceover keeps its own style otherwise.
  const [lookPicked, setLookPicked] = useState(false);
  const pickLook = (id: string) => { setLook(id); setLookPicked(true); try { window.localStorage.setItem(LOOK_KEY, id); } catch { /* not kept */ } };
  const pickPlace = (p: Place) => { setPlace(p); try { window.localStorage.setItem(BEHIND_KEY, p === "split" ? "split" : p === "behind" ? "on" : "off"); } catch { /* not kept */ } };
  const theme = themeById(look) ?? themeById(DEFAULT_THEME_ID)!;

  // ---- the reference video (components/studio/useReference.ts) -------------------
  const reference = useReference(viewerId);
  const ref = reference.ref;
  /** The inspiration Reel in use, by its link, so its card shows "In use". */
  const [refFromReel, setRefFromReel] = useState<string | null>(null);
  const [refMode, setRefMode] = useState<null | "link" | "clips">(null);
  const [linkText, setLinkText] = useState("");
  const [handleText, setHandleText] = useState("");
  const [library, setLibrary] = useState<LibraryClip[] | null>(null);
  const refInput = useRef<HTMLInputElement>(null);
  // A Reel handed over from Discover is read once, on arrival.
  const handedRef = useRef<string | null>(null);
  useEffect(() => {
    const r = handed?.reference;
    const key = r ? r.reel?.link ?? r.url : null;
    if (!r || !key || handedRef.current === key) return;
    handedRef.current = key;
    // A Reel from Discover: the video link Discover had is tried first, then Instagram's official read finds it fresh.
    if (r.reel) void reference.readReel(r.reel.link, { known: r.reel, served: r.url, handle: r.reel.handle, from: "discover" });
    else if (r.url) void reference.readServed(r.url, r.name, "discover");
  }, [handed?.reference, reference]);
  const openLibrary = () => {
    setRefMode((m) => (m === "clips" ? null : "clips"));
    if (library) return;
    fetch("/api/studio/library").then((r) => (r.ok ? r.json() : null)).then((j: { clips?: LibraryClip[] } | null) => setLibrary(j?.clips ?? [])).catch(() => setLibrary([]));
  };

  // ---- the creative direction (lib/studioClips/creative.ts) ------------------------
  // SOCIA's recommendation, from the prompt, the reference, the footage and a style chosen in Ask SOCIA;
  // what the person set themselves sits on top and no new recommendation moves it.
  const [mine, setMine] = useState<Partial<Creative>>({});
  const [customize, setCustomize] = useState(false);
  const footageCount = locals.filter((l) => l.phase !== "error" && l.phase !== "duplicate").length;
  const rec = useMemo(() => recommend({
    prompt,
    style: handed?.style ?? null,
    reference: ref ? { durationSec: ref.durationSec, cuts: ref.cuts, speech: Boolean(ref.words?.length) } : null,
    clips: footageCount ? { count: footageCount } : null,
  }), [prompt, handed?.style, ref, footageCount]);
  const creative: Creative = { ...DEFAULT_CREATIVE, ...rec.creative, ...mine };
  const setSetting = <K extends CreativeKey>(k: K, v: Creative[K]) => setMine((m) => ({ ...m, [k]: v }));
  const resetSettings = () => { setMine({}); setLookPicked(false); };
  const scenesOn = creative.graphics !== "off";

  // ---- the voiceover (components/studio/VoiceoverAsk.tsx) --------------------------
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState("");
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceApproved, setVoiceApproved] = useState(false);
  const [, setVoicePending] = useState(false);

  // ---- Help me write a prompt ------------------------------------------------------
  const [helping, setHelping] = useState(false);
  const [helped, setHelped] = useState<{ before: string; after: string; added: string[] } | null>(null);
  const [helpErr, setHelpErr] = useState<string | null>(null);

  // Whether this browser can render at all, asked once, before anything is uploaded.
  const [blocker, setBlocker] = useState<string | null>(null);
  useEffect(() => { let alive = true; renderBlocker(OUTPUT.width, OUTPUT.height).then((b) => { if (alive) setBlocker(b); }).catch(() => {}); return () => { alive = false; }; }, []);

  const [stage, setStage] = useState<Stage>("setup");
  const [progress, setProgress] = useState(0);
  const [picture, setPicture] = useState(false);
  /** This run makes its cut from the picture from the start (several clips, a reference or a voiceover): no separate speech step. */
  const [direct, setDirect] = useState(false);
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
    abort.current?.abort();
    onRunning?.(true);
    const ctrl = new AbortController(); abort.current = ctrl;
    const { signal } = ctrl;
    setError(null); setFailedAt(null); setResult(null); setCompare(false); setDraft({ phase: "idle" }); setProgress(0); setStep(null);
    setDirect(ids.length > 1 || Boolean(choice.ref) || Boolean(choice.voice));
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
    /**
     * SOCIA's own cut from what is in the clips: understood first, then made from the brief (both count on the plan, as in
     * the Video editor). The brief is the person's prompt as they approved it, with the settings they chose after it:
     * nothing rewrites their words on the way ("Help me write a prompt" is the way to have SOCIA write them).
     */
    const fromPicture = async (): Promise<string> => {
      go("picture");
      viaPicture.current = true; setPicture(true);
      const err = await understand((s) => setStep(s.replace(/…$/, "")));
      if (signal.aborted) { const e = new Error("Stopped."); e.name = "AbortError"; throw e; }
      if (err) throw new Error(err);
      go("cut");
      setStep(choice.ref ? "Studying the reference and choosing the shots" : choice.voice ? "Choosing the shots and voicing the script" : "Choosing the shots");
      // The general guide for a cut from the picture, without its own length when a length or a reference sets it.
      const guide = choice.creative.durationSec || choice.ref ? PICTURE_BRIEF.replace(", 15 to 30 seconds", "") : PICTURE_BRIEF;
      const brief = composeBrief(`${choice.prompt.trim()}\n\n${guide}`, choice.creative);
      const { from: _from, ...refFacts } = choice.ref ?? ({} as Reference); void _from;
      const res = await call(`/api/studio/projects/${projectId}/brief`, post({
        prompt: brief,
        reference: choice.ref ? refFacts : null,
        ...(choice.voice ? { voiceover: { on: true, notes: choice.voice.notes, ...(choice.voice.voiceId ? { voiceId: choice.voice.voiceId } : {}), approved: true } } : {}),
      }));
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
        if (ids.length > 1 || choice.ref || choice.voice) {
          // Several clips, a reference or a voiceover: the cut is made from what is in them. Their words are heard as part of understanding them.
          if (canPicture === false) throw new Error(ids.length > 1 ? MANY_LOCKED : "A video made like a reference or with a voiceover is included from Starter. Remove them to cut this clip on your plan.");
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
      // The style: the one picked. A cut made from a reference or with a voiceover keeps the style SOCIA made it in
      // unless the person picked one here, so the reference's pacing and the voice's timing aren't re-cut on top.
      const ownTheme = viaPicture.current && (choice.ref || choice.voice) && !choice.lookPicked ? themeById(base.current.theme?.id) : null;
      const chosen = ownTheme ?? themeById(choice.look) ?? themeById(DEFAULT_THEME_ID)!;
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
      // The music: the sound picked, or for "similar" the library sound closest to the reference's music.
      const mode = choice.creative.music;
      const refMusic = choice.ref?.music?.musicLikely ? choice.ref.music : null;
      const fromRef = Boolean(refMusic) && (mode === "match" || mode === "similar");
      let wantTrack = mode === "none" ? "" : choice.trackId;
      if (mode === "similar" && !wantTrack && refMusic) {
        setStep("Choosing music like the reference's");
        const r = await rankLibrary(refMusic, choice.tracks).catch(() => null);
        wantTrack = r?.ranked[0]?.track.id ?? "";
        if (!wantTrack) musicNotes.push("Your library has no sound SOCIA could measure, so this video has no music. Upload music you own under Reference music.");
      }
      if (mode === "match" && !wantTrack && refMusic) musicNotes.push("Matching the reference's music needs the song: upload it or pick it under Reference music. This video has no music.");
      let moments: number[] = [];
      let followBeat = true;
      if (wantTrack) {
        setStep("Putting the music in");
        const speaks = cutSpeaks(start.segments, wordsById);
        const res = await call(`/api/studio/builds/${id}/music/${wantTrack}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...startLevels(speaks), ...(speaks ? { duck: true } : {}) }) });
        const j = await json(res);
        const st = j?.soundtrack as Edl["soundtrack"] | undefined;
        if (res?.ok && st && typeof j?.url === "string") {
          start = { ...start, soundtrack: st };
          music = { ...(music ?? {}), [st.trackId]: j.url };
          musicName = st.name;
          musicIn.current = st.trackId;
          const sound = await analysisOfTrack(j.url);
          const videoSec = timeline(start).durationSec;
          const low = speaks ? ", low under the talking" : "";
          // With a reference: the part of the song that moves like the reference's music (lib/music/referenceMusic.ts).
          const lined = sound && refMusic && fromRef ? alignSection(refMusic, envelopeFromRms(sound.rms)) : null;
          const line = lined && lined.level !== "none" ? lined : null;
          // Otherwise the strongest stretch of the sound for a video this long (lib/music/bestPart.ts).
          const part = !line && sound ? bestParts(sound.rms, videoSec, sound.beat).picks[0] : null;
          const startSec = line && sound ? clampStart(line.startSec, sound.durationSec, videoSec) : part?.startSec ?? 0;
          if (startSec > 0) start = { ...start, soundtrack: { ...st, startSec } };
          beat = sound?.beat ? beatFromStart(sound.beat, startSec) : null;
          if (line && refMusic) {
            const speed = line.speed !== 1 ? ` The reference plays it about ${Math.round(Math.abs(line.speed - 1) * 100)}% ${line.speed > 1 ? "faster" : "slower"}; yours plays at its own speed.` : "";
            musicNotes.push(line.level === "matched"
              ? `Music: ${st.name}${low}. Its part ${partLabel(startSec, videoSec)} is the part the reference uses.${speed}`
              : `Music: ${st.name}${low}, from ${partClock(startSec)}: the part that moves most like the reference's music. Choose another part in the editor, under Sound.`);
            // Where the reference's music lifts, a cut lands too.
            moments = refMusic.drops.map((d) => Math.round(d * line.speed * 100) / 100).filter((t) => t > 0.5 && t < videoSec - 0.5);
          } else {
            const partNote = part?.reason ? ` ${part.reason} Choose another part in the editor, under Sound.` : "";
            const missed = fromRef && mode === "match" ? ` It didn't line up with the reference's music, so its strongest part plays.` : "";
            musicNotes.push(`Music: ${st.name}${low}.${missed}${partNote}`);
          }
          if (!beat) musicNotes.push("It has no steady beat SOCIA could measure, so the cuts were not moved onto it.");
          // The reference's cuts don't follow its beat: neither do these.
          if (beat && fromRef && refMusic && refMusic.cutsOnBeat != null && refMusic.cutsOnBeat < 0.35) {
            followBeat = false;
            musicNotes.push("The reference's cuts don't follow its beat, so these don't either.");
          }
        } else {
          musicNotes.push(`The music couldn't be put in (${typeof j?.error === "string" ? j.error.replace(/\.$/, "") : "SOCIA couldn't be reached"}), so this video has none. Add it in the editor, under Sound.`);
        }
      } else if (musicIn.current) {
        // No music asked for this time: the sound the last go put in comes out.
        await call(`/api/studio/builds/${id}/music/${musicIn.current}`, { method: "DELETE" });
        musicIn.current = null;
      }
      setStep(null);
      const scenes = choice.creative.graphics !== "off";
      const opts = { scenes, behind: choice.behind, split: choice.split, skin: choice.skin, sound: choice.sound, beat: followBeat ? beat : null, moments };
      const cut = viaPicture.current ? quickLook(start, chosen, data.sources, opts) : quickCut(start, chosen, data.sources, opts);
      let made = cut.edl;
      const aiNotes: string[] = [];
      // The look settings the person or SOCIA set: on the cut through its theme, the way the editor's own tabs change it.
      const patch = themePatch(choice.creative);
      if (patch && made.theme) made = setThemeOverride(made, patch, { words: wordsById });
      if (choice.creative.aspect !== "9:16") made = { ...made, ...aspectSize(choice.creative.aspect) };
      const ask = choice.prompt.trim();
      const anyWords = Object.values(wordsById).some((w) => w?.length);
      // Pictures of what is being talked about, and of what the person asked for.
      if (scenes && anyWords) {
        setStep("Drawing the pictures");
        const res = await call(`/api/studio/builds/${id}/visuals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: made, prompt: choice.creative.graphics === "lots" ? `${ask} Animated text and graphics on the key points.`.trim() : ask, wanted: choice.fx }) });
        const j = await json(res);
        const n = typeof j?.pictures === "number" ? j.pictures : 0;
        const fxN = typeof j?.effects === "number" ? j.effects : 0;
        if (res?.ok && Array.isArray(j?.scenes) && n + fxN > 0) {
          made = { ...made, scenes: j.scenes as Edl["scenes"] };
          if (fxN) aiNotes.push(`${fxN} effect${fxN === 1 ? "" : "s"} put in: ${(j.scenes as EdlScene[]).filter((x) => x.kind === "effect" && x.fx).map((x) => SCENE_FX[x.fx!].label.toLowerCase()).join(", ")}.`);
          if (n) aiNotes.push(`${n} picture graphic${n === 1 ? "" : "s"} drawn from what is said${ask ? " and what you asked for" : ""}. Change or remove them in the editor, under Words.`);
        } else if (!res?.ok && ask) {
          aiNotes.push(`The pictures couldn't be drawn this time (${typeof j?.error === "string" ? j.error.replace(/\.$/, "") : "SOCIA couldn't be reached"}). Make it again to retry.`);
        }
      }
      // The rest of what the person asked for: the changes the editor can make to a cut. A talking clip's cut follows
      // the prompt and the asks here (its look settings are already on it); a cut from the picture was made from them
      // already, and one made like a reference keeps the reference's pacing.
      const instruction = viaPicture.current
        ? (choice.ref ? "" : ask)
        : composeBrief(ask, { ...choice.creative, captions: "style", transition: "style" }, 600 - NOT_PICTURES.length);
      if (instruction) {
        setStep("Following your instructions");
        const res = await call(`/api/studio/builds/${id}/instruct`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction: instruction.slice(0, 600 - NOT_PICTURES.length) + NOT_PICTURES, edl: made }) });
        const j = await json(res);
        const done = Array.isArray(j?.done) ? (j.done as unknown[]).filter((d): d is string => typeof d === "string") : [];
        if (res?.ok && j?.changed && j.edl) {
          // The pictures and their layout stay as made; a change of cuts moves them with their words.
          const next = j.edl as Edl;
          made = { ...next, ...(made.scenes ? { scenes: made.scenes } : {}), ...(made.scenesSplit ? { scenesSplit: true as const } : {}), ...(made.scenesBehind ? { scenesBehind: true as const } : {}) };
          aiNotes.push(`From your instructions: ${done.slice(0, 6).join("; ")}.`);
        } else if (!res?.ok) {
          aiNotes.push(`Your instructions couldn't be applied to the cut this time (${typeof j?.error === "string" ? j.error.replace(/\.$/, "") : "SOCIA couldn't be reached"}).`);
        }
      }
      // A look at the footage itself, so nothing sits on a face.
      setStep("Looking at the video");
      try {
        const looks = await lookAtCut(samplesFor(made, wordsById), data.sources, { width: made.width, height: made.height }, signal);
        const placed = placeClear(made, looks, wordsById);
        made = placed.edl;
        const pn = placeNote(placed.moved);
        if (pn) aiNotes.push(pn);
      } catch { /* not looked at: everything stays where the look puts it */ }
      setStep(null);
      const saved = await call(`/api/studio/builds/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: made }) });
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
        creative: choice.creative, ref: choice.ref?.name ?? null, voice: Boolean(choice.voice),
        buildId: id, title, blob: out.blob, url, rawUrl: data.sources.length === 1 ? data.sources[0].url : null, stats: st, clips: data.sources.length, clipsUsed: used, picture: viaPicture.current, prompt: choice.prompt.trim(), fx: choice.fx,
        notes: [...cut.notes, ...aiNotes, ...musicNotes], lines: kept.text.map((t) => t.text.trim()).filter(Boolean), report: out.report, edl: kept, look: chosen.id, music: musicName, width: out.width, height: out.height,
      });
      setStage("done");
      onRunning?.(false);
    } catch (e) {
      onRunning?.(false);
      if ((e as Error)?.name === "AbortError") return;
      setStep(null);
      setError((e as Error)?.message || "The video couldn't be made this time. Try again; if it keeps failing, open SOCIA in Chrome or Edge on a computer.");
      setFailedAt(cur);
      setStage("error");
    }
  }, [projectId, clipIds, canTranscribe, canPicture, understand, title, onRunning]);

  // Different clips are a different video: the next "Make the video" starts a new cut.
  useEffect(() => { buildId.current = null; base.current = null; viaPicture.current = false; setPicture(false); }, [clipIds]);

  const choiceNow = (): Choice => ({
    look, lookPicked, trackId, tracks, behind: place === "behind", split: place === "split", prompt, fx: fxPick, skin, sound: soundOn, creative,
    ref, voice: voiceOn && voiceApproved && voiceNotes.trim() ? { notes: voiceNotes.trim(), voiceId } : null,
  });

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
    setPickNote(null);
    onPick(files);
  };
  const again = () => { abort.current?.abort(); setPrompt(""); onReset(); };
  /** Back to the settings with the same clips. The next "Make the video" makes a new cut, and counts where a cut counts. */
  const backToSetup = () => {
    abort.current?.abort(); onRunning?.(false);
    buildId.current = null; base.current = null; viaPicture.current = false; musicIn.current = null;
    setPicture(false); setError(null); setFailedAt(null); setStep(null); setStage("setup");
  };

  /** "Help me write a prompt": SOCIA writes (or improves) the prompt from the clips, the brand, the goal and the reference. Free; nothing is made. */
  const help = async () => {
    if (!projectId || helping) return;
    setHelping(true); setHelpErr(null);
    try {
      const before = prompt;
      const res = await fetch(`/api/studio/projects/${projectId}/brief/enhance`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: before.trim(), help: true, hasReference: Boolean(ref),
          reference: ref ? { durationSec: ref.durationSec, shots: ref.cuts ? ref.cuts.length + 1 : null, speech: Boolean(ref.words?.length) } : null,
          goal: handed?.goal ?? null,
        }),
      }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { prompt?: string; added?: string[]; error?: string } | null) : null;
      if (!res) { setHelpErr("Couldn't reach SOCIA. Check your connection and try again."); return; }
      if (!res.ok || !j?.prompt) { setHelpErr(j?.error ?? "SOCIA couldn't write a prompt this time. Try again."); return; }
      const after = j.prompt.slice(0, PROMPT_MAX);
      setPrompt(after);
      setHelped({ before, after, added: j.added ?? [] });
    } finally {
      setHelping(false);
    }
  };

  const fxBox = (disabled: boolean) => (
    <details className="qe-fx" open={fxPick.length > 0 || undefined}>
      <summary>Motion effects <span>{fxPick.length ? `${fxPick.length} picked: ${fxPick.map((id) => SCENE_FX[id].label.toLowerCase()).join(", ")}` : "SOCIA picks. Press to choose your own."}</span></summary>
      <EffectTiles on={fxPick} disabled={disabled || !scenesOn} onPress={toggleFx} />
      <small>Pick up to four. Each is used once, on the moment it fits best. Pick none and SOCIA decides.</small>
    </details>
  );
  const chips = <K extends CreativeKey>(k: K, label: string, list: readonly (readonly [string | number, string])[]) => (
    <div className="qe-set" role="radiogroup" aria-label={label}>
      <span className="qe-set-label">{label}{k in mine ? <i title="You set this"> · yours</i> : null}</span>
      <div className="qe-chips">
        {list.map(([id, l]) => (
          <button key={String(id)} type="button" role="radio" aria-checked={creative[k] === id} className={`qe-chip${creative[k] === id ? " is-on" : ""}`} onClick={() => setSetting(k, id as Creative[K])}>{l}</button>
        ))}
      </div>
    </div>
  );
  const pick = <K extends CreativeKey>(k: K, label: string, list: readonly (readonly [string, string])[], opts: { disabled?: boolean; note?: string } = {}) => (
    <label className="qe-field" htmlFor={`qe-set-${k}`}>
      <span>{label}{k in mine ? <i title="You set this"> · yours</i> : null}</span>
      <select id={`qe-set-${k}`} value={String(creative[k])} disabled={opts.disabled} onChange={(e) => setSetting(k, e.target.value as Creative[K])}>
        {list.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
      </select>
      {opts.note && <small>{opts.note}</small>}
    </label>
  );
  /** Every setting, for the Customize panel and for "Make it again". Each one changes the cut; none is a promise the editor can't keep. */
  const settings = (disabled: boolean) => (
    <div className="qe-settings">
      <div className="qe-settings-grid">
        <label className="qe-field" htmlFor="qe-set-look">
          <span>Overall style{lookPicked ? <i title="You set this"> · yours</i> : null}</span>
          <select id="qe-set-look" value={look} disabled={disabled} onChange={(e) => pickLook(e.target.value)}>
            {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <small>Best for {/^\p{Lu}(\p{Ll}|\s)/u.test(theme.bestFor) ? theme.bestFor.replace(/^\p{Lu}/u, (c) => c.toLowerCase()) : theme.bestFor}{ref || voiceOn ? ". With a reference or a voiceover, SOCIA keeps the style it makes the cut in unless you pick one here" : ""}</small>
        </label>
        {pick("captions", "Captions", [["style", "The style's own"], ["off", "Off"], ...CAPTION_STYLES.map((c) => [c.id, c.label] as const)], { disabled })}
        {pick("captionAnim", "Caption animation", [["style", "The style's own"], ...CAPTION_ANIMATIONS.map((a) => [a.id, a.label] as const)], { disabled: disabled || creative.captions === "off" })}
        {pick("transition", "Transitions", [["style", "The style's own"], ...TRANSITIONS.map((t) => [t.id, t.label] as const)], { disabled })}
        {pick("colour", "Colour", COLOURS, { disabled })}
        {pick("aspect", "Frame", ASPECTS.map((a) => [a.id, a.label] as const), { disabled })}
        {pick("music", "Music", ref?.music?.musicLikely ? MUSIC_MODES : MUSIC_MODES.filter(([id]) => id === "pick" || id === "none"), { disabled, note: creative.music === "match" ? "The sound below is lined up with the reference's music: the same part, cuts where its music lifts." : creative.music === "similar" ? "SOCIA picks the library sound closest in tempo and energy, unless you choose one below." : undefined })}
        <label className="qe-field" htmlFor="qe-set-sound">
          <span>Sound</span>
          <select value={trackId} disabled={disabled || !tracks.length || creative.music === "none"} id="qe-set-sound" onChange={(e) => { setTrackId(e.target.value); if (e.target.value && creative.music === "none") setSetting("music", "pick"); }}>
            <option value="">{creative.music === "similar" ? "SOCIA picks" : "None"}</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <small>{tracks.length ? "From your playlist. Cuts land on its beat; it sits low under talking." : "Your playlist is empty. Upload a song under Reference music, or add sounds in Content Studio, under Audio."}</small>
        </label>
        <label className="qe-field" htmlFor="qe-set-place">
          <span>Where graphics sit</span>
          <select value={place} disabled={disabled || !scenesOn} id="qe-set-place" onChange={(e) => pickPlace(e.target.value as Place)}>
            <option value="behind">Behind the person</option>
            <option value="over">Card over the picture</option>
            <option value="split">Split screen</option>
          </select>
          {place === "split" && (
            <select value={skin} disabled={disabled || !scenesOn} aria-label="Split screen style" onChange={(e) => { if (isSplitSkin(e.target.value)) pickSkin(e.target.value); }}>
              {SPLIT_SKIN_IDS.map((id) => <option key={id} value={id}>{SPLIT_SKINS[id].label}</option>)}
            </select>
          )}
        </label>
      </div>
      {chips("pace", "Editing pace", PACES)}
      {chips("focus", "What leads", FOCUSES)}
      {chips("graphics", "Animated graphics", GRAPHICS)}
      {chips("durationSec", "Length", DURATIONS.map((d) => [d, d ? `${d} s` : "SOCIA decides"] as const))}
      <label className="qe-check"><input type="checkbox" checked={scenesOn && soundOn} disabled={disabled || !scenesOn} onChange={(e) => pickSound(e.target.checked)} /> Sound effects: a short sound as each graphic lands</label>
      {fxBox(disabled)}
      {(Object.keys(mine).length > 0 || lookPicked) && (
        <button type="button" className="qe-link" disabled={disabled} onClick={resetSettings}>Back to SOCIA&apos;s recommendation</button>
      )}
    </div>
  );

  // ------------------------------------------------------------ the setup ----
  if (stage === "setup") {
    const voiceOk = !voiceOn || (voiceApproved && voiceNotes.trim().length > 0);
    const picturePath = footageCount > 1 || Boolean(ref) || voiceOn;
    const locked = canPicture === false && picturePath;
    const promptOk = prompt.trim().length >= 3;
    const analysisCr = picturePath && !understood ? actionCredits("content_build") : 0;
    const videoCr = picturePath ? actionCredits("video_builds") : 0;
    const voiceCr = voiceOn ? actionCredits("voiceovers") : 0;
    const total = analysisCr + videoCr + voiceCr;
    const why = blocker ? blocker
      : !locals.length ? "Add your footage first."
      : !settled ? "Wait for your clips to finish uploading."
      : !ready.length ? "None of these clips could be added. Remove them and add others."
      : !promptOk ? "Write what you want your video to look like."
      : reference.reading ? "Wait for SOCIA to finish reading the reference."
      : !voiceOk ? "Approve the voiceover script, or switch the voiceover off."
      : locked ? (footageCount > 1 ? MANY_LOCKED : "A video made like a reference or with a voiceover is included from Starter. Remove them to cut this clip on your plan.")
      : null;
    const canMake = !why;
    const footage = locals.reduce((a, l) => a + (l.durationSec ?? 0), 0);
    const shots = ref?.cuts ? ref.cuts.length + 1 : null;
    const ownWords = helped && helped.after === prompt;
    return (
      <section className="qe qe-make" aria-labelledby="qe-h">
        <Inspiration chosen={ref || reference.reading ? refFromReel : null} onUse={(r) => { const known = sourceOfReel(r); setRefFromReel(r.url); setRefMode(null); void reference.readReel(r.url, { known, served: servedVideoOf(r), handle: known.handle, from: "discover" }); }} />
        <div className="qe-hero">
          <motion.span className="qe-eyebrow" {...rise(0)}>AI video editor</motion.span>
          <motion.h2 id="qe-h" {...rise(1)}>Raw footage in. <em>Finished video</em> out.</motion.h2>
          <motion.p {...rise(2)}>Add your clips and say what you want. SOCIA cuts, captions, animates and mixes it to your prompt, then makes a ready-to-post video on this computer.</motion.p>
        </div>

        {/* 1. The footage */}
        {!locals.length ? (
          blocker ? (
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
          )
        ) : (
          <div className="qe-panel qe-footage">
            <div className="qe-sec-head">
              <b>Your footage</b>
              <span>{[`${locals.length} clip${locals.length === 1 ? "" : "s"}`, footage > 0 ? clock(footage) : null, uploading ? "adding" : null].filter(Boolean).join(" · ")}</span>
              <button type="button" className="qe-btn is-small" onClick={() => input.current?.click()}><Upload size={13} aria-hidden /> Add more</button>
            </div>
            <ClipGrid clips={locals} onRemove={onRemove} busy={uploading} />
          </div>
        )}
        <input ref={input} type="file" hidden multiple accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { if (e.target.files) take(e.target.files); e.target.value = ""; }} />
        {pickNote && <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {pickNote}</p>}

        <div className="qe-panel">
          {/* 2. What it should look like: always asked, before anything is made */}
          <div className="qe-sec">
            <label className="qe-sec-title" htmlFor="qe-prompt">What do you want your video to look like?</label>
            <div className="qe-prompt-box">
              <textarea
                id="qe-prompt" rows={4} className={prompt.length > 240 ? "is-long" : undefined} maxLength={PROMPT_MAX} value={prompt} disabled={helping}
                placeholder={speech.listening ? "Listening. Press the microphone again when you're done." : "Describe the video you want to create. Tell SOCIA the story, editing style, message, or overall feeling you have in mind. For example: “Create a fast-paced pizza advertisement with close-up shots, bold captions, smooth transitions, and an engaging voiceover.”"}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <MicButton supported={speech.supported} listening={speech.listening} disabled={helping} onToggle={toggleMic} size="large" labelIdle="Say what you want" />
            </div>
            <div className="qe-row">
              <button type="button" className="qe-btn is-small" disabled={!projectId || helping || canPicture === false} onClick={() => void help()}>
                {helping ? <Loader2 size={13} className="spin" aria-hidden /> : <PenLine size={13} aria-hidden />} {helping ? "Writing your prompt" : prompt.trim() ? "Help me improve this prompt" : "Help me write a prompt"}
              </button>
              {ownWords && <button type="button" className="qe-btn is-small is-quiet" onClick={() => { setPrompt(helped.before); setHelped(null); }}><Undo2 size={13} aria-hidden /> Use my words</button>}
              <small>
                {canPicture === false ? "SOCIA writing the prompt for you is included from Starter."
                  : !projectId ? "Add your footage first, so SOCIA writes it from what is in your clips."
                  : ownWords ? `Written by SOCIA${helped.added.length ? `: added ${helped.added.join(", ")}` : ""}. Change anything before you make it.`
                  : "From your clips, your business, the reference and what this video is for. Free; nothing is made."}
              </small>
            </div>
            {helpErr && <p className="qe-err" role="alert"><AlertTriangle size={14} aria-hidden /> {helpErr}</p>}
            {speech.error && <small className="qe-prompt-err" role="alert">{speech.error}</small>}
          </div>

          {/* 3. A video to make it like */}
          <div className="qe-sec">
            <div className="qe-sec-title">Reference video <span>Optional</span></div>
            {ref || reference.source ? (
              <div className="qe-ref-card">
                {reference.source?.thumb
                  // eslint-disable-next-line @next/next/no-img-element -- the platform's own cover image
                  ? <img src={reference.source.thumb} alt="" referrerPolicy="no-referrer" />
                  : ref?.frames[0]
                    // eslint-disable-next-line @next/next/no-img-element -- a frame read from the reference in this browser
                    ? <img src={`data:image/jpeg;base64,${ref.frames[0].jpeg}`} alt="" />
                    : <span className="qe-ref-blank"><Film size={16} aria-hidden /></span>}
                <span>
                  <b>{reference.source ? (reference.source.handle ? `@${reference.source.handle}` : reference.source.account ?? "Instagram Reel") : ref!.name}</b>
                  {reference.source?.caption && <small className="qe-ref-cap">{reference.source.caption}</small>}
                  <small>
                    {reference.reading ? <><Loader2 size={11} className="spin" aria-hidden /> {reference.reading}…</>
                      : ref ? [`Video studied: ${ref.durationSec} s`, shots ? `${shots} shot${shots === 1 ? "" : "s"}` : null, ref.words?.length ? "speech heard" : null].filter(Boolean).join(" · ")
                      : "Video not studied: the cut follows your prompt"}
                  </small>
                </span>
                {reference.source && <a className="qe-link" href={reference.source.link} target="_blank" rel="noopener noreferrer">Original</a>}
                <button type="button" className="ov-x" aria-label="Remove the reference" onClick={() => { reference.clear(); setRefFromReel(null); }}><X size={14} /></button>
              </div>
            ) : reference.reading ? (
              <p className="qe-fine" role="status"><Loader2 size={13} className="spin" aria-hidden /> {reference.reading}…</p>
            ) : (
              <div className="qe-row">
                <button type="button" className="qe-btn is-small" onClick={() => refInput.current?.click()}><Upload size={13} aria-hidden /> Upload a video</button>
                <button type="button" className="qe-btn is-small" aria-expanded={refMode === "link"} onClick={() => setRefMode((m) => (m === "link" ? null : "link"))}><Link2 size={13} aria-hidden /> Paste a Reel link</button>
                <button type="button" className="qe-btn is-small" aria-expanded={refMode === "clips"} onClick={openLibrary}><Film size={13} aria-hidden /> From your clips</button>
              </div>
            )}
            <input ref={refInput} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRefFromReel(null); setRefMode(null); void reference.readFile(f); } e.target.value = ""; }} />
            {!ref && !reference.reading && refMode === "link" && (
              <form className="qe-row" onSubmit={(e) => { e.preventDefault(); if (linkText.trim()) { setRefFromReel(null); void reference.readReel(linkText.trim(), { handle: handleText.trim() || null }); } }}>
                <input className="qe-input" type="url" inputMode="url" placeholder="instagram.com/reel/…" value={linkText} onChange={(e) => setLinkText(e.target.value)} aria-label="Reel link" />
                {reference.needHandle && <input className="qe-input" placeholder="@account" value={handleText} onChange={(e) => setHandleText(e.target.value)} aria-label="Whose Reel it is" />}
                <button type="submit" className="qe-btn is-small" disabled={!linkText.trim()}>Use this Reel</button>
              </form>
            )}
            {!ref && !reference.reading && refMode === "clips" && (
              library == null ? <p className="qe-fine"><Loader2 size={13} className="spin" aria-hidden /> Loading your clips…</p>
                : !library.length ? <p className="qe-fine">You have no clips kept yet.</p>
                : (
                  <ul className="qe-lib">
                    {library.slice(0, 24).map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => { setRefFromReel(null); setRefMode(null); void reference.readClip(c.id, c.name); }}>
                          {c.thumb
                            // eslint-disable-next-line @next/next/no-img-element -- a frame of the person's own clip
                            ? <img src={c.thumb} alt="" loading="lazy" />
                            : <span className="qe-ref-blank"><Film size={14} aria-hidden /></span>}
                          <small>{fileLabel(c.name) ?? c.name}{c.durationSec ? ` · ${clock(c.durationSec)}` : ""}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
            )}
            {reference.note && <small className="qe-note">{reference.note}</small>}
            {ref?.music && (
              <ReferenceMusicCard music={ref.music} needSec={creative.durationSec || ref.durationSec} tracks={tracks} trackId={trackId} mode={creative.music} disabled={false}
                onTracks={setTracks} onChoose={(c) => { setTrackId(c.trackId); setSetting("music", c.mode); }}
                onCustomize={() => { setCustomize(true); window.setTimeout(() => document.getElementById("qe-set-sound")?.focus(), 50); }} />
            )}
            <small>Your prompt decides what the video says. The reference shows how: its length, pace, order of shots and text style, made with your clips, never its footage.</small>
          </div>

          {/* 4. Creative direction: SOCIA's recommendation, every setting open to change */}
          <div className="qe-sec qe-dir">
            <div className="qe-dir-head">
              <div>
                <div className="qe-sec-title">Creative direction</div>
                <p className="qe-dir-sum">{creativeSummary(creative, theme.name)}</p>
                <small>{rec.reasons.length ? rec.reasons.join(" ") : "SOCIA decides the rest from your clips and your prompt as it cuts."}</small>
              </div>
              <button type="button" className="qe-btn is-small" aria-expanded={customize} onClick={() => setCustomize((o) => !o)}><SlidersHorizontal size={13} aria-hidden /> {customize ? "Done" : "Customize"}</button>
            </div>
            {customize && settings(false)}
          </div>

          {/* 5. A voiceover, written from a theme and approved before any audio is made */}
          <div className="qe-sec">
            <label className="qe-check"><input type="checkbox" checked={voiceOn} disabled={canPicture === false} onChange={(e) => setVoiceOn(e.target.checked)} /> Add a voiceover</label>
            {canPicture === false && <small>A voiceover is included from Starter. <Link href="/pricing">See plans</Link></small>}
            {voiceOn && (
              <VoiceoverAsk notes={voiceNotes} onNotes={setVoiceNotes} voiceId={voiceId} onVoice={setVoiceId} approved={voiceApproved} onApproved={setVoiceApproved} onPending={setVoicePending} prompt={creative.durationSec ? `Make it about ${creative.durationSec} seconds long. ${prompt}` : prompt} disabled={false} mustApprove />
            )}
            {voiceOn && <small>The audio is made only when you make the video, reading the script you approved word for word, and timed to the cut.</small>}
          </div>

          {/* 6. What will be made, and what it counts */}
          <div className="qe-sec qe-sum" aria-labelledby="qe-sum-h">
            <div className="qe-sec-title" id="qe-sum-h">Before you make it</div>
            <dl className="qe-sum-list">
              <div><dt>Footage</dt><dd>{locals.length ? [`${ready.length} of ${locals.length} clip${locals.length === 1 ? "" : "s"} ready`, footage > 0 ? clock(footage) : null].filter(Boolean).join(" · ") : "None yet"}</dd></div>
              <div><dt>Prompt</dt><dd>{promptOk ? (prompt.trim().length > 140 ? `${prompt.trim().slice(0, 140).replace(/\s+\S*$/, "")}…` : prompt.trim()) : "Not written yet"}</dd></div>
              <div><dt>Reference</dt><dd>{ref ? (reference.source?.handle ? `@${reference.source.handle}'s Reel` : ref.name) : reference.source ? `${reference.source.handle ? `@${reference.source.handle}'s Reel` : "A Reel"}, video not studied` : "None"}</dd></div>
              <div><dt>Direction</dt><dd>{creativeSummary(creative, theme.name)}</dd></div>
              <div><dt>Voiceover</dt><dd>{!voiceOn ? "None" : voiceOk ? "Script approved" : "Waiting for your approved script"}</dd></div>
              <div><dt>Length</dt><dd>{durationLabel(creative.durationSec)} · {aspectLabel(creative.aspect)}</dd></div>
            </dl>
            <ul className="qe-cost" aria-label="What it counts">
              {picturePath ? (
                <>
                  <li><span>Footage analysis</span><b>{understood ? "Done already, not counted again" : `${analysisCr} credits`}</b></li>
                  <li><span>AI-made video</span><b>{videoCr} credits</b></li>
                </>
              ) : (
                <li><span>Cutting one talking clip</span><b>Free</b></li>
              )}
              {voiceOn && <li><span>Voiceover audio</span><b>{voiceCr} credits</b></li>}
              <li className="is-total"><span>Total</span><b>{total ? `${total} credits` : "Free"}</b></li>
            </ul>
            {!picturePath && canPicture !== false && locals.length > 0 && (
              <small>If no one speaks in the clip, SOCIA cuts it by the picture instead: a footage analysis and an AI-made video{understood ? "" : `, ${actionCredits("content_build") + actionCredits("video_builds")} credits`}.</small>
            )}
            <div className="qe-make-row">
              <button type="button" className="qe-btn is-primary is-big" disabled={!canMake} onClick={() => void run(choiceNow())}><Scissors size={15} aria-hidden /> Make the video</button>
              {ready.length > 0 && settled && <button type="button" className="qe-link" disabled={manualBusy} onClick={onManual}>{manualBusy ? "Opening the editor…" : "Or edit it by hand"}</button>}
            </div>
            {why && <small className="qe-why" role="status">{why}</small>}
          </div>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------- the result ----
  if (result && stage === "done") {
    const faults = renderFaults(result.report);
    const s = result.stats;
    const lookName = themeById(result.look)?.name ?? result.look;
    const changed = fxPick.join() !== result.fx.join() || prompt.trim() !== result.prompt || look !== result.look || (trackId ? tracks.find((t) => t.id === trackId)?.name ?? "" : null) !== result.music || JSON.stringify(creative) !== JSON.stringify(result.creative) || (s.scenes > 0 && soundOn !== Boolean(result.edl.scenesSound)) || (s.scenes > 0 && (place !== placeOf(result.edl) || (place === "split" && skin !== (result.edl.scenesSkin ?? "socia"))));
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
              <summary>Make it again with other settings</summary>
              <div className="qe-prompt-box">
                <textarea id="qe-done-prompt" aria-label="What you want your video to look like" rows={3} maxLength={PROMPT_MAX} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <MicButton supported={speech.supported} listening={speech.listening} disabled={false} onToggle={toggleMic} size="large" labelIdle="Say what you want" />
              </div>
              {settings(false)}
              <div className="qe-actions">
                <button type="button" className="qe-btn" disabled={!changed} onClick={() => void run(choiceNow())}><RefreshCw size={14} aria-hidden /> Make it again</button>
                <button type="button" className="qe-btn is-quiet" onClick={backToSetup}><ArrowLeft size={14} aria-hidden /> Change the footage, reference or voiceover</button>
              </div>
              <p className="qe-fine">Make it again keeps these clips and the same starting cut{result.ref ? `, made like ${result.ref},` : ""} and applies your instructions, the look, the music and the graphics again. No new cut is counted.{result.ref ? " A new prompt changes the words and pictures, not the reference's pacing." : ""} A different reference, voiceover or set of clips makes a new cut.</p>
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
  const showPicture = picture || many || direct;
  const order: Stage[] = showPicture ? (many || direct ? ["upload", "picture", "cut", "render", "check"] : ["upload", "words", "picture", "cut", "render", "check"]) : ["upload", "words", "cut", "render", "check"];
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
            {stage === "error" && ready.length > 0 && <button type="button" className="qe-btn is-primary" onClick={() => void run(choiceNow())}><RefreshCw size={14} aria-hidden /> Try again</button>}
            {stage === "error" && <button type="button" className="qe-btn" onClick={backToSetup}><ArrowLeft size={14} aria-hidden /> Back to the settings</button>}
            {stage === "error" && buildId.current && <button type="button" className="qe-btn" onClick={() => onOpenEditor(buildId.current!, title)}>Open it in the editor instead</button>}
            {allFailed || stage === "error"
              ? <button type="button" className="qe-btn is-quiet" onClick={again}>Use other footage</button>
              : <button type="button" className="qe-btn is-quiet" onClick={backToSetup}>Stop</button>}
          </div>
          {!allFailed && stage !== "error" && <p className="qe-fine">Keep this tab open. The video is made on this computer, so more footage takes longer.</p>}
        </div>
      </div>
    </section>
  );
}
