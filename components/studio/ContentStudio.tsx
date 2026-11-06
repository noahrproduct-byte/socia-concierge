"use client";

// Content Studio. Flow: upload (or choose a draft) → analyze → understand →
// improve → prepare → add to plan / save a draft. The content stays the
// centre of the workspace; SOCIA works beside it. The file never leaves the
// browser for analysis (only sampled frames do); it is uploaded only when the
// user saves a draft.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, FolderOpen, FileVideo, Image as ImageIcon, Music, RefreshCw, Lock, AlertTriangle, Check, X } from "lucide-react";
import PageHeader from "../PageHeader";
import StudioPlayer, { type SeekRequest } from "./StudioPlayer";
import { ImprovePanel, CaptionPanel, AudioPanel, PreparePanel, ImproveFailure, type Working, type ImproveOption } from "./StudioPanels";
import { AfterCard, DirectionsPanel, PerformancePanel, TimelinePanel, VerdictPanel } from "./RaterPanels";
import { momentsFrom, presetForFix } from "@/lib/studioFixes";
import { entryFor, type Lesson, type RaterOutcome } from "@/lib/raterLog";
import type { Direction } from "@/lib/studioVerdict";
import { AskSociaButton } from "../AskSocia";
import PlanNotice, { UsageLine } from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { extractFrames, imageFrames, analysisSummary, GOALS, MAX_BYTES, MAX_SECONDS, type StudioAnalysis, type StudioKind, type Frames, type GoalId, type ApplyField } from "@/lib/studio";
import { decodeToMono16k } from "@/lib/audio/decode";
import { describeQuickAudio, quickAudioFrom, timedTranscript, type QuickAudio } from "@/lib/audio/quick";
import { saveStudioHandoff } from "@/lib/studioHandoff";
import type { AskProposal } from "@/lib/ask";
import { handFiles } from "@/lib/studioClips/handoff";
import { presetForLine } from "@/lib/studioClips/overlay";
import type { EdlText } from "@/lib/studioClips/types";
import { MAX_TEXT_LAYERS } from "@/lib/textPresets";
import { CAPABILITY, type Moment } from "@/lib/studioFixes";
import { newTextLayer, roleForTiming } from "./TextLayersPanel";
import type { FixOptions } from "./ImproveWalkthrough";
import { TextOverlayPreview, useSafeZoneGuide } from "./TextOverlay";
import { forgetRated, rememberRated, updateRatedCaption } from "@/lib/assistant/rated";
import { transcriptSkippedNote } from "@/lib/transcribe/limits";

export type DraftItem = { id: string; caption: string; media_url: string | null; media_type: string; scheduled_at: string; status: string };

type Source = { kind: StudioKind; url: string; name: string; file: File | null; files: File[]; draftId: string | null; images: string[] };
type Phase = "idle" | "loading" | "extracting" | "listening" | "transcribing" | "analyzing" | "done" | "error";
type ErrKind = "unsupported" | "too_large" | "too_short" | "too_long" | "cors" | "failed" | "api" | "plan" | "slow";
// "plan" renders the PlanNotice from the server's PlanError instead of copy from here.
const ERR_COPY: Record<Exclude<ErrKind, "plan">, { title: string; body: string }> = {
  unsupported: { title: "Unsupported format", body: "Use an MP4 or MOV video, or a JPG/PNG image. Some codecs (HEVC from iPhone) don't decode in the browser; export as H.264." },
  too_large: { title: "File is too large", body: `Keep uploads under ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Export a compressed version and try again.` },
  too_short: { title: "Video is too short", body: "SOCIA needs at least one second of video to sample frames." },
  too_long: { title: "Video is too long", body: `Trim to under ${MAX_SECONDS / 60} minutes. Short-form is what this workspace judges.` },
  cors: { title: "Couldn't read this draft's media", body: "The file is stored, but the browser couldn't sample frames from it. Upload the original file instead." },
  failed: { title: "Analysis failed", body: "Something went wrong reading the result. Try again; if it repeats, use a different export of the video." },
  api: { title: "SOCIA AI is unavailable", body: "The analysis service didn't respond. Try again in a moment." },
  slow: { title: "The analysis took too long", body: "It was stopped before it finished. Try again in a moment." },
};
// Five workspaces, in the order the questions come: what to fix, where it is, what the data says, how else to make it, then making the change.
const TABS = [["verdict", "Verdict"], ["timeline", "Timeline"], ["performance", "Performance"], ["directions", "Directions"], ["improve", "Improve and export"]] as const;
type Tab = (typeof TABS)[number][0];
// Inside Improve and export: the edits SOCIA makes, the caption, the sound, then publishing.
const STEPS = [["edits", "Edits"], ["caption", "Caption"], ["audio", "Sound"], ["prepare", "Publish"]] as const;
type Step = (typeof STEPS)[number][0];

export default function ContentStudio({ userId, niche, location, goalDefault, drafts, connected, postsSynced, modeTabs, plan }: { userId: string; niche: string | null; location: string | null; goalDefault: GoalId | null; drafts: DraftItem[]; connected: boolean; postsSynced: number; /** The Studio mode switch, rendered under the header. */ modeTabs?: ReactNode; /** The planned post this draft is for: the review compares it with what was planned. */ plan?: { planId: string; index: number; title: string } | null }) {
  const [source, setSource] = useState<Source | null>(null);
  const [frames, setFrames] = useState<Frames | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 10 });
  const [err, setErr] = useState<{ kind: ErrKind; detail?: string; planError?: PlanError } | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<StudioAnalysis | null>(null);
  const [versions, setVersions] = useState<{ analysis: StudioAnalysis; at: string }[]>([]);
  const [transcript, setTranscript] = useState("");
  // The video's sound, measured on this device, and the transcript SOCIA made
  // of it (kept so a re-analysis reuses them; an edited transcript is sent as typed).
  const [audioFacts, setAudioFacts] = useState<QuickAudio | null>(null);
  const [auto, setAuto] = useState<{ text: string; timed: string } | null>(null);
  const [listenNote, setListenNote] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("verdict");
  const [step, setStep] = useState<Step>("edits");
  // The creative direction whose opening is in use, and the rater's memory of earlier videos (lib/raterLog.ts).
  const [direction, setDirection] = useState<{ name: string; opening: string } | null>(null);
  const [after, setAfter] = useState<{ outcomes: RaterOutcome[]; lessons: Lesson[] } | null>(null);
  const loadAfter = useCallback(() => {
    fetch("/api/studio/rater-log").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.outcomes) setAfter({ outcomes: j.outcomes, lessons: j.lessons ?? [] }); }).catch(() => {});
  }, []);
  useEffect(() => { loadAfter(); }, [loadAfter]);
  const [w, setW] = useState<Working>({ hook: "", cta: "", caption: "", onscreen: [], layers: [], platform: "Instagram Reels", goal: goalDefault, cover: null });
  const [seek, setSeek] = useState<SeekRequest>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [pickDraft, setPickDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [ratedRef, setRatedRef] = useState<string | null>(null);
  useEffect(() => { if (ratedRef) updateRatedCaption(ratedRef, w.caption); }, [ratedRef, w.caption]);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const seekN = useRef(0);
  const playerVideo = useRef<HTMLVideoElement | null>(null);
  // The player's time and the video's own pixel size, for the text layers drawn over it.
  const [playT, setPlayT] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [guide, setGuide, guideAvailable] = useSafeZoneGuide();

  const doSeek = useCallback((t: number) => { seekN.current += 1; setSeek({ t, n: seekN.current }); }, []);
  const notify = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1800); };
  useEffect(() => () => { if (source?.file) URL.revokeObjectURL(source.url); source?.images.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)); }, [source]);

  const apply = useCallback((field: ApplyField, value: string) => {
    setW((cur) => {
      if (field !== "onscreen") return { ...cur, [field]: value };
      if (cur.onscreen.includes(value)) return cur;
      // On a video the line also goes on the picture, as a preset line where SOCIA saw it.
      const hint = analysis?.onScreenText.find((o) => o.text === value);
      const dur = frames?.duration ?? 0;
      const room = analysis?.kind === "video" && dur > 0 && cur.layers.length < MAX_TEXT_LAYERS;
      const layer = room ? newTextLayer(presetForLine(hint?.role ?? "mid", value).id, dur, hint ? hint.t : null, value) : null;
      return { ...cur, onscreen: [...cur.onscreen, value], layers: layer ? [...cur.layers, layer] : cur.layers };
    });
    notify(field === "hook" ? "Hook in use" : field === "cta" ? "CTA in use" : field === "caption" ? "Caption updated" : analysis?.kind === "video" ? "Added to the video" : "Added to on-screen text");
  }, [analysis, frames]);

  // ---- analysis ---------------------------------------------------------
  const analyze = useCallback(async (src: Source, fr: Frames, opts?: { transcript?: string; caption?: string; goal?: GoalId | null; platform?: string | null; audio?: QuickAudio | null; auto?: { text: string; timed: string } | null }) => {
    setPhase("analyzing"); setErr(null);
    try {
      const text = opts?.transcript ?? transcript;
      const sound = opts?.audio !== undefined ? opts.audio : audioFacts;
      const at = opts?.auto !== undefined ? opts.auto : auto;
      // The timed version only stands while the transcript is exactly what SOCIA transcribed.
      const isAuto = Boolean(at && text.trim() === at.text.trim());
      const res = await fetch("/api/studio/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: src.kind, frames: fr.frames, frameTimes: fr.times, durationSec: fr.duration, transcript: text, caption: opts?.caption ?? w.caption, goal: opts?.goal ?? w.goal, platform: opts?.platform ?? w.platform, audio: src.kind === "video" ? sound : null, autoTranscript: isAuto, timedTranscript: isAuto ? at!.timed : null, plan: plan ? { planId: plan.planId, index: plan.index } : null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isPlanError(json)) setErr({ kind: "plan", planError: json });
        // A 504 with no message: the platform cut the request off, so the file is not the problem.
        else if (res.status === 504) setErr({ kind: "slow", detail: json.error });
        else setErr({ kind: res.status === 503 || res.status === 502 || res.status === 429 ? "api" : "failed", detail: json.error });
        setPhase("error"); return;
      }
      if (json.usage) setUsage(json.usage as UsageSnapshot);
      const a = json.analysis as StudioAnalysis;
      setVersions((v) => { const next = [...v, { analysis: a, at: new Date().toISOString() }]; a.meta.version = next.length; return next; });
      setAnalysis(a);
      setW((cur) => ({ ...cur, hook: cur.hook || a.hooks.current || "", cta: cur.cta || a.cta.current || "" }));
      // Ask SOCIA can schedule "the video I just rated": it knows the file from here on, in this tab.
      if (src.file && (src.kind === "video" || src.kind === "image")) {
        setRatedRef(rememberRated(src.file, { name: src.name, kind: src.kind, durationSec: fr.duration ?? null, summary: analysisSummary(a).slice(0, 400), caption: opts?.caption ?? w.caption }));
      }
      setPhase("done"); setTab("verdict"); setStep("edits");
    } catch {
      setErr({ kind: "api" }); setPhase("error");
    }
  }, [transcript, w.caption, w.goal, w.platform, audioFacts, auto, plan]);

  /**
   * The video's sound: measured from its samples on this device, then — when
   * there is sound and no transcript has been typed — transcribed. Only a
   * small 16 kHz WAV is uploaded for that, and the server deletes it as soon
   * as the transcript is back. Never blocks the analysis: anything that fails
   * is said plainly and the analysis goes on without it.
   */
  const listen = useCallback(async (src: Source): Promise<{ audio: QuickAudio | null; auto: { text: string; timed: string } | null; transcript?: string }> => {
    setPhase("listening");
    const blob = src.file ?? (await fetch(src.url).then((r) => (r.ok ? r.blob() : null)).catch(() => null));
    const dec = blob ? await decodeToMono16k(blob) : null;
    const qa = dec ? quickAudioFrom(dec.pcm, dec.rate) : null;
    setAudioFacts(qa);
    if (!dec || !qa) { setListenNote("This browser couldn't read the video's sound, so audio is judged from the transcript only."); return { audio: null, auto: null }; }
    if (!qa.hasAudio) { setListenNote("The video has no audible sound."); return { audio: qa, auto: null }; }
    if (transcript.trim()) return { audio: qa, auto: null };
    setPhase("transcribing");
    try {
      const supabase = createClient();
      const path = `${userId}/quick/${crypto.randomUUID()}/audio.wav`;
      await uploadMedia(supabase, "studio-sources", path, new File([dec.wav], "audio.wav", { type: "audio/wav" }));
      const res = await fetch("/api/studio/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
      const j = (await res.json().catch(() => null)) as { transcript?: { text: string; words: { text: string; startMs: number }[] } | null; reason?: string } | null;
      const t = j?.transcript;
      if (t && t.words.length) {
        const next = { text: t.text, timed: timedTranscript(t) };
        setAuto(next); setTranscript(t.text);
        return { audio: qa, auto: next, transcript: t.text };
      }
      setListenNote(t ? "No speech was found in the video." : `${transcriptSkippedNote(j?.reason, "Transcription didn't finish")}, so the sound is judged from its measurements only.`);
    } catch {
      setListenNote("Transcription didn't finish, so the sound is judged from its measurements only.");
    }
    return { audio: qa, auto: null };
  }, [transcript, userId]);

  const load = useCallback(async (src: Source) => {
    setSource(src); setAnalysis(null); setVersions([]); setFrames(null); setErr(null); setSavedId(null); setActiveMarker(null);
    setAudioFacts(null); setListenNote(null);
    if (auto) { setAuto(null); setTranscript((t) => (t.trim() === auto.text.trim() ? "" : t)); }
    setW((cur) => ({ ...cur, hook: "", cta: "", onscreen: [], layers: [], cover: null }));
    setVideoSize(null); setPlayT(0);
    setPhase("extracting"); setProgress({ done: 0, total: 10 });
    try {
      // Sample from the player once React has mounted it for this source.
      let el: HTMLVideoElement | null = null;
      for (let i = 0; i < 40 && src.kind === "video"; i++) {
        el = playerVideo.current;
        if (el && el.src === src.url) break;
        el = null;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (src.kind !== "video") {
        const fr = await imageFrames(src.files.length ? src.files : src.images);
        setFrames(fr);
        await analyze(src, fr, { audio: null, auto: null });
        return;
      }
      // The frames and the sound are read at the same time: neither waits for the other.
      const [fr, heard] = await Promise.all([
        extractFrames(src.file ?? src.url, (d, t) => setProgress({ done: d, total: t }), el).then((f) => { setFrames(f); return f; }),
        listen(src),
      ]);
      await analyze(src, fr, heard);
    } catch (e) {
      const m = e instanceof Error ? e.message : "unsupported";
      setErr({ kind: (["unsupported", "too_short", "too_long", "cors"].includes(m) ? m : "unsupported") as ErrKind }); setPhase("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyze, auto]);

  const onFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    const f = files[0];
    if (files.some((x) => x.size > MAX_BYTES)) { setErr({ kind: "too_large" }); setPhase("error"); return; }
    const isVideo = f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    const isImage = f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);
    if (!isVideo && !isImage) { setErr({ kind: "unsupported" }); setPhase("error"); return; }
    if (isVideo) { load({ kind: "video", url: URL.createObjectURL(f), name: f.name, file: f, files: [], draftId: null, images: [] }); return; }
    const imgs = files.filter((x) => x.type.startsWith("image/")).slice(0, 10);
    load({ kind: imgs.length > 1 ? "carousel" : "image", url: URL.createObjectURL(imgs[0]), name: imgs.length > 1 ? `${imgs.length} images` : f.name, file: imgs[0], files: imgs, draftId: null, images: imgs.map((x) => URL.createObjectURL(x)) });
  }, [load]);

  const openDraft = useCallback((d: DraftItem) => {
    if (!d.media_url) return;
    setPickDraft(false);
    setW((cur) => ({ ...cur, caption: d.caption || cur.caption }));
    const video = d.media_type !== "IMAGE";
    load({ kind: video ? "video" : "image", url: d.media_url, name: d.caption?.slice(0, 40) || "Draft", file: null, files: [], draftId: d.id, images: video ? [] : [d.media_url] });
  }, [load]);

  const improve = useCallback(async (task: "hooks" | "caption" | "cta" | "onscreen" | "variations", params?: { mode?: string; exclude?: string[] }): Promise<ImproveOption[]> => {
    const res = await fetch("/api/studio/improve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, summary: analysis ? analysisSummary(analysis) : "", transcript, caption: w.caption, hook: w.hook, goal: w.goal, durationSec: frames?.duration ?? null, kind: source?.kind, ...params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ImproveFailure(json.error ?? "SOCIA couldn't generate options.", isPlanError(json) ? json : null);
    return json.options as ImproveOption[];
  }, [analysis, transcript, w.caption, w.hook, w.goal, frames, source]);

  const onProposal = useCallback((p: AskProposal, choice?: string) => {
    if (p.kind !== "text" || !choice) return false;
    apply(p.field, choice);
    return true;
  }, [apply]);

  // ---- save as a calendar draft ------------------------------------------
  // Resolves to the draft's id (null when nothing was saved) so the Create
  // Post handoff can reuse the exact same flow; what is stored is unchanged.
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!source) return null;
    setSaving(true);
    let saved: string | null = null;
    try {
      const api = async <T,>(method: string, body: unknown): Promise<T> => {
        const res = await fetch("/api/schedule", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Couldn't save.");
        return j as T;
      };
      const caption = [w.caption.trim(), w.cta && !w.caption.includes(w.cta) ? w.cta : ""].filter(Boolean).join("\n\n");
      if (source.draftId) {
        await api("PATCH", { id: source.draftId, caption });
        setSavedId(source.draftId);
        saved = source.draftId;
      } else if (source.file) {
        const when = new Date(); when.setDate(when.getDate() + 1); when.setHours(12, 0, 0, 0);
        const { posts } = await api<{ posts: { id: string }[] }>("POST", { scheduled_at: when.toISOString(), caption, media_type: source.kind === "video" ? "REELS" : "IMAGE", keep_draft: true });
        const id = posts[0].id;
        const supabase = createClient();
        const safe = source.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${userId}/${id}/${Date.now()}_${safe}`;
        await uploadMedia(supabase, "scheduled-media", path, source.file);
        const { data: pub } = supabase.storage.from("scheduled-media").getPublicUrl(path);
        await api("PATCH", { id, media_path: path, media_url: pub.publicUrl, keep_draft: true });
        setSavedId(id);
        saved = id;
      }
      if (saved && analysis) {
        // What SOCIA recommended and what was applied, kept with the post so its result can be read against it later. Best effort.
        const entry = entryFor({
          postId: saved, score: analysis.score.overall, diagnosis: analysis.diagnosis ?? "", fixes: analysis.topFixes,
          current: { hook: analysis.hooks.current, cta: analysis.cta.current, caption: analysis.caption.current },
          working: { hook: w.hook, cta: w.cta, caption: w.caption, onscreen: w.onscreen }, direction,
        });
        if (entry) void fetch("/api/studio/rater-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry }) }).then(() => loadAfter()).catch(() => {});
      }
      if (saved) {
        notify("Draft saved to the Calendar");
        // It's a post now: Ask SOCIA must not offer to schedule the same file again.
        if (ratedRef) { forgetRated(ratedRef); setRatedRef(null); }
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save the draft");
    } finally { setSaving(false); }
    return saved;
  }, [source, w.caption, w.cta, w.hook, w.onscreen, userId, ratedRef, analysis, direction, loadAfter]);

  // ---- hand the piece to Create Post ---------------------------------------
  // Same save as above (an already saved draft is reused), then the composer
  // opens on it so the person picks platforms and time there.
  const publishOrSchedule = useCallback(async () => {
    const id = savedId ?? (await saveDraft());
    if (!id) return;
    // What was chosen here travels with the draft to Generate Caption in this tab.
    saveStudioHandoff(id, {
      observed: analysis?.observed.summary ?? "",
      goal: GOALS.find((g) => g.id === w.goal)?.label ?? "",
      hook: w.hook.trim(),
      cta: w.cta.trim(),
      onscreen: w.onscreen.map((t) => t.trim()).filter(Boolean),
      transcript: transcript.trim() || null,
      audio: audioFacts ? describeQuickAudio(audioFacts) : null,
    });
    router.push(`/create?post=${encodeURIComponent(id)}&from=studio`);
  }, [savedId, saveDraft, router, analysis, w.goal, w.hook, w.cta, w.onscreen, transcript, audioFacts]);

  const planNote = useMemo(() => {
    if (!analysis) return "Idea from Content Studio.";
    const f = analysis.topFixes[0];
    return `From Content Studio: ${source?.name ?? "draft"} has a creative readiness of ${analysis.score.overall}/100. ${f ? `Top fix: ${f.title} (${f.suggestion}).` : ""}${w.hook ? ` Hook: "${w.hook}".` : ""}`.slice(0, 380);
  }, [analysis, source, w.hook]);
  const summaryForAsk = analysis ? analysisSummary(analysis) : null;
  // Improve → a fix in the Video editor: the file goes over with the proposed lines and what to apply, and the editor opens on that tab.
  const onFix = useCallback((m: Moment, o: FixOptions) => {
    if (!source?.file) return;
    const dur = frames?.duration ?? 0;
    const layers: EdlText[] = w.layers.map((l) => (l.id === m.id && o.presetId ? { ...l, presetId: o.presetId } : l)).filter((l) => l.text.trim());
    const panel = CAPABILITY[m.capability].panel ?? "text";
    handFiles("edit", [source.file], { layers, fix: { panel, cleanSound: m.capability === "noise" || undefined, cuts: o.cuts?.length ? o.cuts : undefined } });
    void dur;
    router.push("/studio?mode=edit");
  }, [source, frames, w.layers, router]);
  // The edits SOCIA can make, each tied to the fix it carries out (the Verdict cards offer them directly).
  const moments = useMemo(() => (analysis && analysis.kind === "video" ? momentsFrom({ analysis, durationSec: frames?.duration ?? 0, hook: w.hook, cta: w.cta }) : []), [analysis, frames, w.hook, w.cta]);
  const pickDirection = useCallback((d: Direction) => { apply("hook", d.opening); setDirection({ name: d.name, opening: d.opening }); }, [apply]);
  // A direction as a new version: the editor opens on the same file with that opening line on the video.
  const directionToEditor = useCallback((d: Direction) => {
    if (!source?.file) return;
    const dur = frames?.duration ?? 0;
    const presetId = presetForFix("opening", d.opening);
    const end = Math.min(dur || 3, 3);
    const layer: EdlText = { id: `dir${Date.now().toString(36)}`, at: 0, end, text: d.opening, role: roleForTiming(0, end, dur), presetId };
    handFiles("edit", [source.file], { layers: [layer], fix: { panel: "text" } });
    router.push("/studio?mode=edit");
  }, [source, frames, router]);
  const onProposed = useCallback((lines: { id: string; presetId: EdlText["presetId"]; text: string; at: number; end: number }[]) => {
    const dur = frames?.duration ?? 0;
    setW((c) => {
      const next: EdlText[] = lines.slice(0, MAX_TEXT_LAYERS).map((l) => ({ id: l.id, at: l.at, end: l.end, text: l.text, role: roleForTiming(l.at, l.end, dur), presetId: l.presetId }));
      const same = c.layers.length === next.length && c.layers.every((x, i) => x.id === next[i].id && x.presetId === next[i].presetId && x.text === next[i].text && x.at === next[i].at && x.end === next[i].end);
      return same ? c : { ...c, layers: next };
    });
  }, [frames]);
  const busy = phase === "extracting" || phase === "listening" || phase === "transcribing" || phase === "analyzing" || phase === "loading";

  return (
    <div className="st" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && !busy) onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Content Studio"
        sub="Make every post stronger before it goes live."
        status={<span className="ov-status"><i className={connected ? "live" : ""} />{connected ? `Judged against your own ${postsSynced} synced posts` : <>Not connected · <Link href="/settings#accounts">connect Instagram</Link> to compare with your winners</>}{niche ? ` · ${niche}` : ""}{location ? ` · ${location}` : ""}</span>}
        actions={
          <>
            <button type="button" className="ov-btn ghost" disabled={busy || !drafts.length} title={drafts.length ? "Analyse a draft from your Calendar" : "No drafts with media in your Calendar yet"} onClick={() => setPickDraft((v) => !v)}><FolderOpen size={14} /> Choose draft</button>
            <button type="button" className="ov-btn primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} /> Upload content</button>
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*,image/jpeg,image/png,image/webp" multiple onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />
      {modeTabs}
      {plan && <p className="st-plan-ctx">Reviewing a draft of your planned post <b>{plan.title}</b>: the review compares it with what was planned.</p>}

      {pickDraft && (
        <div className="st-drafts ov-card">
          <div className="ov-card-head"><h2>Drafts with media</h2><button type="button" className="ov-x" aria-label="Close" onClick={() => setPickDraft(false)}><X size={14} /></button></div>
          <ul>
            {drafts.map((d) => (
              <li key={d.id}><button type="button" onClick={() => openDraft(d)}>{d.media_type === "IMAGE" ? <ImageIcon size={14} /> : <FileVideo size={14} />}<span><b>{d.caption?.split("\n")[0]?.slice(0, 60) || "(no caption)"}</b><small>{new Date(d.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {d.status}</small></span></button></li>
            ))}
          </ul>
        </div>
      )}

      <div className={`st-grid${source ? "" : " empty"}`}>
        <div className="st-preview">
          {!source ? (
            <div className={`st-drop${drag ? " drag" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
              <span className="st-drop-ico"><Upload size={22} /></span>
              <b>{drag ? "Drop it" : "Drop a video or image here, or click to browse"}</b>
              <p>MP4 or MOV up to {MAX_SECONDS / 60} minutes · JPG or PNG · several images for a carousel. Frames are read on your device; the file is uploaded only if you save a draft.</p>
            </div>
          ) : (
            <div className="ov-card st-player-card">
              <div className="st-player-head">
                <span className="st-file">{source.kind === "video" ? <FileVideo size={14} /> : <ImageIcon size={14} />} {source.name}{frames?.duration ? ` · ${Math.round(frames.duration)}s` : ""}</span>
                <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => input.current?.click()}>Replace</button>
              </div>
              <StudioPlayer url={source.url} kind={source.kind} images={source.images} thumbs={frames?.thumbs ?? []} markers={analysis?.markers ?? []} segments={analysis?.segments ?? []} seek={seek} onTime={setPlayT} onDuration={() => null} cover={w.cover} onCover={(i) => setW((c) => ({ ...c, cover: i }))} activeMarker={activeMarker} videoRef={playerVideo}
                onSize={(width, height) => setVideoSize({ width, height })}
                overlay={source.kind === "video" && (w.layers.length > 0 || guide) ? ({ t, width, height }) => <TextOverlayPreview layers={w.layers} t={t} width={width} height={height} guide={guide} /> : undefined} />
              {guideAvailable && source.kind === "video" && <label className="cbb-guide"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Show the text safe zone</label>}
            </div>
          )}
          <div className="ov-card st-context">
            <label><span>Voiceover or on-screen text <small>{source?.kind === "video" ? "(transcribed automatically when there's speech)" : "(optional, improves accuracy a lot)"}</small></span>
              <textarea rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder={source?.kind === "video" ? "SOCIA fills this in from the video's speech; add on-screen text if you like…" : "Paste what's said or shown on screen…"} disabled={busy} /></label>
            {auto && transcript.trim() === auto.text.trim() && <small className="st-auto-note">Transcribed automatically from the video. Fix anything it got wrong and analyze again.</small>}
            {listenNote && <small className="st-auto-note muted">{listenNote}</small>}
            {source && frames && phase !== "extracting" && (
              <div className="st-row-actions">
                <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => analyze(source, frames)}><RefreshCw size={12} className={phase === "analyzing" ? "spin" : undefined} /> {analysis ? "Re-analyze as a new version" : "Analyze"}</button>
                {usage && <UsageLine meter="content_studio" used={usage.used} limit={usage.limit} resetsOn={usage.resetsOn} />}
              </div>
            )}
          </div>
        </div>

        <div className="st-work">
          {!source && (
            <div className="ov-card st-intro">
              <h2>What you get back</h2>
              <ul>
                <li><b>A creative readiness score you can read</b><span>Hook, structure, pacing, clarity, visuals, caption readability, audio, call to action and goal fit, each with its evidence and a fix. Nothing unmeasurable is scored, and it never predicts reach.</span></li>
                <li><b>What to fix first, and why</b><span>Up to five changes in priority order, each with the evidence behind it, and a timeline where you click a moment and the video jumps there.</span></li>
                <li><b>Hook Lab, captions, CTAs, cuts</b><span>Ready-to-use lines in your voice; you choose, nothing is overwritten.</span></li>
                <li><b>Compared with your winners</b><span>{connected ? `Against the cover frames and captions of your top posts (${postsSynced} synced).` : "Connect Instagram to compare against your own top posts."}</span></li>
                <li><b>Compared with your competitors</b><span>Against the Reels that took off for accounts you track on Discover, with links to each one.</span></li>
                <li><b>Three ways to remake it</b><span>Different openings and storyboards to test, with what each one costs you.</span></li>
              </ul>
              <p className="ov-source">No virality odds, no view predictions, no invented trending audio.</p>
            </div>
          )}
          {!source && after && <AfterCard outcomes={after.outcomes} lessons={after.lessons} />}
          {source && (phase === "extracting" || phase === "listening" || phase === "transcribing" || phase === "analyzing") && (
            <div className="ov-card st-progress" aria-live="polite">
              <b>{phase === "extracting" ? "Reading the file" : phase === "listening" || phase === "transcribing" ? "Listening to the video" : "Analyzing"}</b>
              <ul>
                <li className={frames ? "done" : "on"}><i />{frames ? `Extracted ${frames.frames.length} frames` : `Extracting frames ${progress.done}/${progress.total}`}</li>
                {source.kind === "video" && <li className={phase === "listening" ? "on" : phase === "extracting" ? "" : "done"}><i />Measuring the sound on this device</li>}
                {source.kind === "video" && <li className={phase === "transcribing" ? "on" : phase === "analyzing" && auto ? "done" : ""}><i />Transcribing speech{phase === "analyzing" && !auto ? " (skipped)" : ""}</li>}
                <li className={phase === "analyzing" ? "on" : ""}><i />Analyzing hook, pacing, clarity and CTA</li>
                <li className={phase === "analyzing" ? "on" : ""}><i />Comparing with your top posts{connected ? "" : " (not connected)"} and competitors&apos; Reels SOCIA has read</li>
              </ul>
              <p className="ov-source">One request to SOCIA; it can take a couple of minutes. Results appear together when it finishes.</p>
            </div>
          )}
          {phase === "error" && err && err.kind === "plan" && err.planError && (
            <div className="ov-card st-error">
              <span className="st-error-ico"><AlertTriangle size={16} /></span>
              <div><PlanNotice error={err.planError} compact /></div>
            </div>
          )}
          {phase === "error" && err && err.kind !== "plan" && (
            <div className="ov-card st-error">
              <span className="st-error-ico"><AlertTriangle size={16} /></span>
              <div><b>{ERR_COPY[err.kind].title}</b><p>{err.detail ?? ERR_COPY[err.kind].body}</p>
                <div className="st-row-actions">
                  {source && frames && (err.kind === "api" || err.kind === "slow") && <button type="button" className="ov-btn primary small" onClick={() => analyze(source, frames)}>Try again</button>}
                  <button type="button" className="ov-btn ghost small" onClick={() => input.current?.click()}>Upload a different file</button>
                </div>
              </div>
            </div>
          )}
          {source && analysis && phase === "done" && (
            <>
              <div className="st-tabs" role="tablist" aria-label="Workspace">
                {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
                <span className="st-tabs-ask"><AskSociaButton className="ov-btn ghost small" label="Ask SOCIA about this content" context={{ page: "studio", studio: { kind: source.kind, durationSec: frames?.duration ?? null, goal: w.goal, transcript: transcript || null, caption: w.caption || null, summary: summaryForAsk } }} contextLabel={source.name} onProposal={onProposal} /></span>
              </div>
              {tab === "verdict" && <VerdictPanel a={analysis} w={w} apply={apply} seek={doSeek} moments={moments} thumbs={frames?.thumbs ?? []} frame={videoSize} durationSec={frames?.duration ?? 0} canHandoff={Boolean(source.file)} onFix={onFix} onImprove={() => { setTab("improve"); setStep("edits"); }} onCaption={() => { setTab("improve"); setStep("caption"); }} />}
              {tab === "timeline" && <TimelinePanel a={analysis} thumbs={frames?.thumbs ?? []} playT={playT} seek={doSeek} setActive={setActiveMarker} />}
              {tab === "performance" && <PerformancePanel a={analysis} onCompare={() => window.location.assign("/analytics#content")} />}
              {tab === "directions" && <DirectionsPanel a={analysis} w={w} apply={apply} canHandoff={Boolean(source.file)} onUseDirection={pickDirection} onEditor={directionToEditor} />}
              {tab === "improve" && (
                <>
                  <div className="sd-steps" role="tablist" aria-label="Improve and export">
                    {STEPS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={step === id} className={step === id ? "is-on" : ""} onClick={() => setStep(id)}>{label}</button>)}
                  </div>
                  {step === "edits" && <ImprovePanel a={analysis} w={w} seek={doSeek} playT={playT} thumbs={frames?.thumbs ?? []} durationSec={frames?.duration ?? 0} frame={videoSize} canHandoff={Boolean(source.file)} onFix={onFix} onCaption={() => setStep("caption")} onProposed={onProposed} />}
                  {step === "caption" && <CaptionPanel a={analysis} w={w} setCaption={(s) => setW((c) => ({ ...c, caption: s }))} improve={improve} />}
                  {step === "audio" && (
                <>
                  {source.kind === "video" && source.file && (
                    <div className="ov-card cb-manual">
                      <div><b><Music size={14} /> Add music to this video</b><small>SOCIA makes a track for it from your taste and puts it in. Hear the others and pick one, then make the video and post it.</small></div>
                      <button type="button" className="ov-btn primary small" onClick={() => { handFiles("audio", [source.file!]); router.push("/studio?mode=audio"); }}>Add music</button>
                    </div>
                  )}
                  <AudioPanel a={analysis} />
                </>
                  )}
                  {step === "prepare" && <PreparePanel a={analysis} w={w} versions={versions} setGoal={(g) => setW((c) => ({ ...c, goal: g }))} setPlatform={(p) => setW((c) => ({ ...c, platform: p }))} improve={improve} onSaveDraft={saveDraft} onPublish={publishOrSchedule} saving={saving} savedId={savedId} planNote={planNote} />}
                </>
              )}
            </>
          )}
          {source && !analysis && phase === "done" && <div className="ov-empty">No analysis yet.</div>}
        </div>
      </div>
      {(w.hook || w.cta || w.onscreen.length > 0) && source && (
        <div className="st-inuse ov-card">
          <small>In use for this piece</small>
          {w.hook && <span><b>Hook</b> “{w.hook}”</span>}
          {w.cta && <span><b>CTA</b> “{w.cta}”</span>}
          {w.onscreen.map((o) => <span key={o}><b>Text</b> “{o}”</span>)}
        </div>
      )}
      {toast && <div className="cal2-toast" role="status"><Check size={13} /> {toast}</div>}
      <div className="st-privacy"><Lock size={11} /> Frames are read on your device. SOCIA scores what it can see and never predicts views.</div>
    </div>
  );
}
