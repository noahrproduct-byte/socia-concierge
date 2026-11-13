"use client";

// The video editor. Two kinds of build share it: SOCIA's first cut of a post
// (Make This Video, Starter and up) and the person's own edit of their clips
// (Editor V1, every plan; no AI regenerate). Previewed by Remotion from the
// EDL: reorder, trim (by step or at the playhead), split, replace, delete,
// aspect ratio and reframe, text lines as presets (components/studio/TextLayersPanel.tsx),
// captions on/off, undo/redo. The video is rendered HERE
// in the browser (WebCodecs) and saved as a DRAFT post — nothing is scheduled
// or published without the person doing it in Create Post.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Player, type PlayerRef } from "@remotion/player";
import { ChevronLeft, Save, ArrowUp, ArrowDown, Trash2, Captions, Info, RefreshCw, Loader2, AlertTriangle, Clapperboard, ArrowRight, Check, Music, Crop, SkipBack, SkipForward, Palette, Volume2, VolumeX } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ClipComposition } from "./remotion/ClipComposition";
import AudioPanel from "./AudioPanel";
import MusicPlaylist from "./MusicPlaylist";
import VoiceoverCard from "./VoiceoverCard";
import FinishPanel from "./FinishPanel";
import TextLayersPanel from "./TextLayersPanel";
import { useSafeZoneGuide } from "./TextOverlay";
import Timeline, { editorKey, type TimelineSelection } from "./Timeline";
import { reorder, tracksFor, trimCut } from "@/lib/studioClips/tracks";
import { cleanSounds, releaseCleanSounds } from "@/lib/studioClips/cleanSound";
import EndCardPanel from "./EndCardPanel";
import { timeline } from "@/lib/studioClips/timeline";
import { speechShare, speechSpans } from "@/lib/studioClips/musicDuck";
import { autoLook, wantsAutoLook } from "@/lib/studioClips/autoLook";
import type { ClipMeasure } from "@/lib/studioClips/measure";
import { alignToBeats } from "@/lib/studioClips/beats";
import { beatOfTrack } from "@/lib/studioClips/beatClient";
import { clipsForEdl } from "@/lib/studioClips/clientClips";
import type { Beat } from "@/lib/audio/features";
import { MAX_WITH_FINDINGS, pacingReport, pacingRules } from "@/lib/studioClips/pacing";
import { EDIT_STYLES, EDIT_STYLE_IDS, isEditStyle, type EditStyleId } from "@/lib/studioClips/profiles";
import { checkCut, CHECK_LABEL } from "@/lib/studioClips/cutCheck";
import { renderFaults, type RenderReport } from "@/lib/studioClips/renderCheck";
import { emphasisLabels, pickEmphasis } from "@/lib/studioClips/emphasis";
import { inspectRender } from "@/lib/studioClips/inspectRender";
import { bestMomentFor } from "@/lib/studioClips/rank";
import { readLocalDraft, writeLocalDraft, clearLocalDraft, SOURCE_REFRESH_MS } from "@/lib/studioClips/localDraft";
import { remotionLicenseKey } from "@/lib/studioClips/renderLicense";
import "@/app/(app)/studio/studio.css";
import "@/app/(app)/studio/studio-motion.css";
import "@/app/(app)/dashboard/dashboard.css";
import { motion } from "framer-motion";
import { Bar, Details, Reveal, Ring, useMotionOk } from "@/components/dashboard/motion";
import { CAPCUT_FONTS, CAPTION_STYLES, DEFAULT_STYLE, FONTS, captionStyle, withCaptionStyle, type EdlStyle, type VideoPresets } from "@/lib/studioClips/style";
import { ASPECTS, clipLabel, fmtClock, OUTPUT, REGENERATE_OPTIONS, MAX_REGENERATIONS, TRANSITIONS, type BuildPlayerData, type BuildSource, type Edl, type RegenerateDirective, type StudioBuild, type TransitionKind } from "@/lib/studioClips/types";

const MIN_SEG = 0.8;
const r2 = (n: number) => Number(n.toFixed(2));

/**
 * Two panes, A then B, joined the way the transition joins two cuts: a hard
 * cut, a fade, a zoom or a whip. The join plays once (0.5 s) when the option
 * is pointed at, focused or chosen, then rests on its finished state; with
 * reduced motion it only shows the finished state.
 */
const THUMB_FROM: Record<TransitionKind, { opacity: number; scale: number; x: string }> = {
  cut: { opacity: 0, scale: 1, x: "0%" }, fade: { opacity: 0, scale: 1, x: "0%" }, zoom: { opacity: 0, scale: 1.6, x: "0%" }, whip: { opacity: 1, scale: 1, x: "100%" }, flash: { opacity: 0, scale: 1, x: "0%" },
  tape: { opacity: 1, scale: 1, x: "0%" }, slide: { opacity: 1, scale: 1, x: "100%" },
};
function TransitionThumb({ kind, play }: { kind: TransitionKind; play: number }) {
  const ok = useMotionOk();
  const hard = kind === "cut" || kind === "flash" || kind === "tape";
  const t = hard ? { duration: 0 } : { duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] };
  return (
    <span className={`sd-tthumb is-${kind}`} aria-hidden>
      <motion.i className="is-a" key={`a${play}`} initial={{ x: "0%" }} animate={{ x: kind === "whip" ? "-100%" : "0%" }} transition={ok ? t : { duration: 0 }} />
      <motion.i className="is-b" key={`b${play}`} initial={ok ? THUMB_FROM[kind] : { opacity: 1, scale: 1, x: "0%" }} animate={{ opacity: 1, scale: 1, x: "0%" }} transition={ok ? (hard ? { duration: 0, delay: 0.25 } : t) : { duration: 0 }} />
      {kind === "flash" && ok ? <motion.i key={`f${play}`} style={{ position: "absolute", inset: 0, background: "#fff", pointerEvents: "none" }} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.2, delay: 0.25, times: [0, 0.3, 1] }} /> : null}
    </span>
  );
}

/** One transition option: the thumbnail plays when pointed at, focused or picked. */
function TransitionOption({ kind, label, on, disabled, onPick }: { kind: TransitionKind; label: string; on: boolean; disabled: boolean; onPick: () => void }) {
  const [play, setPlay] = useState(0);
  const bump = () => setPlay((n) => n + 1);
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => { bump(); onPick(); }} onPointerEnter={bump} onFocus={bump}>
      <TransitionThumb kind={kind} play={play} />
      <span>{label}</span>
    </button>
  );
}

/** The finish: a check that scales in once, then holds. With reduced motion it is simply there. */
function Finished({ message }: { message: string }) {
  const ok = useMotionOk();
  return (
    <div className="sd-done" role="status">
      <motion.span className="sd-done-mark" initial={ok ? { scale: 0.4, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={ok ? { duration: 0.45, ease: [0.23, 1, 0.32, 1] } : { duration: 0 }}><Check aria-hidden /></motion.span>
      <span><b>Your video is made.</b><small>{message}</small></span>
    </div>
  );
}

type ExportPhase = "idle" | "checking" | "rendering" | "inspecting" | "review" | "uploading" | "saving" | "done" | "error";
/** `report`: what SOCIA saw when it watched the finished video (lib/studioClips/renderCheck.ts). */
type ExportState = { phase: ExportPhase; progress: number; message: string | null; postId: string | null; report?: RenderReport | null };

export default function ClipBuilder({ buildId, title, onBack, fixture, initialPanel }: {
  buildId: string; title: string; onBack: () => void; fixture?: BuildPlayerData;
  /** the tab to open on (the Audio tab opens on Music; a fix from Rate opens on its own tab) */
  initialPanel?: "cut" | "text" | "finish" | "audio";
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<BuildPlayerData | null>(fixture ?? null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [edl, setEdl] = useState<Edl | null>(fixture?.build.edl ?? null);
  const [past, setPast] = useState<Edl[]>([]);
  const [future, setFuture] = useState<Edl[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [regen, setRegen] = useState<RegenerateDirective | null>(null);
  const [regenErr, setRegenErr] = useState<string | null>(null);
  const [exp, setExp] = useState<ExportState>({ phase: "idle", progress: 0, message: null, postId: null });
  const [panel, setPanel] = useState<"cut" | "frame" | "style" | "text" | "finish" | "audio" | "regenerate">(initialPanel ?? "cut");
  // Music added on its own (Growth/Pro, once per cut, unless the brand turned it off): lib/music, music/auto.
  const [autoMusic, setAutoMusic] = useState<{ state: "adding" | "added" | "skipped" | "failed"; note: string | null } | null>(null);
  const [musicAutoOn, setMusicAutoOn] = useState<boolean | null>(null);
  const [presets, setPresets] = useState<VideoPresets>({ brand: null, templates: [] });
  const [tplName, setTplName] = useState("");
  const [styleNote, setStyleNote] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "medium">("high");
  // A short message from the last action that couldn't be done, or what the beat snap did.
  const [hereNote, setHereNote] = useState<string | null>(null);
  // Before/After for the measured corrections; the export always uses After.
  const [compare, setCompare] = useState<"before" | "after">("after");
  // The text safe zone over the preview (a check for us; never in the export).
  const [guide, setGuide, guideAvailable] = useSafeZoneGuide();
  const player = useRef<PlayerRef>(null);
  const abort = useRef<AbortController | null>(null);

  // When the clips' links were signed (they last an hour: lib/studioClips/storage.ts); refreshed before they run out.
  const signedAt = useRef(Date.now());
  const [loadTry, setLoadTry] = useState(0);
  // An edit left unsaved when the page closed (lib/studioClips/localDraft.ts), offered back once.
  const [localDraft, setLocalDraft] = useState<Edl | null>(null);
  useEffect(() => {
    if (fixture) return;
    let alive = true;
    setLoadErr(null);
    (async () => {
      const res = await fetch(`/api/studio/builds/${buildId}`).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!alive) return;
      if (!res) { setLoadErr("Couldn't reach SOCIA. Check your connection and try again."); return; }
      if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setLoadErr(j?.error ?? "Couldn't load this build."); return; }
      signedAt.current = Date.now();
      setData(j); setEdl(j.build.edl);
      const kept = readLocalDraft(buildId, j.build.edl);
      if (kept) setLocalDraft(kept);
    })();
    return () => { alive = false; };
  }, [buildId, fixture, loadTry]);
  useEffect(() => () => { abort.current?.abort(); releaseCleanSounds(); }, []);

  /** The clips' links signed again (the same cut, fresh URLs), so a long session never plays or renders an expired link. */
  const refreshSources = useCallback(async (): Promise<boolean> => {
    if (fixture) return true;
    const res = await fetch(`/api/studio/builds/${buildId}`).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as BuildPlayerData | null) : null;
    if (!j) return false;
    signedAt.current = Date.now();
    setData((d) => (d ? { ...d, sources: j.sources, music: j.music, voice: j.voice } : j));
    if (j.music) setTrackUrls((u) => ({ ...u, ...j.music }));
    if (j.voice) setVoiceUrls((u) => ({ ...u, ...j.voice }));
    return true;
  }, [buildId, fixture]);
  useEffect(() => {
    if (fixture) return;
    const t = setInterval(() => { if (Date.now() - signedAt.current > SOURCE_REFRESH_MS) void refreshSources(); }, 60_000);
    return () => clearInterval(t);
  }, [fixture, refreshSources]);

  useEffect(() => { if (data?.presets) setPresets(data.presets); }, [data?.presets]);

  // Once the cut is loaded: a cut with no track that SOCIA hasn't tried before gets one, from the brand's taste.
  const autoTried = useRef(false);
  useEffect(() => {
    if (fixture || !data?.canEdit || !edl || autoTried.current) return;
    autoTried.current = true;
    if (edl.soundtrack || edl.musicAuto) return;
    let alive = true;
    setAutoMusic({ state: "adding", note: null });
    (async () => {
      const res = await fetch(`/api/studio/builds/${buildId}/music/auto`, { method: "POST" }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { state?: string; playlist?: Edl["playlist"]; soundtrack?: Edl["soundtrack"]; url?: string | null; error?: string; notConfigured?: boolean } | null) : null;
      if (!alive) return;
      const stamp = new Date().toISOString();
      if (res?.ok && j?.state === "added" && j.playlist && j.soundtrack) {
        setEdl((e) => (e ? { ...e, playlist: j.playlist, soundtrack: j.soundtrack, musicAuto: stamp } : e));
        if (j.url) setTrackUrls((u) => ({ ...u, [j.soundtrack!.trackId]: j.url! }));
        setAutoMusic({ state: "added", note: null });
        return;
      }
      setEdl((e) => (e ? { ...e, musicAuto: e.musicAuto ?? stamp } : e));
      // The month's music tracks are used up: say so, never a silent "no track yet".
      if (isPlanError(j) && j.code === "usage_exhausted") { setAutoMusic({ state: "skipped", note: `${j.error} This video has no music until they reset.` }); return; }
      // Not on the plan, not switched on, or turned off: the Music tab says so; nothing else changes.
      if (res?.ok || isPlanError(j) || j?.notConfigured) { setAutoMusic({ state: "skipped", note: null }); return; }
      setAutoMusic({ state: "failed", note: j?.error ?? "SOCIA couldn't add music this time. Pick a track in Music." });
    })();
    return () => { alive = false; };
    // Once per opened cut, after it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.canEdit, edl == null]);

  // Once the cut is loaded: a cut nobody talks in that wants a voice gets a voiceover, once per cut
  // (lib/studioClips/voiceover.ts needsVoiceover; the server decides and stamps the cut).
  const [autoVoice, setAutoVoice] = useState<{ state: "adding" | "added" | "skipped" | "failed"; note: string | null } | null>(null);
  const voiceTried = useRef(false);
  useEffect(() => {
    if (fixture || !data?.canEdit || !edl || voiceTried.current) return;
    voiceTried.current = true;
    if (edl.voiceover || edl.voiceAuto) return;
    let alive = true;
    setAutoVoice({ state: "adding", note: null });
    (async () => {
      const res = await fetch(`/api/studio/builds/${buildId}/voiceover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ auto: true }) }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { state?: string; why?: string; voiceover?: Edl["voiceover"]; urls?: Record<string, string>; error?: string; notConfigured?: boolean } | null) : null;
      if (!alive) return;
      const stamp = new Date().toISOString();
      if (res?.ok && j?.state === "added" && j.voiceover) {
        if (j.urls) setVoiceUrls((u) => ({ ...u, ...j.urls }));
        // The server saved it, and turned captions on so the words can be read.
        setEdl((e) => (e ? { ...e, voiceover: j.voiceover, voiceAuto: stamp, captions: e.captions ?? { source: "transcript" } } : e));
        setAutoVoice({ state: "added", note: null });
        return;
      }
      if (res?.ok && j?.state === "not_needed") { setAutoVoice({ state: "skipped", note: j.why ? `SOCIA didn't add one because ${j.why}. You can still write one.` : null }); return; }
      if (res?.ok || isPlanError(j) || j?.notConfigured) { setAutoVoice({ state: "skipped", note: null }); return; }
      setEdl((e) => (e ? { ...e, voiceAuto: e.voiceAuto ?? stamp } : e));
      setAutoVoice({ state: "failed", note: `${j?.error ?? "SOCIA couldn't add a voiceover this time."} Nothing was counted.` });
    })();
    return () => { alive = false; };
    // Once per opened cut, after it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.canEdit, edl == null]);

  // Once the cut is loaded: colour it on its own, once per cut (lib/studioClips/autoLook.ts).
  // It goes in as one edit, so Undo takes it back and Look can change it or switch it off.
  const [lookState, setLookState] = useState<{ state: "working" | "done"; corrected: number; done: number; total: number } | null>(null);
  // What the colour pass measured: the Look & sound tab starts from it instead of measuring again.
  const [measures, setMeasures] = useState<Record<string, ClipMeasure> | null>(null);
  const lookTried = useRef(false);
  const edlRef = useRef<Edl | null>(null);
  const dirtyRef = useRef(false);
  useEffect(() => { edlRef.current = edl; dirtyRef.current = dirty; }, [edl, dirty]);
  const sourceCount = data?.sources?.length ?? 0;
  useEffect(() => {
    if (fixture || !data?.canEdit || !edl || lookTried.current || !sourceCount) return;
    lookTried.current = true;
    if (!wantsAutoLook(edl)) return;
    const ctrl = new AbortController();
    setLookState({ state: "working", corrected: 0, done: 0, total: sourceCount });
    (async () => {
      const out = await autoLook(edl, sources, ctrl.signal, (done, total) => setLookState({ state: "working", corrected: 0, done, total })).catch(() => null);
      if (!out || ctrl.signal.aborted) return;
      const cur = edlRef.current;
      if (out.measures) setMeasures(out.measures);
      setLookState({ state: "done", corrected: out.corrected, done: sourceCount, total: sourceCount });
      // The person set a look in the meantime: theirs stays.
      if (!cur || cur.finish || cur.lookAuto) return;
      const next: Edl = { ...cur, ...(out.edl.finish ? { finish: out.edl.finish } : {}), lookAuto: out.edl.lookAuto };
      commit(next);
      // Saved right away unless the person has unsaved edits, which then save together.
      if (!dirtyRef.current) await save(next);
    })();
    return () => ctrl.abort();
    // Once per opened cut, after it and its clips load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.canEdit, edl == null, sourceCount]);

  useEffect(() => {
    if (fixture || panel !== "audio" || musicAutoOn != null) return;
    fetch("/api/studio/music").then((r) => (r.ok ? r.json() : null)).then((j) => setMusicAutoOn(typeof j?.auto === "boolean" ? j.auto : null)).catch(() => null);
  }, [panel, fixture, musicAutoOn]);
  const toggleMusicAuto = async (on: boolean) => {
    setMusicAutoOn(on);
    const res = await fetch("/api/studio/music", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ auto: on }) }).catch(() => null);
    if (!res?.ok) setMusicAutoOn(!on);
  };
  const sources = useMemo(() => Object.fromEntries((data?.sources ?? []).map((s) => [s.clipId, s])) as Record<string, BuildSource>, [data]);
  const tl = useMemo(() => (edl ? timeline(edl) : null), [edl]);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  // How much of the cut has speech, from the transcript's own word timings (the music panel offers ducking only when there is some).
  const speechPct = useMemo(() => {
    if (!edl || !tl) return 0;
    const spans = speechSpans(edl, Object.fromEntries(Object.values(sources).map((x) => [x.clipId, x.words])));
    return Math.round(speechShare(spans, tl.durationSec) * 100);
  }, [edl, tl, sources]);
  const anySpeech = useMemo(() => (edl ? edl.segments.some((s) => sources[s.clipId]?.words?.length) : false), [edl, sources]);
  const captionsOn = Boolean(edl?.captions);
  // The soundtrack's playable link: made tracks are signed when the cut loads, and when one is made here.
  const [trackUrls, setTrackUrls] = useState<Record<string, string>>({});
  useEffect(() => { if (data?.music) setTrackUrls((u) => ({ ...data.music, ...u })); }, [data?.music]);
  const musicUrl = edl?.soundtrack ? trackUrls[edl.soundtrack.trackId] ?? null : null;
  // The voiceover's voiced lines, signed URL by storage path (lib/studioClips/voiceover.ts).
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  useEffect(() => { if (data?.voice) setVoiceUrls((u) => ({ ...data.voice, ...u })); }, [data?.voice]);
  const voiceOn = Boolean(edl?.voiceover?.on && edl.voiceover.lines.some((l) => l.path && voiceUrls[l.path]));
  // The track's beat, measured here from the track itself; the tempo it was made at when that fails.
  const [beat, setBeat] = useState<(Beat & { trackId: string }) | null>(null);
  const trackBpm = edl?.soundtrack ? edl.playlist?.tracks.find((t) => t.id === edl.soundtrack!.trackId)?.bpm ?? null : null;
  useEffect(() => {
    const id = edl?.soundtrack?.trackId;
    if (!id || !musicUrl) { setBeat(null); return; }
    let alive = true;
    beatOfTrack(musicUrl).then((b) => {
      if (!alive) return;
      if (b) setBeat({ ...b, trackId: id });
      else if (trackBpm) setBeat({ bpm: trackBpm, offsetSec: 0, confidence: 0, trackId: id });
      else setBeat(null);
    });
    return () => { alive = false; };
  }, [edl?.soundtrack?.trackId, musicUrl, trackBpm]);
  // What a viewer would notice, checked again after every change (lib/studioClips/cutCheck.ts).
  const check = useMemo(() => (edl ? checkCut(edl, clipsForEdl(sources)) : null), [edl, sources]);
  // The pacing score, held down while the check has found something.
  const pace = useMemo(() => (edl ? pacingReport(edl, clipsForEdl(sources), beat, check) : null), [edl, sources, beat, check]);
  const rules = pacingRules(edl ?? {});
  // Regenerate in another editing style (lib/studioClips/profiles.ts).
  const [restyle, setRestyle] = useState<EditStyleId | null>(null);
  const snapToBeat = useCallback((b: Beat, note = true) => {
    const cur = edlRef.current;
    if (!cur || cur.segments.length < 2) return;
    const r = alignToBeats(cur, clipsForEdl(sources), b);
    if (r.moved) commit(r.edl);
    if (note) setHereNote(r.moved ? `${r.moved} of ${r.total} cut${r.total === 1 ? "" : "s"} moved onto the beat (${Math.round(b.bpm)} BPM).` : `Every cut already lands on the beat (${Math.round(b.bpm)} BPM).`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);
  // Once per track chosen in this session: the cuts land on its beat (one undo step).
  const snappedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || !data?.canEdit || snappedFor.current === beat.trackId) return;
    snappedFor.current = beat.trackId;
    snapToBeat(beat);
  }, [beat, data?.canEdit, snapToBeat]);
  // Background noise reduced in this browser, per clip (lib/studioClips/cleanSound.ts); the preview and the export play it.
  const [cleanAudio, setCleanAudio] = useState<Record<string, string>>({});
  const [cleaning, setCleaning] = useState<{ done: number; total: number } | null>(null);
  const cleanOn = Boolean(edl?.cleanSound);
  const actionOn = Boolean(edl?.actionSound);
  const usedClips = useMemo(() => (edl ? Array.from(new Set(edl.segments.map((s) => s.clipId))).filter((id) => sources[id]).sort() : []), [edl, sources]);
  const cleanFor = useCallback(async () => {
    const todo = usedClips.map((id) => ({ clipId: id, url: sources[id].url }));
    if (!todo.length) return {};
    setCleaning({ done: 0, total: todo.length });
    const out = await cleanSounds(todo, (done, total) => setCleaning({ done, total }), actionOn ? "action" : "clean");
    setCleanAudio((cur) => ({ ...cur, ...out }));
    setCleaning(null);
    return out;
  }, [usedClips, sources, actionOn]);
  useEffect(() => { if (cleanOn) void cleanFor(); }, [cleanOn, cleanFor]);
  const tracks = useMemo(() => (edl ? tracksFor(edl, (id) => (sources[id] ? clipLabel(sources[id].position) : "Expired clip"), Object.fromEntries(Object.values(sources).map((x) => [x.clipId, x.words])), captionsOn) : null), [edl, sources, captionsOn]);
  const missing = useMemo(() => (edl ? edl.segments.filter((s) => !sources[s.clipId]).length : 0), [edl, sources]);

  // ------------------------------------------------------------ editing ----
  // The history is a stack of whole cuts. edlRef is set here as well as in the effect above, so two
  // commits in one event (a swap, then a note) each push the cut as it was.
  const HISTORY = 40;
  const commit = useCallback((next: Edl) => {
    const cur = edlRef.current;
    if (cur) setPast((p) => [...p.slice(-(HISTORY - 1)), cur]);
    edlRef.current = next;
    setEdl(next);
    setFuture([]); setDirty(true); setSaveErr(null);
  }, []);
  const undo = () => {
    const cur = edlRef.current, prev = past[past.length - 1];
    if (!prev || !cur) return;
    setPast((p) => p.slice(0, -1)); setFuture((f) => [cur, ...f]);
    edlRef.current = prev; setEdl(prev); setDirty(true);
  };
  const redo = () => {
    const cur = edlRef.current, next = future[0];
    if (!next || !cur) return;
    setFuture((f) => f.slice(1)); setPast((p) => [...p.slice(-(HISTORY - 1)), cur]);
    edlRef.current = next; setEdl(next); setDirty(true);
  };

  const move = (i: number, dir: -1 | 1) => { if (!edl) return; const j = i + dir; if (j < 0 || j >= edl.segments.length) return; const segs = [...edl.segments]; [segs[i], segs[j]] = [segs[j], segs[i]]; commit({ ...edl, segments: segs }); };
  const remove = (i: number) => { if (!edl || edl.segments.length <= 1) return; commit({ ...edl, segments: edl.segments.filter((_, k) => k !== i) }); };
  const replace = (i: number, clipId: string) => {
    if (!edl) return; const src = sources[clipId]; if (!src) return;
    const m = bestMomentFor(src);
    commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, clipId, in: r2(m.start), out: r2(Math.max(m.end, m.start + MIN_SEG)), note: "" } : x)) });
    setHereNote(`Swapped in ${m.why}`);
  };
  const removeText = (i: number) => { if (!edl) return; commit({ ...edl, text: edl.text.filter((_, k) => k !== i) }); };
  const toggleCaptions = () => { if (!edl) return; commit({ ...edl, captions: edl.captions ? null : { source: "transcript" } }); };
  // Highlighted words in the captions (lib/studioClips/emphasis.ts): on picks numbers and names in what is said; off clears them.
  const spokenWords = useMemo(() => Object.fromEntries(Object.values(sources).map((x) => [x.clipId, x.words])), [sources]);
  const highlighted = useMemo(() => (edl?.emphasis?.length ? emphasisLabels(edl, spokenWords, edl.emphasis) : []), [edl, spokenWords]);
  const canHighlight = useMemo(() => (edl ? pickEmphasis(edl, spokenWords).length > 0 || Boolean(edl.emphasis?.length) : false), [edl, spokenWords]);
  const toggleEmphasis = () => {
    if (!edl) return;
    if (edl.emphasis?.length) { const { emphasis: _e, ...rest } = edl; void _e; commit(rest as Edl); return; }
    const list = pickEmphasis(edl, spokenWords);
    if (list.length) commit({ ...edl, emphasis: list });
  };

  // At the playhead: which cut it is in, and where that is inside the clip.
  const at = () => {
    if (!tl) return null;
    const sec = (player.current?.getCurrentFrame() ?? 0) / OUTPUT.fps;
    const i = tl.segments.findIndex((x) => sec >= x.startSec && sec < x.startSec + x.durationFrames / OUTPUT.fps);
    const k = i < 0 ? tl.segments.length - 1 : i;
    const seg = tl.segments[k];
    return { sec, i: k, clipT: r2(seg.in + Math.max(0, sec - seg.startSec)) };
  };
  const startHere = () => { const p = at(); if (!edl || !p) return; const s = edl.segments[p.i]; if (s.out - p.clipT < MIN_SEG) return setHereNote(`Too close to the end of that cut; a cut needs ${MIN_SEG}s.`); setHereNote(null); commit({ ...edl, segments: edl.segments.map((x, k) => (k === p.i ? { ...x, in: p.clipT } : x)) }); };
  const endHere = () => { const p = at(); if (!edl || !p) return; const s = edl.segments[p.i]; if (p.clipT - s.in < MIN_SEG) return setHereNote(`Too close to the start of that cut; a cut needs ${MIN_SEG}s.`); setHereNote(null); commit({ ...edl, segments: edl.segments.map((x, k) => (k === p.i ? { ...x, out: p.clipT } : x)) }); };
  const splitHere = () => {
    const p = at(); if (!edl || !p) return; const s = edl.segments[p.i];
    if (p.clipT - s.in < MIN_SEG || s.out - p.clipT < MIN_SEG) return setHereNote(`Move the playhead at least ${MIN_SEG}s from either end of the cut to split it.`);
    setHereNote(null);
    const a = { ...s, out: p.clipT }, b = { ...s, id: `s${Date.now()}`, in: p.clipT, role: "body" as const };
    commit({ ...edl, segments: [...edl.segments.slice(0, p.i), a, b, ...edl.segments.slice(p.i + 1)] });
  };

  // Reframe: a drag is one undo step (history pushed when it starts), applied live while it moves.
  const beginLive = () => { if (edl) { setPast((p) => [...p.slice(-(HISTORY - 1)), edl]); setFuture([]); } };
  const setFrame = (i: number, patch: Partial<{ zoom: number; x: number; y: number }>) => {
    if (!edl) return;
    setEdl({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, frame: { zoom: 1, x: 0.5, y: 0.5, ...x.frame, ...patch } } : x)) });
    setDirty(true);
  };
  const resetFrame = (i: number) => { if (!edl) return; commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, frame: undefined } : x)) }); };
  const setAspect = (w: number, h: number) => { if (!edl || (edl.width === w && edl.height === h)) return; commit({ ...edl, width: w, height: h }); };

  // Style (Editor V2): discrete choices are one undo step each; the colour picker is live after one.
  const st: EdlStyle = edl?.style ?? DEFAULT_STYLE;
  const setStyle = (patch: Partial<EdlStyle>) => { if (edl) commit({ ...edl, style: { ...st, ...patch } }); };
  const setCaptionStyle = (patch: Partial<EdlStyle["captions"]>) => setStyle({ captions: { ...st.captions, ...patch } });
  const liveAccent = (accent: string) => { if (!edl) return; setEdl({ ...edl, style: { ...st, accent } }); setDirty(true); };
  const liveHighlight = (highlight: string) => { if (!edl) return; setEdl({ ...edl, style: { ...st, captions: { ...st.captions, highlight } } }); setDirty(true); };
  const applyPreset = (p: { style: EdlStyle; width: number; height: number }, label: string) => { if (!edl) return; commit({ ...edl, style: p.style, width: p.width, height: p.height }); setStyleNote(`${label} applied.`); };
  const savePreset = async (body: Record<string, unknown>, ok: string) => {
    if (!edl) return;
    setStyleNote(null);
    const r = await fetch("/api/studio/style", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, style: st, width: edl.width, height: edl.height }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) return setStyleNote(j?.error ?? "Couldn't save that. Try again.");
    setPresets(j as VideoPresets);
    setStyleNote(ok);
  };
  const setVolume = (i: number, v: number) => { if (!edl) return; setEdl({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, volume: v } : x)) }); setDirty(true); };
  const setTransition = (i: number, t: TransitionKind) => { if (!edl) return; commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, transition: t === "cut" ? undefined : t } : x)) }); };
  const toggleMute = (i: number) => { if (!edl) return; commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, volume: (x.volume ?? 1) === 0 ? 1 : 0 } : x)) }); };

  /** Save the cut. Returns the cut as the server kept it (re-snapped), or null when it couldn't be saved. */
  const save = async (next?: Edl): Promise<Edl | null> => {
    const body = next ?? edlRef.current;
    if (!body) return null;
    if (fixture) { setDirty(false); clearLocalDraft(buildId); return body; }
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch(`/api/studio/builds/${buildId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: body }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!res) { setSaveErr("Couldn't save: SOCIA couldn't be reached. Your edit is still here; check your connection and save again."); return null; }
      if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setSaveErr(`Couldn't save: ${j?.error ?? "the server refused it"}. Your edit is still here; try again.`); return null; }
      const b = j as StudioBuild;
      // Edits made while the save was in flight are kept: only an unchanged cut takes the server's re-snapped copy.
      const unchanged = edlRef.current === body;
      setData((d) => (d ? { ...d, build: b } : d));
      if (unchanged) { edlRef.current = b.edl; setEdl(b.edl); setDirty(false); clearLocalDraft(buildId); }
      return b.edl;
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (directive: RegenerateDirective, style?: EditStyleId) => {
    if (!edl || fixture) return;
    setRegen(directive); setRegenErr(null);
    try {
      const res = await fetch(`/api/studio/builds/${buildId}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ directive, style }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!res) { setRegenErr("SOCIA couldn't be reached. Check your connection and try again; the current cut is unchanged."); return; }
      if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setRegenErr(j?.error ?? "Couldn't regenerate. The current cut is unchanged."); return; }
      const b = j as StudioBuild;
      commit(b.edl);
      setData((d) => (d ? { ...d, build: b } : d)); setDirty(false);
    } finally {
      setRegen(null);
    }
  };

  // Unsaved edits are mirrored to this browser (lib/studioClips/localDraft.ts) and the page warns before it
  // closes, so a reload or a closed tab never loses work; an export in progress warns too.
  useEffect(() => {
    if (fixture) return;
    if (dirty && edl) writeLocalDraft(buildId, edl);
  }, [dirty, edl, buildId, fixture]);
  const exporting = exp.phase !== "idle" && exp.phase !== "done" && exp.phase !== "error" && exp.phase !== "review";
  useEffect(() => {
    if (!dirty && !exporting) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, exporting]);
  const takeLocalDraft = () => { if (localDraft) { commit(localDraft); setLocalDraft(null); } };
  const dropLocalDraft = () => { clearLocalDraft(buildId); setLocalDraft(null); };

  // ------------------------------------------------------------- export ----
  // A render that still has a fault after the second try waits here for the person (Save it anyway, or back to the edit).
  const held = useRef<{ blob: Blob; path: string | null; report: RenderReport | null } | null>(null);

  /** Upload the finished video and save the draft; in fixture mode, download it instead. */
  const saveRendered = async (blob: Blob, path: string | null, report: RenderReport | null) => {
    if (!edl || !tl) return;
    if (fixture || !path) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "socia-build.mp4"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExp({ phase: "done", progress: 1, message: `Rendered ${(blob.size / 1024 / 1024).toFixed(1)} MB (downloaded in fixture mode).`, postId: null, report });
      return;
    }
    setExp({ phase: "uploading", progress: 0, message: null, postId: null, report });
    const signal = abort.current?.signal;
    try {
      await uploadMedia(supabase, "scheduled-media", path, new File([blob], "video.mp4", { type: "video/mp4" }), (sent, total) => setExp((e) => (e.phase === "uploading" ? { ...e, progress: total ? sent / total : 0 } : e)), signal);
      setExp((e) => ({ ...e, phase: "saving", progress: 1 }));
      const d = await fetch(`/api/studio/builds/${buildId}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, durationSec: tl.durationSec, caption: edl.caption }), signal });
      const dj = await d.json().catch(() => null);
      if (!d.ok) throw new Error(dj?.error ?? "Couldn't save the draft.");
      setExp({ phase: "done", progress: 1, message: null, postId: dj.postId, report });
      setData((cur) => (cur ? { ...cur, build: { ...cur.build, renderPath: path, postId: dj.postId } } : cur));
    } catch (e) {
      // The render happened but nothing was saved: give the video build back.
      await giveBack(path);
      throw e;
    }
  };
  const giveBack = (path: string | null) => (path && !fixture ? fetch(`/api/studio/builds/${buildId}/export`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null) : Promise.resolve(null));
  const failExport = (e: unknown) => {
    if ((e as Error)?.name === "AbortError") { setExp({ phase: "idle", progress: 0, message: null, postId: null }); return; }
    setExp({ phase: "error", progress: 0, message: (e as Error)?.message?.replace(/^Upload failed: /, "") || "The video couldn't be made this time. Your edit is saved; try again, and if it keeps failing open SOCIA in Chrome or Edge on a computer.", postId: null });
  };

  const exportVideo = async () => {
    if (!edl || !tl || !data) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    held.current = null;
    setExp({ phase: "checking", progress: 0, message: null, postId: null });
    let path: string | null = null;
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ width: edl.width, height: edl.height, container: "mp4" });
      if (!check.canRender) {
        const why = check.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ");
        setExp({ phase: "error", progress: 0, message: `This browser can't render video: ${why || "WebCodecs is unavailable."} Open SOCIA in Chrome or Edge on a computer to make the video; your edit is saved and opens there as it is.`, postId: null });
        return;
      }
      // What renders is the cut as saved: the server re-snaps cuts to words and pauses, so the file, the
      // saved edit and the preview after a reload are one and the same.
      let toRender: Edl = edl;
      if (dirty && !fixture) {
        const saved = await save();
        if (!saved) { setExp({ phase: "error", progress: 0, message: "The edit couldn't be saved, so the video wasn't made. Save it first, then try again.", postId: null }); return; }
        toRender = saved;
      }
      // Links signed over 50 minutes ago are signed again first (they last an hour).
      if (!fixture && Date.now() - signedAt.current > SOURCE_REFRESH_MS && !(await refreshSources())) { setExp({ phase: "error", progress: 0, message: "Couldn't refresh the clips' links. Check your connection and try again.", postId: null }); return; }
      if (!fixture) {
        const res = await fetch(`/api/studio/builds/${buildId}/export`, { method: "POST" }).catch(() => null);
        const j = res ? await res.json().catch(() => null) : null;
        if (!res?.ok) { if (isPlanError(j)) setPlanError(j); setExp({ phase: "error", progress: 0, message: isPlanError(j) ? null : (j?.error ?? "Couldn't start the export: SOCIA couldn't be reached."), postId: null }); return; }
        path = j.path as string;
      }
      const renderTl = timeline(toRender);
      // The export waits for the cleaned sound, so the video sounds like the preview.
      const cleaned = cleanOn ? { ...cleanAudio, ...(await cleanFor()) } : {};
      const props = { edl: toRender, sources, captionsOn: Boolean(toRender.captions), musicUrl, voiceUrls, cleanAudio: cleaned };
      const render = async (message: string | null) => {
        setExp({ phase: "rendering", progress: 0, message, postId: null });
        const { getBlob } = await renderMediaOnWeb({
          composition: { id: "socia-clip-build", component: ClipComposition, durationInFrames: renderTl.durationFrames, fps: OUTPUT.fps, width: toRender.width, height: toRender.height, defaultProps: props, calculateMetadata: null },
          inputProps: props,
          container: "mp4",
          videoBitrate: quality,
          pageResponsiveness: "medium",
          signal: ctrl.signal,
          licenseKey: remotionLicenseKey(),
          onProgress: ({ progress }) => setExp((e) => (e.phase === "rendering" ? { ...e, progress } : e)),
        });
        return getBlob();
      };
      // SOCIA watches the file it made (lib/studioClips/renderCheck.ts); a render fault gets one more try.
      const expect = { sound: Boolean(musicUrl) || anySpeech || voiceOn, music: Boolean(musicUrl) };
      const inspect = async (b: Blob, message: string | null) => {
        setExp({ phase: "inspecting", progress: 1, message, postId: null });
        return inspectRender(b, toRender, expect, ctrl.signal);
      };
      let blob = await render(null);
      let report = await inspect(blob, null);
      if (renderFaults(report).length) {
        const again = `The first try had a problem (${renderFaults(report)[0].detail.replace(/\.$/, "")}), so SOCIA is making it once more.`;
        blob = await render(again);
        report = await inspect(blob, again);
      }
      if (renderFaults(report).length) {
        held.current = { blob, path, report };
        setExp({ phase: "review", progress: 1, message: null, postId: null, report });
        return;
      }
      await saveRendered(blob, path, report);
    } catch (e) {
      if (path && (e as Error)?.name === "AbortError") await giveBack(path);
      failExport(e);
    }
  };
  const saveAnyway = async () => {
    const h = held.current;
    if (!h) return;
    held.current = null;
    try { await saveRendered(h.blob, h.path, h.report); } catch (e) { failExport(e); }
  };
  const backToEdit = async () => {
    const h = held.current;
    held.current = null;
    await giveBack(h?.path ?? null);
    setExp({ phase: "idle", progress: 0, message: null, postId: null });
  };

  // ------------------------------------------------------ timeline edits ----
  // What's selected on the timeline (Delete removes it). Trims are applied live
  // from the cut as it was when the drag began, as one undo step.
  const [sel, setSel] = useState<TimelineSelection>(null);
  // The playhead in output seconds (from the timeline, ten times a second): the Cut tab follows it when nothing is selected.
  const [playSec, setPlaySec] = useState(0);
  // Ten reads a second from the timeline, but the state (and so this whole tree) changes only when the
  // playhead enters another cut.
  const playCut = useRef(-1);
  const onPlayTime = useCallback((sec: number) => {
    const segs = tlRef.current?.segments ?? [];
    let i = segs.findIndex((x) => sec >= x.startSec && sec < x.startSec + x.durationFrames / OUTPUT.fps);
    if (i < 0) i = segs.length - 1;
    if (i !== playCut.current) { playCut.current = i; setPlaySec(sec); }
  }, []);
  const select = (next: TimelineSelection) => { setSel(next); if (next?.kind === "text") setPanel("text"); else if (next?.kind === "cut") setPanel("cut"); };
  const trimBase = useRef<Edl | null>(null);
  const cutStart = () => { trimBase.current = edl; beginLive(); };
  const cutTrimLive = (i: number, edge: "in" | "out", delta: number) => {
    const base = trimBase.current;
    const s = base?.segments[i];
    if (!base || !s) return;
    const next = trimCut(s, edge, delta, sources[s.clipId]?.durationSec ?? s.out);
    setEdl({ ...base, segments: base.segments.map((x, k) => (k === i ? { ...x, ...next } : x)) });
    setDirty(true);
  };
  const cutMove = (from: number, to: number) => { if (!edl) return; commit({ ...edl, segments: reorder(edl.segments, from, to) }); setSel({ kind: "cut", index: to }); };
  const deleteSelected = () => {
    if (!edl || !sel) return;
    if (sel.kind === "cut") {
      if (!edl.segments[sel.index]) return setSel(null);
      if (edl.segments.length <= 1) return setHereNote("A video needs at least one cut.");
      setHereNote(null); remove(sel.index);
    } else {
      if (!edl.text[sel.index]) return setSel(null);
      removeText(sel.index);
    }
    setSel(null);
  };
  const step = (frames: number) => {
    const p = player.current;
    if (!p || !tl) return;
    p.pause();
    p.seekTo(Math.min(Math.max(0, p.getCurrentFrame() + frames), tl.durationFrames - 1));
  };

  // Keyboard shortcuts, as in a video editor. The handlers change every
  // render; the listener reads the latest through a ref.
  const keys = useRef({ edit: false, undo, redo, split: splitHere, del: deleteSelected, step });
  keys.current = { edit: Boolean(data?.canEdit) && !regen && !saving && !(exp.phase !== "idle" && exp.phase !== "done" && exp.phase !== "error"), undo, redo, split: splitHere, del: deleteSelected, step };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editorKey(e.target, e.key)) return;
      const k = keys.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (e.key === " " && !mod) { e.preventDefault(); player.current?.toggle(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); k.step((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? OUTPUT.fps : 1)); }
      else if (!k.edit) return;
      else if (mod && key === "z") { e.preventDefault(); if (e.shiftKey) k.redo(); else k.undo(); }
      else if (mod && key === "y") { e.preventDefault(); k.redo(); }
      else if (!mod && !e.altKey && key === "s") { e.preventDefault(); k.split(); }
      else if (!mod && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); k.del(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playerProps = useMemo(() => ({ edl: edl!, sources, captionsOn, finishOn: compare === "after", musicUrl, voiceUrls, cleanAudio, safeZoneGuide: guide }), [edl, sources, captionsOn, compare, musicUrl, voiceUrls, cleanAudio, guide]);

  // -------------------------------------------------------------- render ----
  if (planError) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={planError} compact /></div></div></div>;
  if (loadErr) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Couldn&apos;t open the video editor</b><p>{loadErr}</p><button type="button" className="ov-btn ghost small" onClick={() => setLoadTry((n) => n + 1)}><RefreshCw size={12} /> Try again</button></div></div></div>;
  if (!data || !edl || !tl) return <div className="cbb"><div className="ov-card st-progress"><ul><li className="on"><i />Loading the cut and your clips</li></ul></div></div>;

  const busy = Boolean(regen) || saving || (exp.phase !== "idle" && exp.phase !== "done" && exp.phase !== "error");
  const build = data.build;

  return (
    <div className="cbb">
      <div className="cbb-head">
        <button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> {data.manual ? "Back to your clips" : "Back to the guide"}</button>
        <div className="cbb-head-actions">
          {data.canEdit && <button type="button" className="ov-btn ghost small" disabled={!dirty || busy} onClick={() => void save()}>{saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {dirty ? "Save changes" : "Saved"}</button>}
          {data.canEdit && (exp.phase === "idle" || exp.phase === "error" || exp.phase === "done") && (
            <button type="button" className="ov-btn primary" disabled={busy || missing > 0 || lookState?.state === "working"} onClick={exportVideo}><Clapperboard size={14} /> {build.renderPath ? "Make it again" : "Make this video"}</button>
          )}
        </div>
      </div>
      {saveErr && <p className="cbb-err" role="alert"><AlertTriangle size={13} aria-hidden /> {saveErr} <button type="button" className="sd-check-go" onClick={() => void save()}>Save again</button></p>}
      {localDraft && (
        <p className="cbb-err sd-draft" role="status"><Info size={13} aria-hidden /> An edit of this video was left unsaved in this browser. <button type="button" className="sd-check-go" onClick={takeLocalDraft}>Bring it back</button> <button type="button" className="sd-check-go" onClick={dropLocalDraft}>Discard it</button></p>
      )}

      <div className="cbb-grid">
        <div className="cbb-player-col">
          <div className="ov-card cbb-player-card">
            <div className="cbb-player">
              <Player
                ref={player}
                component={ClipComposition}
                inputProps={playerProps}
                durationInFrames={tl.durationFrames}
                fps={OUTPUT.fps}
                compositionWidth={edl.width}
                compositionHeight={edl.height}
                controls
                acknowledgeRemotionLicense
                style={{ width: "100%", aspectRatio: `${edl.width} / ${edl.height}` }}
              />
            </div>
            <div className="cbb-player-meta">
              <b>{title}</b>
              <span>{tl.durationSec.toFixed(1)}s, {edl.segments.length} cut{edl.segments.length === 1 ? "" : "s"}, {edl.width}×{edl.height}</span>
              {isEditStyle(edl.editStyle) && <small className="sd-pace-line">Edited as {EDIT_STYLES[edl.editStyle].label.toLowerCase()}: {EDIT_STYLES[edl.editStyle].summary.charAt(0).toLowerCase()}{EDIT_STYLES[edl.editStyle].summary.slice(1)}</small>}
              {pace && pace.parts.length > 0 && (
                <div className="sd-ring-row sd-pace">
                  <Ring share={pace.score / 100} size={56} stroke={6} tone={pace.score >= 80 ? "good" : pace.score >= 60 ? "ok" : "low"} label={`Pacing ${pace.score} of 100: ${pace.line}`}><b>{pace.score}</b></Ring>
                  <div>
                    <small className="sd-pace-line">{pace.line}</small>
                    <Details label="How this is scored">
                      <ul className="sd-parts">
                        {pace.parts.map((p) => <li key={p.id} className={p.ok ? "" : "is-off"}><b>{p.label}</b><span>{p.detail}</span></li>)}
                      </ul>
                      <p className="ov-source">The share of these rules the cut meets{isEditStyle(edl.editStyle) ? ` for ${EDIT_STYLES[edl.editStyle].label.toLowerCase()}` : ""}: start on the action, {rules.averageCutSec[0]} to {rules.averageCutSec[1]} s cuts on average, no cut over {rules.silentMaxSec} s without speech ({rules.speechMaxSec} s with) and the shot after the opening at most {rules.followMaxSec} s, {rules.endingMinSec} s to land the ending, each line up long enough to read{beat ? ", and cuts on the track's beat" : ""}. While the check below finds something, the score stays at {MAX_WITH_FINDINGS} or under.</p>
                    </Details>
                  </div>
                </div>
              )}
              {check && (
                <div className="sd-check">
                  {check.findings.length ? (
                    <>
                      <small className="sd-check-line is-off"><AlertTriangle size={12} aria-hidden /> {check.line}</small>
                      <ul className="sd-parts">
                        {check.findings.map((f, i) => {
                          const shot = f.segmentId ? tl.segments.find((s) => s.id === f.segmentId) : null;
                          return (
                            <li key={`${f.id}-${i}`} className="is-off">
                              <b>{CHECK_LABEL[f.id]}</b>
                              <span>{f.detail}{shot && <> <button type="button" className="sd-check-go" onClick={() => { const p = player.current; if (p) { p.pause(); p.seekTo(shot.startFrame + 1); } }}>Show me</button></>}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : <small className="sd-check-line"><Check size={12} aria-hidden /> {check.line}</small>}
                </div>
              )}
              {edl.finish && (
                <div className="cal2-seg cbf-compare" role="radiogroup" aria-label="Compare corrections">
                  <button type="button" role="radio" aria-checked={compare === "before"} className={compare === "before" ? "on" : ""} onClick={() => setCompare("before")}>Before</button>
                  <button type="button" role="radio" aria-checked={compare === "after"} className={compare === "after" ? "on" : ""} onClick={() => setCompare("after")}>After</button>
                </div>
              )}
              {guideAvailable && <label className="cbb-guide"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Show the text safe zone</label>}
              {missing > 0 && <span className="cb-stale"><AlertTriangle size={12} /> {missing} cut{missing === 1 ? "" : "s"} point{missing === 1 ? "s" : ""} at footage that expired. Replace or remove {missing === 1 ? "it" : "them"}.</span>}
            </div>
          </div>

          <div className="ov-card cbb-export">
            <h3><Clapperboard size={14} /> Make the video</h3>
            {exp.phase === "idle" || exp.phase === "error" ? (
              <>
                <p>Rendered on this computer at {edl.width}×{edl.height}, then saved as a <b>draft</b> in your Calendar. You schedule or publish it from Create Post.{data.manual ? " Nothing is counted against your plan." : ""} Works best in Chrome or Edge on a computer.</p>
                {exp.message && <p className="cbb-err"><AlertTriangle size={12} /> {exp.message}</p>}
                <label className="cbb-quality">Quality
                  <select value={quality} onChange={(e) => setQuality(e.target.value as "high" | "medium")} disabled={busy}>
                    <option value="high">High (larger file)</option>
                    <option value="medium">Standard (smaller, faster to upload)</option>
                  </select>
                </label>
                {autoMusic?.state === "adding" && <small className="ov-source"><Loader2 size={11} className="spin" /> SOCIA is still making a track for this cut. Make the video now and it has no music, or wait for the Music tab.</small>}
                {lookState?.state === "working" && <small className="ov-source"><Loader2 size={11} className="spin" /> Measuring the colour of clip {Math.min(lookState.done + 1, lookState.total)} of {lookState.total} first.</small>}
                {lookState?.state === "done" && lookState.corrected > 0 && <small className="ov-source">SOCIA corrected the colour of {lookState.corrected} clip{lookState.corrected === 1 ? "" : "s"}. Change it or switch it off in Look &amp; sound.</small>}
                {build.postId && <Link className="ov-btn ghost small" href={`/create?post=${build.postId}`}>Open the saved draft <ArrowRight size={12} /></Link>}
              </>
            ) : exp.phase === "review" ? (
              <>
                <p className="cbb-err" role="alert"><AlertTriangle size={12} aria-hidden /> SOCIA made this video twice and found the same problem both times, so it hasn&apos;t been saved yet.</p>
                <ul className="sd-parts sd-render-found">
                  {renderFaults(exp.report ?? null).map((f, i) => <li key={`${f.id}-${i}`} className="is-off"><span>{f.detail}</span></li>)}
                </ul>
                <p className="ov-source">Play that moment in the preview. A clip that won&apos;t load in this browser, or one that expired, is the usual cause.</p>
                <div className="sd-render-actions">
                  <button type="button" className="ov-btn ghost small" onClick={() => void backToEdit()}>Back to the edit</button>
                  <button type="button" className="ov-btn primary small" onClick={() => void saveAnyway()}>Save it anyway</button>
                </div>
              </>
            ) : exp.phase === "done" ? (
              <>
                <Finished message={exp.message ?? "Rendered and saved as a draft in your Calendar."} />
                {exp.report && (
                  <div className="sd-check">
                    <small className={`sd-check-line${exp.report.findings.length ? " is-off" : ""}`}>{exp.report.findings.length ? <AlertTriangle size={12} aria-hidden /> : <Check size={12} aria-hidden />} {exp.report.line}</small>
                    {exp.report.findings.length > 0 && <ul className="sd-parts">{exp.report.findings.map((f, i) => <li key={`${f.id}-${i}`} className="is-off"><span>{f.detail}</span></li>)}</ul>}
                  </div>
                )}
                {exp.postId && <Link className="ov-btn primary small" href={`/create?post=${exp.postId}`}>Review in Create Post <ArrowRight size={12} /></Link>}
                <button type="button" className="ov-btn ghost small" onClick={() => setExp({ phase: "idle", progress: 0, message: null, postId: null })}>Make another version</button>
              </>
            ) : (
              <>
                <ul className="st-progress">
                  <li className={exp.phase === "checking" ? "on" : "done"}><i />Checking this browser can render</li>
                  <li className={exp.phase === "rendering" ? "on" : exp.phase === "checking" ? "" : "done"}><i />Rendering {exp.phase === "rendering" ? `${Math.round(exp.progress * 100)}%` : ""}</li>
                  <li className={exp.phase === "inspecting" ? "on" : exp.phase === "uploading" || exp.phase === "saving" ? "done" : ""}><i />Watching the finished video</li>
                  <li className={exp.phase === "uploading" ? "on" : exp.phase === "saving" ? "done" : ""}><i />Uploading {exp.phase === "uploading" ? `${Math.round(exp.progress * 100)}%` : ""}</li>
                  <li className={exp.phase === "saving" ? "on" : ""}><i />Saving the draft</li>
                </ul>
                <div className="sd-progress" aria-hidden><Bar share={exp.phase === "saving" || exp.phase === "inspecting" ? 1 : exp.progress} /></div>
                {exp.message && <p className="ov-source">{exp.message}</p>}
                <button type="button" className="ov-btn ghost small" onClick={() => abort.current?.abort()}>Cancel</button>
                <p className="ov-source">Keep this tab open while it renders.</p>
              </>
            )}
          </div>
        </div>

        <div className="cbb-panels">
          <div className="st-tabs cbb-tabs" role="tablist">
            <button type="button" role="tab" className={panel === "cut" ? "on" : ""} onClick={() => setPanel("cut")}>Cut</button>
            <button type="button" role="tab" className={panel === "frame" ? "on" : ""} onClick={() => setPanel("frame")}>Frame</button>
            <button type="button" role="tab" className={panel === "style" ? "on" : ""} onClick={() => setPanel("style")}>Style</button>
            <button type="button" role="tab" className={panel === "text" ? "on" : ""} onClick={() => setPanel("text")}>Text &amp; captions</button>
            <button type="button" role="tab" className={panel === "finish" ? "on" : ""} onClick={() => setPanel("finish")}>Look &amp; sound</button>
            <button type="button" role="tab" className={panel === "audio" ? "on" : ""} onClick={() => setPanel("audio")}>Voice &amp; music</button>
            {!data.manual && <button type="button" role="tab" className={panel === "regenerate" ? "on" : ""} onClick={() => setPanel("regenerate")}>Regenerate</button>}
          </div>

          {panel === "finish" && (
            <div className="ov-card cbb-captions">
              <div>
                <b><Volume2 size={14} /> Reduce background noise</b>
                <small>
                  {cleaning ? `Cleaning the sound in this browser: ${cleaning.done} of ${cleaning.total} clips.`
                    : cleanOn ? (Object.keys(cleanAudio).length ? (actionOn ? "The hum is taken out and the sound of the action is brought up, over the music." : "Hum, hiss and steady background noise are turned down, and the level is evened out.") : "This browser couldn't clean the sound, so the clips keep their own.")
                    : "Turns down hum, hiss and steady background noise, and evens out the level. Done in this browser; your clips aren't changed."}
                </small>
              </div>
              <button type="button" className={`cbb-toggle${cleanOn ? " on" : ""}`} role="switch" aria-checked={cleanOn} aria-label="Reduce background noise" disabled={!data.canEdit || busy} onClick={() => commit({ ...edl, cleanSound: !cleanOn })}><i /></button>
            </div>
          )}
          {panel === "finish" && (
            <FinishPanel edl={edl} sources={sources} canEdit={data.canEdit} busy={busy} initialMeasures={measures} onCommit={(next) => { commit(next); setCompare("after"); }} />
          )}

          {panel === "audio" && (
            <div className="cbb-audio">
              <VoiceoverCard
                buildId={buildId}
                edl={edl}
                canEdit={data.canEdit && !busy && !fixture}
                adding={autoVoice?.state === "adding"}
                autoNote={autoVoice?.note ?? null}
                // The server already saved these: the cut takes them without becoming "unsaved".
                onVoiceover={(vo) => setEdl((e) => { if (!e) return e; if (vo) return { ...e, voiceover: vo, captions: e.captions ?? (e.voiceover ? e.captions : { source: "transcript" }) }; const { voiceover: _drop, ...rest } = e; void _drop; return rest; })}
                onUrls={(urls) => setVoiceUrls((u) => ({ ...u, ...urls }))}
                onLevel={(volume) => { setEdl((e) => (e?.voiceover ? { ...e, voiceover: { ...e.voiceover, volume } } : e)); setDirty(true); }}
                onSwitch={(on) => { setEdl((e) => (e?.voiceover ? { ...e, voiceover: { ...e.voiceover, on } } : e)); setDirty(true); }}
              />
              <div className="ov-card cba-current">
                <b><Music size={14} /> Music in this video</b>
                {autoMusic?.state === "adding" ? <p><Loader2 size={12} className="spin" /> SOCIA is adding a track from your taste (about a minute).</p>
                  : edl.soundtrack ? <p>{edl.musicAuto && autoMusic?.state === "added" ? `SOCIA added “${edl.soundtrack.name}” on its own. Pick another below, change the levels, or take it out.` : `“${edl.soundtrack.name}” plays in this video.`}</p>
                  : <p>{autoMusic?.note ?? "No track in this video yet. Pick one from your playlist below."}</p>}
                {musicAutoOn != null && data.canEdit && (
                  <label className="cbm-auto"><input type="checkbox" checked={musicAutoOn} onChange={(e) => void toggleMusicAuto(e.target.checked)} /> Add a track to new videos on their own</label>
                )}
              </div>
              <MusicPlaylist
                buildId={buildId}
                edl={edl}
                canEdit={data.canEdit && !busy && !fixture}
                autoAdding={autoMusic?.state === "adding"}
                trackUrls={trackUrls}
                onTrackUrl={(id, url) => setTrackUrls((u) => ({ ...u, [id]: url }))}
                // The server already saved these: the cut takes them without becoming "unsaved".
                onPlaylist={(p) => setEdl((e) => (e ? { ...e, playlist: p } : e))}
                onSoundtrack={(st) => setEdl((e) => { if (!e) return e; if (st) return { ...e, soundtrack: st }; const { soundtrack: _drop, ...rest } = e; void _drop; return rest; })}
                onLevels={(musicVolume, originalVolume) => { setEdl((e) => (e?.soundtrack ? { ...e, soundtrack: { ...e.soundtrack, musicVolume, originalVolume } } : e)); setDirty(true); }}
                onDuck={(on) => { setEdl((e) => { if (!e?.soundtrack) return e; const { duck: _old, ...st } = e.soundtrack; void _old; return { ...e, soundtrack: on ? { ...st, duck: true } : st }; }); setDirty(true); }}
                speechPct={speechPct}
              />
              <AudioPanel canEdit={data.canEdit && !busy} current={edl.music} onUse={(line) => commit({ ...edl, music: line })} />
            </div>
          )}

          {panel === "style" && (
            <div className="cbb-frame cbb-style">
              <div className="ov-card">
                <b><Palette size={14} /> Text</b>
                <label className="cbb-field">Font
                  <select value={st.font} disabled={!data.canEdit || busy} onChange={(e) => setStyle({ font: e.target.value as EdlStyle["font"] })}>
                    {FONTS.filter((f) => f.id === st.font || CAPCUT_FONTS.some((c) => c.id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="cbb-field">Brand colour
                  <input type="color" value={st.accent} disabled={!data.canEdit || busy} onPointerDown={beginLive} onFocus={beginLive} onChange={(e) => liveAccent(e.target.value)} />
                </label>
                <small>Used for the call to action, and for text boxes set to Brand colour.</small>
                <div className="cal2-seg" role="radiogroup" aria-label="Text background">
                  {([["none", "Clean shadow"], ["outline", "Outline (CapCut)"], ["dark", "Dark box"], ["light", "Light box"], ["accent", "Brand colour"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.textBox === id} className={st.textBox === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setStyle({ textBox: id })}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="ov-card">
                <b><Captions size={14} /> Captions</b>
                <div className="cbb-capstyles" role="radiogroup" aria-label="Caption style">
                  {CAPTION_STYLES.map((c) => (
                    <button key={c.id} type="button" role="radio" aria-checked={st.captions.preset === c.id} className={`cbb-capstyle is-${c.id}${st.captions.preset === c.id ? " on" : ""}`} disabled={!data.canEdit || busy} onClick={() => { setStyle(withCaptionStyle(st, c.id)); setStyleNote(`${c.label} captions: ${c.hint}`); }}>
                      <span className="cbb-capstyle-demo" aria-hidden style={{ "--cap-hi": st.captions.highlight } as React.CSSProperties}><i>know</i> <em>what</em> <i>to post</i></span>
                      <span className="cbb-capstyle-name">{c.label}</span>
                    </button>
                  ))}
                </div>
                <small>{captionStyle(st.captions.preset).hint} Picking a style sets its font, case and position; change any of them below.</small>
                <label className="cbb-field">Highlight colour
                  <input type="color" value={st.captions.highlight} disabled={!data.canEdit || busy} onPointerDown={beginLive} onFocus={beginLive} onChange={(e) => liveHighlight(e.target.value)} />
                </label>
                <div className="cal2-seg" role="radiogroup" aria-label="Caption position">
                  {([["top", "Top"], ["middle", "Middle"], ["lower", "Lower"], ["bottom", "Bottom"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.captions.position === id} className={st.captions.position === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setCaptionStyle({ position: id })}>{label}</button>
                  ))}
                </div>
                <div className="cal2-seg" role="radiogroup" aria-label="Caption size">
                  {([["s", "Small"], ["m", "Medium"], ["l", "Large"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.captions.size === id} className={st.captions.size === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setCaptionStyle({ size: id })}>{label}</button>
                  ))}
                </div>
                <label className="cbb-check"><input type="checkbox" checked={st.captions.box} disabled={!data.canEdit || busy} onChange={(e) => setCaptionStyle({ box: e.target.checked })} /> Box behind captions</label>
                <label className="cbb-check"><input type="checkbox" checked={st.captions.uppercase} disabled={!data.canEdit || busy} onChange={(e) => setCaptionStyle({ uppercase: e.target.checked })} /> Capital letters</label>
                {!edl.captions && <small>Captions are off for this video; turn them on in Text &amp; captions.</small>}
              </div>
              <div className="ov-card">
                <b>Brand style and templates</b>
                <small>A brand style is the starting look for every new edit; templates keep other looks to reuse. Both hold the size, font, colours and caption style.</small>
                <div className="st-row-actions">
                  {presets.brand && <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={() => applyPreset(presets.brand!, "Brand style")}>Use brand style</button>}
                  {data.canManageBrand && <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => void savePreset({ action: "brand" }, "Saved as the brand style: new edits start with it.")}>Save as brand style</button>}
                </div>
                {presets.templates.length > 0 && (
                  <ul className="cbb-templates">
                    {presets.templates.map((t) => (
                      <li key={t.id}>
                        <span>{t.name} <small>{t.width}×{t.height}</small></span>
                        <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={() => applyPreset(t, `"${t.name}"`)}>Apply</button>
                        <button type="button" className="cbb-icon danger" aria-label={`Delete template ${t.name}`} disabled={busy} onClick={() => void savePreset({ action: "delete_template", id: t.id }, "Template deleted.")}><Trash2 size={13} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="cbb-tpl-new">
                  <input type="text" placeholder="Template name" value={tplName} maxLength={40} onChange={(e) => setTplName(e.target.value)} aria-label="Template name" />
                  <button type="button" className="ov-btn ghost small" disabled={busy || !tplName.trim()} onClick={() => { void savePreset({ action: "template", name: tplName }, `Saved "${tplName.trim()}".`); setTplName(""); }}>Save as template</button>
                </div>
                {styleNote && <small role="status">{styleNote}</small>}
              </div>
            </div>
          )}

          {panel === "frame" && (
            <div className="cbb-frame">
              <div className="ov-card">
                <b><Crop size={14} /> Size</b>
                <div className="cal2-seg cbb-aspects" role="radiogroup" aria-label="Aspect ratio">
                  {ASPECTS.map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={edl.width === a.width && edl.height === a.height} className={edl.width === a.width && edl.height === a.height ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setAspect(a.width, a.height)}>{a.label}</button>
                  ))}
                </div>
                <small>Reels, TikTok and Shorts are vertical; 4:5 and square suit the feed; 16:9 suits YouTube.</small>
              </div>
              <ol className="cbb-frames">
                {edl.segments.map((s, i) => {
                  const src = sources[s.clipId];
                  const f = s.frame ?? { zoom: 1, x: 0.5, y: 0.5 };
                  return (
                    <li key={s.id} className="ov-card">
                      <div className="cbb-frame-head">
                        <b>{src ? clipLabel(src.position) : "Expired clip"} <small>{fmtClock(s.in)} to {fmtClock(s.out)}</small></b>
                        <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || !s.frame} onClick={() => resetFrame(i)}>Reset</button>
                      </div>
                      {!src?.width || !src?.height ? <small>This clip&apos;s size wasn&apos;t measured, so it stays centred.</small> : (
                        <>
                          <label className="cbb-range"><span>Zoom</span><input type="range" min={1} max={3} step={0.05} value={f.zoom} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { zoom: Number(e.target.value) })} /><em>{f.zoom.toFixed(2)}×</em></label>
                          <label className="cbb-range"><span>Left to right</span><input type="range" min={0} max={1} step={0.01} value={f.x} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { x: Number(e.target.value) })} /><em>{Math.round(f.x * 100)}%</em></label>
                          <label className="cbb-range"><span>Top to bottom</span><input type="range" min={0} max={1} step={0.01} value={f.y} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { y: Number(e.target.value) })} /><em>{Math.round(f.y * 100)}%</em></label>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {panel === "cut" && (() => {
            const k = sel?.kind === "cut" && edl.segments[sel.index] ? sel.index : Math.max(0, Math.min(edl.segments.length - 1, tl.segments.findIndex((x) => playSec >= x.startSec && playSec < x.startSec + x.durationFrames / OUTPUT.fps)));
            const cur = edl.segments[k];
            const src = cur ? sources[cur.clipId] : undefined;
            const locked = !data.canEdit || busy;
            return (
              <div className="sd-cut">
                {cur && (
                  <Reveal key={cur.id} as="section" className="ov-card sd-inspector" aria-label={`Cut ${k + 1}`}>
                    <div className="sd-inspector-head">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL */}
                      {src?.thumb ? <img src={src.thumb} alt="" /> : <span className="sd-ph" />}
                      <div>
                        <b>{src ? clipLabel(src.position) : "Expired clip"} <small>{cur.role === "opener" ? "opener" : cur.role === "ending" ? "ending" : `cut ${k + 1} of ${edl.segments.length}`}</small></b>
                        <span className="sd-times">{fmtClock(cur.in)} to {fmtClock(cur.out)} in the clip, {(cur.out - cur.in).toFixed(1)}s</span>
                        {cur.note && <small className="cbb-note">{cur.note}</small>}
                      </div>
                      <button type="button" className="sd-iconbtn is-danger" aria-label="Remove this cut" disabled={locked || edl.segments.length <= 1} onClick={() => { remove(k); setSel(null); }}><Trash2 size={13} /></button>
                    </div>
                    <div className="sd-row" role="group" aria-label="At the playhead">
                      <button type="button" className="ov-btn ghost small" disabled={locked} onClick={startHere}><SkipBack size={12} /> Start here</button>
                      <button type="button" className="ov-btn ghost small" disabled={locked} onClick={endHere}><SkipForward size={12} /> End here</button>
                      {beat && <button type="button" className="ov-btn ghost small" disabled={locked} onClick={() => snapToBeat(beat)} title={`Move every cut onto the nearest beat of the track (${Math.round(beat.bpm)} BPM)`}><Music size={12} /> Snap cuts to the beat</button>}
                      <small className="sd-hint">Drag a cut&apos;s edges on the timeline to trim it; drag its middle to move it.</small>
                    </div>
                    {k > 0 && (
                      <div className="sd-field">
                        <span>Comes in with</span>
                        <div className="sd-trans" role="radiogroup" aria-label="Transition">
                          {TRANSITIONS.map((t) => (
                            <TransitionOption key={t.id} kind={t.id} label={t.label} on={(cur.transition ?? "cut") === t.id} disabled={locked} onPick={() => setTransition(k, t.id)} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="sd-field">
                      <span>Sound</span>
                      <div className="sd-vol">
                        <button type="button" className="sd-iconbtn" aria-label={(cur.volume ?? 1) === 0 ? "Unmute this clip" : "Mute this clip"} disabled={locked} onClick={() => toggleMute(k)}>{(cur.volume ?? 1) === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
                        <input type="range" min={0} max={2} step={0.05} value={cur.volume ?? 1} aria-label="Clip volume" disabled={locked} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setVolume(k, Number(e.target.value))} />
                        <em>{Math.round((cur.volume ?? 1) * 100)}%</em>
                      </div>
                    </div>
                    {data.sources.length > 1 && (
                      <label className="sd-field">
                        <span>Swap for</span>
                        <select aria-label="Swap this cut for another clip" disabled={locked} value="" onChange={(e) => { if (e.target.value) replace(k, e.target.value); }}>
                          <option value="">Another clip&apos;s best moment</option>
                          {data.sources.filter((x) => x.clipId !== cur.clipId).map((x) => <option key={x.clipId} value={x.clipId}>{clipLabel(x.position)} · {fmtClock(x.durationSec)}</option>)}
                        </select>
                      </label>
                    )}
                    {hereNote && <small className="sd-note" role="status">{hereNote}</small>}
                  </Reveal>
                )}
                <ol className="sd-cutlist" aria-label="Cuts in order">
                  {edl.segments.map((s2, i) => {
                    const src2 = sources[s2.clipId];
                    return (
                      <li key={s2.id} className={`${i === k ? "is-on" : ""}${src2 ? "" : " is-missing"}`}>
                        <button type="button" className="sd-cutlist-btn" onClick={() => { setSel({ kind: "cut", index: i }); const p = player.current; const seg = tl.segments[i]; if (p && seg) { p.pause(); p.seekTo(seg.startFrame + 1); } }} aria-current={i === k ? "true" : undefined}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL */}
                          {src2?.thumb ? <img src={src2.thumb} alt="" /> : <span className="sd-ph" />}
                          <span><b>{src2 ? clipLabel(src2.position) : "Expired clip"}</b><small>{(s2.out - s2.in).toFixed(1)}s{i > 0 && s2.transition ? ` · ${TRANSITIONS.find((t) => t.id === s2.transition)?.label.toLowerCase()}` : ""}</small></span>
                        </button>
                        <span className="sd-cutlist-move">
                          <button type="button" aria-label={`Move cut ${i + 1} earlier`} disabled={locked || i === 0} onClick={() => { move(i, -1); setSel({ kind: "cut", index: i - 1 }); }}><ArrowUp size={12} /></button>
                          <button type="button" aria-label={`Move cut ${i + 1} later`} disabled={locked || i === edl.segments.length - 1} onClick={() => { move(i, 1); setSel({ kind: "cut", index: i + 1 }); }}><ArrowDown size={12} /></button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="cbb-hint"><Info size={12} /> Cuts snap to pauses and word boundaries when you save. Levels are balanced from measured loudness{edl.audio.length ? ` (${edl.audio.map((a) => `${clipLabel(sources[a.clipId]?.position ?? 0)} ${a.gainDb > 0 ? "+" : ""}${a.gainDb} dB`).join(", ")})` : ""}.</p>
              </div>
            );
          })()}

          {panel === "text" && (
            <div className="cbb-text">
              <div className="ov-card cbb-captions">
                <div>
                  <b><Captions size={14} /> Captions</b>
                  <small>{anySpeech ? "From the real transcript, word by word." : voiceOn ? "From the voiceover, word by word as it's read." : "No speech was detected in these clips, so there is nothing to caption."}</small>
                </div>
                <button type="button" className={`cbb-toggle${captionsOn ? " on" : ""}`} role="switch" aria-checked={captionsOn} disabled={!(anySpeech || voiceOn) || !data.canEdit || busy} onClick={toggleCaptions}><i /></button>
              </div>
              {captionsOn && (
                <div className="ov-card cbb-captions">
                  <div>
                    <b>Highlight the key words</b>
                    <small>
                      {highlighted.length
                        ? `One word a line at most, in yellow: ${highlighted.join(", ")}.`
                        : canHighlight
                          ? "Colours the number or name that carries each line, one word at most."
                          : "Nothing in what is said stands out to highlight: no numbers or names."}
                    </small>
                  </div>
                  <button type="button" className={`cbb-toggle${highlighted.length ? " on" : ""}`} role="switch" aria-checked={highlighted.length > 0} aria-label="Highlight the key words" disabled={!canHighlight || !data.canEdit || busy} onClick={toggleEmphasis}><i /></button>
                </div>
              )}
              <TextLayersPanel
                layers={edl.text}
                onChange={(text) => commit({ ...edl, text })}
                durationSec={tl.durationSec}
                frame={{ width: edl.width, height: edl.height }}
                style={st}
                canEdit={data.canEdit}
                busy={busy}
                playhead={() => at()?.sec ?? null}
                openId={sel?.kind === "text" ? edl.text[sel.index]?.id ?? null : null}
                onOpen={(l) => { const p = player.current; if (p) { p.pause(); p.seekTo(Math.min(tl.durationFrames - 1, Math.round(l.at * OUTPUT.fps) + 1)); } }}
              />
              <EndCardPanel
                card={edl.endCard ?? null}
                disabled={!data.canEdit || busy}
                onChange={(endCard) => { const { endCard: _old, ...rest } = edl; commit(endCard ? { ...rest, endCard } : rest); }}
                onShow={() => { const p = player.current; if (p) { p.pause(); p.seekTo(tl.durationFrames - 2); } }}
              />
              <div className="ov-card cbb-caption-copy">
                <b>Caption for the post</b>
                <textarea rows={4} value={edl.caption} disabled={!data.canEdit || busy} onChange={(e) => commit({ ...edl, caption: e.target.value.slice(0, 2200) })} />
              </div>
            </div>
          )}

          {panel === "regenerate" && (
            <div className="cbb-regen">
              <p>A new first cut of the same post with one change. The current cut stays in Undo.</p>
              <ul>
                {REGENERATE_OPTIONS.map((o) => (
                  <li key={o.id}><button type="button" disabled={!data.canEdit || busy} onClick={() => regenerate(o.id)}>{regen === o.id ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}<span><b>{o.label}</b><small>{o.hint}</small></span></button></li>
                ))}
              </ul>
              <div className="sd-restyle">
                <label className="cbb-quality">Edit it as
                  <select value={restyle ?? (isEditStyle(edl.editStyle) ? edl.editStyle : "process")} onChange={(e) => setRestyle(e.target.value as EditStyleId)} disabled={!data.canEdit || busy}>
                    {EDIT_STYLE_IDS.map((id) => <option key={id} value={id}>{EDIT_STYLES[id].label}</option>)}
                  </select>
                </label>
                <small className="ov-source">{EDIT_STYLES[restyle ?? (isEditStyle(edl.editStyle) ? edl.editStyle : "process")].summary}</small>
                <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || !restyle || restyle === edl.editStyle} onClick={() => restyle && regenerate("restyle", restyle)}>
                  {regen === "restyle" ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} Make it again in this style
                </button>
              </div>
              {regenErr && <p className="cbb-err"><AlertTriangle size={12} /> {regenErr}</p>}
              <p className="ov-source">{MAX_REGENERATIONS - build.regenerations} of {MAX_REGENERATIONS} regenerations left for this post. Each one is written from the clips&apos; real moments and transcript, then checked the same way as the first.</p>
            </div>
          )}
        </div>
      </div>
      {tracks && (
        <div className="ov-card cbb-tl-card">
          <Timeline
            tracks={tracks}
            fps={OUTPUT.fps}
            player={player}
            canEdit={data.canEdit && !busy}
            selected={sel}
            onSelect={select}
            onTime={onPlayTime}
            onTextStart={beginLive}
            onTextLive={(i, at, end) => { setEdl((cur) => (cur ? { ...cur, text: cur.text.map((t, k) => (k === i ? { ...t, at, end } : t)) } : cur)); setDirty(true); }}
            onCutStart={cutStart}
            onCutTrimLive={cutTrimLive}
            onCutMove={cutMove}
            onSplit={splitHere}
            onDelete={deleteSelected}
            onUndo={undo}
            onRedo={redo}
            canUndo={past.length > 0 && data.canEdit && !busy}
            canRedo={future.length > 0 && data.canEdit && !busy}
            note={hereNote}
          />
        </div>
      )}
    </div>
  );
}
