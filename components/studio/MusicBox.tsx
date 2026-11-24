"use client";

// Music for this cut, from the person's own playlist. Drop any sound saved
// to the device (a reel's audio, a song, a voice memo, a video: its sound is
// taken), pick the part to use on the waveform, listen to it, and save that
// part to the playlist; every sound saved is there for every video. The one
// chosen is mixed into the cut at the two levels the person sets. Nothing is
// generated: SOCIA cuts and keeps what the person brings (2026-11-15).
// Decoding and trimming happen in this browser (Web Audio); the trimmed part
// is encoded to AAC with the ffmpeg.wasm SOCIA already ships (WAV when it
// can't load) and uploaded under the person's own folder.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ListMusic, Loader2, Music, Pause, Pencil, Play, Save, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { loadFfmpeg } from "@/lib/videoCompress";
import { STUDIO_BUCKET, fmtClock, type Edl } from "@/lib/studioClips/types";
import type { Soundtrack } from "@/lib/music/taste";
import type { Track } from "@/lib/music/tracks";
import { soundName } from "@/lib/music/soundName";
import { DUCK } from "@/lib/studioClips/musicDuck";
import { analysisOfTrack, type TrackAnalysis } from "@/lib/studioClips/beatClient";
import { NO_CHOICE_SLACK_SEC, bestParts, clampStart, latestStart, type PartPick } from "@/lib/music/bestPart";

const MAX_SEC = 180, MIN_SEC = 2;
const BARS = 480;
const MAX_FILE_MB = 600;

type Loaded = { name: string; buffer: AudioBuffer; peaks: Float32Array; top: number };
type Phase = { kind: "idle" } | { kind: "reading"; note: string } | { kind: "saving"; note: string; progress: number };

/** Peaks for the waveform: the loudest sample in each of BARS slices, 0..1. */
function peaksOf(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(BARS);
  const per = Math.max(1, Math.floor(buf.length / BARS));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let b = 0; b < BARS; b++) {
    let m = 0;
    const from = b * per, to = Math.min(buf.length, from + per);
    for (const ch of chans) for (let i = from; i < to; i += 4) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    out[b] = m;
  }
  const top = out.reduce((a, v) => Math.max(a, v), 0) || 1;
  for (let b = 0; b < BARS; b++) out[b] = out[b] / top;
  return out;
}
const loudest = (buf: AudioBuffer): number => { let m = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < ch.length; i += 4) { const v = Math.abs(ch[i]); if (v > m) m = v; } } return m || 1; };

/** Peaks for one stretch of the sound (the close-up under the overview), 0..1 against the whole file's loudest. */
function peaksBetween(buf: AudioBuffer, fromSec: number, toSec: number, bars: number, top: number): Float32Array {
  const out = new Float32Array(bars);
  const rate = buf.sampleRate, from = Math.max(0, Math.floor(fromSec * rate)), to = Math.min(buf.length, Math.floor(toSec * rate));
  const per = Math.max(1, (to - from) / bars);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let b = 0; b < bars; b++) {
    let m = 0;
    const a = Math.floor(from + b * per), z = Math.min(to, Math.floor(from + (b + 1) * per));
    const step = Math.max(1, Math.floor((z - a) / 64));
    for (const ch of chans) for (let i = a; i < z; i += step) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    out[b] = m / (top || 1);
  }
  return out;
}

/** The chosen part as 16-bit WAV bytes. */
function wavOf(buf: AudioBuffer, fromSec: number, toSec: number): Uint8Array {
  const rate = buf.sampleRate, chans = Math.min(2, buf.numberOfChannels);
  const from = Math.floor(fromSec * rate), to = Math.min(buf.length, Math.floor(toSec * rate));
  const n = Math.max(0, to - from);
  const data = new DataView(new ArrayBuffer(44 + n * chans * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); data.setUint32(4, 36 + n * chans * 2, true); str(8, "WAVE"); str(12, "fmt "); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, chans, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * chans * 2, true); data.setUint16(32, chans * 2, true); data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, n * chans * 2, true);
  const src = Array.from({ length: chans }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < chans; c++) { const v = Math.max(-1, Math.min(1, src[c][from + i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(data.buffer);
}

/** The part, encoded: AAC in an .m4a through ffmpeg.wasm, or the WAV itself when that can't load. */
async function encodePart(buf: AudioBuffer, fromSec: number, toSec: number): Promise<{ file: File; ext: "m4a" | "wav" }> {
  const wav = wavOf(buf, fromSec, toSec);
  const ff = await loadFfmpeg().catch(() => null);
  if (ff) {
    try {
      await ff.writeFile("part.wav", wav);
      const code = await ff.exec(["-i", "part.wav", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "part.m4a"]);
      if (code === 0) {
        const out = (await ff.readFile("part.m4a")) as Uint8Array;
        if (out?.byteLength) return { file: new File([out.slice().buffer as ArrayBuffer], "part.m4a", { type: "audio/mp4" }), ext: "m4a" };
      }
    } catch { /* WAV below */ } finally {
      try { await ff.deleteFile("part.wav"); } catch { /* not written */ }
      try { await ff.deleteFile("part.m4a"); } catch { /* not written */ }
    }
  }
  return { file: new File([wav.slice().buffer as ArrayBuffer], "part.wav", { type: "audio/wav" }), ext: "wav" };
}

/** The file's sound as an AudioBuffer: the browser's decoder first; a video it can't open goes through ffmpeg.wasm. */
async function decodeFile(file: File, ctx: AudioContext, note: (s: string) => void): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    note("Taking the sound out of the video…");
    const ff = await loadFfmpeg().catch(() => null);
    if (!ff) throw new Error("This browser can't read that file. Drop an .mp3, .m4a or .wav instead.");
    const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
    const inName = `drop.${ext}`;
    try {
      await ff.writeFile(inName, new Uint8Array(bytes));
      const code = await ff.exec(["-i", inName, "-vn", "-ac", "2", "-ar", "44100", "-t", String(MAX_SEC * 4), "-c:a", "pcm_s16le", "drop.wav"]);
      if (code !== 0) throw new Error("no sound");
      const out = (await ff.readFile("drop.wav")) as Uint8Array;
      return await ctx.decodeAudioData(out.slice().buffer as ArrayBuffer);
    } catch {
      throw new Error("No sound SOCIA could read in that file. Try an .mp3, .m4a or .mp4 with sound.");
    } finally {
      try { await ff.deleteFile(inName); } catch { /* not written */ }
      try { await ff.deleteFile("drop.wav"); } catch { /* not written */ }
    }
  }
}

export default function MusicBox({ buildId, edl, canEdit, fixture, speechPct = 0, onSoundtrack, onLevels, onDuck, onTrackUrl, onStart, videoSec = 0, trackUrl = null }: {
  buildId: string;
  edl: Edl;
  canEdit: boolean;
  fixture: boolean;
  /** how much of the cut has speech, 0..100 from the transcript; 0 when nobody speaks */
  speechPct?: number;
  /** the server set (or, with null, removed) the cut's soundtrack */
  onSoundtrack: (s: Soundtrack | null) => void;
  /** the person moved a level slider (one undo step; saved with the cut) */
  onLevels: (musicVolume: number, originalVolume: number) => void;
  /** the person switched "lower the music under speech" on or off (saved with the cut) */
  onDuck: (on: boolean) => void;
  /** a playable link for the track now in the cut */
  onTrackUrl: (trackId: string, url: string) => void;
  /** the person chose where in the sound this video's music starts, seconds (saved with the cut) */
  onStart?: (sec: number) => void;
  /** how long the video is, seconds */
  videoSec?: number;
  /** a playable link to the sound in the cut */
  trackUrl?: string | null;
}) {
  const st = edl.soundtrack ?? null;
  const supabase = useMemo(() => createClient(), []);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [sel, setSel] = useState<{ from: number; to: number }>({ from: 0, to: MAX_SEC });
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const raf = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const detail = useRef<HTMLCanvasElement>(null);
  /** A drag: a new part from an anchor, or one edge of the part being moved. */
  const drag = useRef<{ kind: "new"; anchor: number } | { kind: "from" } | { kind: "to" } | null>(null);
  // The close-up shows the part with room either side: a long file keeps a short part draggable.
  const win = useMemo(() => {
    const dur = loaded?.buffer.duration ?? 0;
    const len = Math.max(MIN_SEC, sel.to - sel.from);
    const pad = Math.max(6, len * 0.6);
    const from = Math.max(0, sel.from - pad), to = Math.min(dur, sel.to + pad);
    return { from, to };
  }, [loaded, sel]);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioEls = useRef<Record<string, HTMLAudioElement | null>>({});
  const [listening, setListening] = useState<string | null>(null);

  const audioCtx = () => { if (!ctxRef.current) ctxRef.current = new AudioContext(); return ctxRef.current; };

  const load = useCallback(async () => {
    if (fixture) { setTracks([]); return; }
    const res = await fetch("/api/studio/tracks").catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { tracks?: Track[]; error?: string } | null) : null;
    if (!res?.ok || !j?.tracks) { setListErr(j?.error ?? "Couldn't read your playlist."); setTracks([]); return; }
    setListErr(null); setTracks(j.tracks);
    if (st && j.tracks.some((t) => t.id === st.trackId && t.url)) onTrackUrl(st.trackId, j.tracks.find((t) => t.id === st.trackId)!.url!);
    // Once on open; the cut's own link is signed by the editor's load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { stop(); ctxRef.current?.close().catch(() => null); }, []);

  const stop = () => { cancelAnimationFrame(raf.current); try { srcRef.current?.stop(); } catch { /* not started */ } srcRef.current = null; setPlaying(false); setPlayhead(null); };

  const take = async (file: File) => {
    if (!file) return;
    stop(); setError(null); setLoaded(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setError(`That file is ${Math.round(file.size / 1048576)} MB. Keep it under ${MAX_FILE_MB} MB.`); return; }
    setPhase({ kind: "reading", note: "Reading the sound…" });
    try {
      const buffer = await decodeFile(file, audioCtx(), (note) => setPhase({ kind: "reading", note }));
      if (buffer.duration < MIN_SEC) { setError(`That sound is ${buffer.duration.toFixed(1)} s long; it needs at least ${MIN_SEC} s.`); setPhase({ kind: "idle" }); return; }
      setLoaded({ name: file.name, buffer, peaks: peaksOf(buffer), top: loudest(buffer) });
      // The whole sound, up to MAX_SEC: each video then picks which stretch of it plays (SongPart below).
      setSel({ from: 0, to: Math.min(buffer.duration, MAX_SEC) });
      setName(soundName(file.name).slice(0, 80) || "Untitled sound");
      setPhase({ kind: "idle" });
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
      setPhase({ kind: "idle" });
    }
  };

  // The waveforms: the whole file (the part shaded, a window outline), and the close-up of the window with the
  // part shaded and its edges drawn as handles; the playhead on both while listening.
  useEffect(() => {
    if (!loaded) return;
    const dur = loaded.buffer.duration;
    const draw = (c: HTMLCanvasElement | null, from: number, to: number, peaks: Float32Array, handles: boolean, outline: { from: number; to: number } | null) => {
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      const g = c.getContext("2d"); if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const span = Math.max(0.001, to - from);
      const X = (t: number) => ((t - from) / span) * w;
      const styles = getComputedStyle(c);
      const ink = styles.getPropertyValue("--ink").trim() || "#111", muted = styles.getPropertyValue("--border").trim() || "#ccc", accent = styles.getPropertyValue("--accent").trim() || "#2a5bd7";
      const x0 = X(sel.from), x1 = X(sel.to);
      g.fillStyle = accent; g.globalAlpha = 0.12; g.fillRect(x0, 0, x1 - x0, h); g.globalAlpha = 1;
      const n = peaks.length, bw = w / n;
      for (let b = 0; b < n; b++) {
        const x = b * bw, inSel = x + bw / 2 >= x0 && x + bw / 2 <= x1;
        const ph = Math.max(2, Math.min(1, peaks[b]) * (h - 6));
        g.fillStyle = inSel ? ink : muted;
        g.fillRect(x + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph);
      }
      if (outline) { g.strokeStyle = ink; g.globalAlpha = 0.35; g.lineWidth = 1; g.strokeRect(X(outline.from) + 0.5, 0.5, X(outline.to) - X(outline.from) - 1, h - 1); g.globalAlpha = 1; }
      g.fillStyle = accent;
      if (handles) { g.fillRect(x0 - 4, 0, 8, h); g.fillRect(x1 - 4, 0, 8, h); } else { g.fillRect(x0 - 1, 0, 2, h); g.fillRect(x1 - 1, 0, 2, h); }
      if (playhead != null && playhead >= from && playhead <= to) { g.fillStyle = ink; g.fillRect(X(playhead) - 1, 0, 2, h); }
    };
    draw(canvas.current, 0, dur, loaded.peaks, false, dur > win.to - win.from + 0.5 ? win : null);
    draw(detail.current, win.from, win.to, peaksBetween(loaded.buffer, win.from, win.to, BARS, loaded.top), true, null);
  }, [loaded, sel, playhead, win]);

  const clampSel = (from: number, to: number) => {
    const dur = loaded?.buffer.duration ?? 0;
    from = Math.max(0, Math.min(dur, from)); to = Math.max(0, Math.min(dur, to));
    if (to < from) [from, to] = [to, from];
    if (to - from > MAX_SEC) to = from + MAX_SEC;
    if (to - from < MIN_SEC) to = Math.min(dur, from + MIN_SEC);
    return { from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10 };
  };
  /** Seconds under the pointer on a canvas that shows `from`..`to`. */
  const secAt = (e: React.PointerEvent<HTMLCanvasElement>, from: number, to: number) => { const r = e.currentTarget.getBoundingClientRect(); return from + ((e.clientX - r.left) / r.width) * (to - from); };
  const pxPerSec = (e: React.PointerEvent<HTMLCanvasElement>, from: number, to: number) => e.currentTarget.getBoundingClientRect().width / Math.max(0.001, to - from);
  const onDown = (from: number, to: number) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    stop();
    const t = secAt(e, from, to), near = 10 / pxPerSec(e, from, to);
    e.currentTarget.setPointerCapture(e.pointerId);
    // Near an edge of the part: that edge moves. Anywhere else: a new part from here.
    if (Math.abs(t - sel.from) <= near) { drag.current = { kind: "from" }; return; }
    if (Math.abs(t - sel.to) <= near) { drag.current = { kind: "to" }; return; }
    drag.current = { kind: "new", anchor: t };
    setSel(clampSel(t, t + MIN_SEC));
  };
  const onMove = (from: number, to: number) => (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current; if (!d) return;
    const t = secAt(e, from, to);
    if (d.kind === "new") setSel(clampSel(d.anchor, t));
    else if (d.kind === "from") setSel(clampSel(Math.min(t, sel.to - MIN_SEC), sel.to));
    else setSel(clampSel(sel.from, Math.max(t, sel.from + MIN_SEC)));
  };
  const onUp = () => { drag.current = null; };
  const nudge = (edge: "from" | "to", by: number) => { stop(); setSel(edge === "from" ? clampSel(sel.from + by, sel.to) : clampSel(sel.from, sel.to + by)); };

  const listen = () => {
    if (!loaded) return;
    if (playing) { stop(); return; }
    const ctx = audioCtx();
    const src = ctx.createBufferSource(); src.buffer = loaded.buffer; src.connect(ctx.destination);
    const startedAt = ctx.currentTime;
    src.start(0, sel.from, sel.to - sel.from);
    src.onended = () => { if (srcRef.current === src) stop(); };
    srcRef.current = src; setPlaying(true);
    const tick = () => { const t = sel.from + (ctx.currentTime - startedAt); if (t >= sel.to) { stop(); return; } setPlayhead(t); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };

  const save = async () => {
    if (!loaded || fixture) return;
    stop(); setError(null);
    setPhase({ kind: "saving", note: "Cutting the part…", progress: 0 });
    try {
      const { file, ext } = await encodePart(loaded.buffer, sel.from, sel.to);
      setPhase({ kind: "saving", note: "Saving to your playlist…", progress: 0 });
      const reg = await fetch("/api/studio/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() || "Untitled sound", sourceName: loaded.name, durationSec: sel.to - sel.from, ext }) }).catch(() => null);
      const rj = reg ? ((await reg.json().catch(() => null)) as { id?: string; path?: string; error?: string } | null) : null;
      if (!reg?.ok || !rj?.id || !rj.path) throw new Error(rj?.error ?? "Couldn't save the sound. Try again.");
      await uploadMedia(supabase, STUDIO_BUCKET, rj.path, file, (sent, total) => setPhase({ kind: "saving", note: "Saving to your playlist…", progress: total ? sent / total : 0 }));
      const ok = await fetch(`/api/studio/tracks/${rj.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploaded: true }) }).catch(() => null);
      const oj = ok ? ((await ok.json().catch(() => null)) as { track?: Track; error?: string } | null) : null;
      if (!ok?.ok || !oj?.track) throw new Error(oj?.error ?? "The sound was uploaded but couldn't be listed. Reload and look in your playlist.");
      setTracks((t) => [oj.track!, ...(t ?? [])]);
      setLoaded(null);
      setPhase({ kind: "idle" });
      // The sound just saved goes into the cut when it has none.
      if (!st && canEdit) await putInCut(oj.track);
    } catch (e) {
      setError((e as Error).message || "Couldn't save the sound.");
      setPhase({ kind: "idle" });
    }
  };

  const putInCut = async (t: Track) => {
    setError(null); setBusyId(t.id);
    const levels = st ? { musicVolume: st.musicVolume, originalVolume: st.originalVolume, duck: st.duck } : speechPct > 0 ? { musicVolume: 0.35, originalVolume: 1, duck: true } : { musicVolume: 0.85, originalVolume: 0.2 };
    const res = await fetch(`/api/studio/builds/${buildId}/music/${t.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(levels) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { soundtrack?: Soundtrack; url?: string | null; error?: string } | null) : null;
    setBusyId(null);
    if (!res?.ok || !j?.soundtrack) { setError(j?.error ?? "Couldn't put that sound in the video."); return; }
    if (j.url) onTrackUrl(t.id, j.url); else if (t.url) onTrackUrl(t.id, t.url);
    onSoundtrack(j.soundtrack);
  };

  const remove = async () => {
    if (!st) return;
    setError(null);
    const res = await fetch(`/api/studio/builds/${buildId}/music/${st.trackId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setError("Couldn't take the music out. Try again."); return; }
    onSoundtrack(null);
  };

  const del = async (t: Track) => {
    if (!window.confirm(`Remove “${t.name}” from your playlist? A video using it keeps playing it until you pick another sound.`)) return;
    setBusyId(t.id);
    const res = await fetch(`/api/studio/tracks/${t.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    if (!res?.ok) { setError("Couldn't remove that sound. Try again."); return; }
    setTracks((list) => (list ?? []).filter((x) => x.id !== t.id));
  };

  const rename = async () => {
    if (!renaming) return;
    const { id, name: n } = renaming; setRenaming(null);
    if (!n.trim()) return;
    const res = await fetch(`/api/studio/tracks/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n.trim() }) }).catch(() => null);
    if (!res?.ok) { setError("Couldn't rename that sound."); return; }
    setTracks((list) => (list ?? []).map((x) => (x.id === id ? { ...x, name: n.trim() } : x)));
  };

  const toggleListen = (t: Track) => {
    const el = audioEls.current[t.id]; if (!el) return;
    if (listening === t.id) { el.pause(); setListening(null); return; }
    for (const [id, other] of Object.entries(audioEls.current)) if (id !== t.id) other?.pause();
    stop();
    void el.play().catch(() => null); setListening(t.id);
  };

  const busy = phase.kind !== "idle";
  const partSec = sel.to - sel.from;
  return (
    <section className="cbm" aria-labelledby="cbm-h">
      <div className="cbm-head"><h4 id="cbm-h"><ListMusic size={14} /> Your playlist</h4></div>

      {canEdit && (
        <div
          className={`sd-drop${over ? " is-over" : ""}${busy ? " is-busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void take(f); }}
          onClick={() => { if (!busy) fileInput.current?.click(); }}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); } }}
          aria-label="Drop a sound, or click to choose a file"
        >
          <input ref={fileInput} type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.mp4,.mov,.webm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void take(f); e.currentTarget.value = ""; }} />
          {phase.kind === "reading" ? <p><Loader2 size={14} className="spin" /> {phase.note}</p>
            : <p><Upload size={14} /> <b>Drop any sound here</b> <span>a song, a reel&apos;s audio, a video: SOCIA takes its sound. Save it from Instagram, YouTube or wherever to your device first.</span></p>}
        </div>
      )}

      {loaded && (
        <div className="sd-trim">
          <div className="sd-trim-head">
            <b>{loaded.name}</b>
            <small>{fmtClock(loaded.buffer.duration)} long. {loaded.buffer.duration > MAX_SEC ? `The first ${fmtClock(MAX_SEC)} is chosen, the most a playlist sound can hold. Drag across the top wave to keep another part.` : "All of it is chosen. Drag across the top wave to keep only a part."} Each video then picks which stretch of it plays.</small>
            <button type="button" className="sd-iconbtn" aria-label="Put this sound away" onClick={() => { stop(); setLoaded(null); }}><X size={14} /></button>
          </div>
          <canvas ref={canvas} className="sd-wave sd-wave-all" onPointerDown={onDown(0, loaded.buffer.duration)} onPointerMove={onMove(0, loaded.buffer.duration)} onPointerUp={onUp} onPointerCancel={onUp} aria-label="The whole sound; drag to choose a part" />
          <small className="sd-wave-note">Close-up of {fmtClock(win.from)} to {fmtClock(win.to)}: drag the blue edges to trim the part exactly.</small>
          <canvas ref={detail} className="sd-wave sd-wave-detail" onPointerDown={onDown(win.from, win.to)} onPointerMove={onMove(win.from, win.to)} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Close-up of the part; drag an edge to trim it" />
          <div className="sd-trim-row">
            <label>From <button type="button" className="sd-iconbtn sd-nudge" aria-label="Start 1 second earlier" onClick={() => nudge("from", -1)}>&minus;1</button><input type="number" min={0} max={loaded.buffer.duration} step={0.1} value={sel.from} onChange={(e) => setSel(clampSel(Number(e.target.value), sel.to))} /><button type="button" className="sd-iconbtn sd-nudge" aria-label="Start 1 second later" onClick={() => nudge("from", 1)}>+1</button></label>
            <label>To <button type="button" className="sd-iconbtn sd-nudge" aria-label="End 1 second earlier" onClick={() => nudge("to", -1)}>&minus;1</button><input type="number" min={0} max={loaded.buffer.duration} step={0.1} value={sel.to} onChange={(e) => setSel(clampSel(sel.from, Number(e.target.value)))} /><button type="button" className="sd-iconbtn sd-nudge" aria-label="End 1 second later" onClick={() => nudge("to", 1)}>+1</button></label>
            <span className="sd-trim-len">{partSec.toFixed(1)} s</span>
            <button type="button" className="ov-btn ghost small" onClick={listen}>{playing ? <Pause size={13} /> : <Play size={13} />} {playing ? "Stop" : "Listen to the part"}</button>
          </div>
          <div className="sd-trim-row">
            <label className="sd-trim-name">Name <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <button type="button" className="ov-btn primary small" disabled={busy || fixture} onClick={() => void save()}>{phase.kind === "saving" ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {phase.kind === "saving" ? phase.note : "Save to playlist"}</button>
          </div>
          {phase.kind === "saving" && phase.progress > 0 && <progress className="sd-trim-progress" max={1} value={phase.progress} />}
          <small className="cbm-muted">Only use sound you have the right to use. SOCIA does not check.</small>
        </div>
      )}

      {listErr ? <p className="cbm-bad"><AlertTriangle size={11} /> {listErr}</p>
        : tracks == null ? <p className="cbm-muted"><Loader2 size={12} className="spin" /> Reading your playlist…</p>
        : tracks.length === 0 ? <p className="cbm-muted">Nothing saved yet. Drop a sound above and it stays here for every video. Each video picks its own part of it.</p>
        : (
          <ol className="cbm-list">
            {tracks.map((t) => {
              const inUse = st?.trackId === t.id;
              return (
                <li key={t.id} className={inUse ? "on" : ""}>
                  <div className="cbm-track">
                    {renaming?.id === t.id
                      ? <input type="text" className="sd-rename" value={renaming.name} autoFocus maxLength={80} onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} onBlur={() => void rename()} onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(null); }} aria-label="Sound name" />
                      : <b>{t.name}</b>}
                    <small>{fmtClock(t.durationSec)}{t.sourceName && soundName(t.sourceName) !== t.name ? ` · from ${soundName(t.sourceName)}` : ""}</small>
                    {t.url && <audio ref={(el) => { audioEls.current[t.id] = el; }} src={t.url} preload="none" onEnded={() => setListening((l) => (l === t.id ? null : l))} onPause={() => setListening((l) => (l === t.id ? null : l))} />}
                  </div>
                  <div className="sd-track-actions">
                    {t.url && <button type="button" className="sd-iconbtn" aria-label={listening === t.id ? `Stop ${t.name}` : `Listen to ${t.name}`} onClick={() => toggleListen(t)}>{listening === t.id ? <Pause size={13} /> : <Play size={13} />}</button>}
                    {canEdit && (inUse
                      ? <span className="cb-badge built"><Check size={11} /> In the video</span>
                      : <button type="button" className="ov-btn ghost small" disabled={busyId === t.id || fixture} onClick={() => void putInCut(t)}>{busyId === t.id ? <Loader2 size={12} className="spin" /> : <Music size={12} />} Use this</button>)}
                    {canEdit && <button type="button" className="sd-iconbtn" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}><Pencil size={13} /></button>}
                    {canEdit && <button type="button" className="sd-iconbtn" aria-label={`Remove ${t.name} from your playlist`} disabled={busyId === t.id} onClick={() => void del(t)}><Trash2 size={13} /></button>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

      {st && (
        <div className="cbm-mix">
          <b>Mix: {st.name}</b>
          <SongPart key={st.trackId} url={trackUrl} name={st.name} startSec={st.startSec ?? 0} videoSec={videoSec} savedSec={tracks?.find((t) => t.id === st.trackId)?.durationSec ?? null} canEdit={canEdit && Boolean(onStart)} onStart={(sec) => onStart?.(sec)} />
          <label><span>Music</span><input type="range" min={0} max={100} step={5} value={Math.round(st.musicVolume * 100)} disabled={!canEdit} onChange={(e) => onLevels(Number(e.target.value) / 100, st.originalVolume)} /><em>{Math.round(st.musicVolume * 100)}%</em></label>
          <label><span>Original sound</span><input type="range" min={0} max={100} step={5} value={Math.round(st.originalVolume * 100)} disabled={!canEdit} onChange={(e) => onLevels(st.musicVolume, Number(e.target.value) / 100)} /><em>{Math.round(st.originalVolume * 100)}%</em></label>
          {speechPct > 0 ? (
            <label className="st-check cbm-duck">
              <input type="checkbox" checked={Boolean(st.duck)} disabled={!canEdit} onChange={(e) => onDuck(e.target.checked)} />
              <span>Lower the music while someone is speaking <small>Speech fills {speechPct}% of this cut. The music drops to {Math.round(DUCK.under * 100)}% of its level under the words and comes back up in between.</small></span>
            </label>
          ) : <small className="cbm-duck-none">Nobody speaks in this cut, so the music stays at one level.</small>}
          {canEdit && <button type="button" className="ov-btn ghost small" onClick={() => void remove()}><X size={12} /> Take the music out</button>}
        </div>
      )}
      {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
    </section>
  );
}

/**
 * Which stretch of the sound plays under this video: the whole sound drawn
 * from its own levels, this video's stretch marked on it. Drag or use the
 * slider to move it, listen to it, or let SOCIA pick the strongest stretch
 * from what it measures (lib/music/bestPart.ts).
 */
function SongPart({ url, name, startSec, videoSec, savedSec, canEdit, onStart }: { url: string | null; name: string; startSec: number; videoSec: number; savedSec: number | null; canEdit: boolean; onStart: (sec: number) => void }) {
  const [a, setA] = useState<TrackAnalysis | null | "reading">("reading");
  const [moving, setMoving] = useState<number | null>(null);
  const [picks, setPicks] = useState<{ list: PartPick[]; at: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef(0);

  useEffect(() => {
    if (!url) { setA(null); return; }
    let alive = true;
    setA("reading");
    analysisOfTrack(url).then((r) => { if (alive) setA(r); });
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => { audio.current?.pause(); }, []);
  // Drawn again whenever the strip changes size (it can mount before the panel has its width).
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, [a]);

  const trackSec = a && a !== "reading" ? a.durationSec : savedSec ?? 0;
  const len = Math.min(videoSec, trackSec);
  const start = moving ?? clampStart(startSec, trackSec, videoSec);
  const choice = trackSec > 0 && videoSec > 0 && trackSec > videoSec + NO_CHOICE_SLACK_SEC;
  const last = latestStart(trackSec, videoSec);

  // The sound's levels as bars, this video's stretch dark, the rest light.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !a || a === "reading" || !choice) return;
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const styles = getComputedStyle(c);
    const ink = styles.getPropertyValue("--ink").trim() || "#111", muted = styles.getPropertyValue("--border").trim() || "#ccc", accent = styles.getPropertyValue("--accent").trim() || "#2a5bd7";
    const bars = Math.max(40, Math.floor(w / 3)), per = Math.max(1, Math.floor(a.rms.length / bars));
    let top = 0; for (let i = 0; i < a.rms.length; i++) if (a.rms[i] > top) top = a.rms[i];
    const X = (t: number) => (t / trackSec) * w, x0 = X(start), x1 = X(start + len);
    g.fillStyle = accent; g.globalAlpha = 0.12; g.fillRect(x0, 0, x1 - x0, h); g.globalAlpha = 1;
    for (let b = 0; b < bars; b++) {
      let m = 0; for (let i = b * per; i < Math.min(a.rms.length, (b + 1) * per); i += 2) if (a.rms[i] > m) m = a.rms[i];
      const x = (b / bars) * w, ph = Math.max(2, (m / (top || 1)) * (h - 6)), mid = x + w / bars / 2;
      g.fillStyle = mid >= x0 && mid <= x1 ? ink : muted;
      g.fillRect(x + 0.5, (h - ph) / 2, Math.max(1, w / bars - 1), ph);
    }
    g.fillStyle = accent; g.fillRect(x0 - 1, 0, 2, h); g.fillRect(x1 - 1, 0, 2, h);
  }, [a, start, len, trackSec, choice, width]);

  const stop = () => { audio.current?.pause(); setPlaying(false); };
  const listen = () => {
    if (!url) return;
    if (playing) { stop(); return; }
    if (!audio.current) {
      const el = new Audio(url);
      el.ontimeupdate = () => { if (el.currentTime >= stopAt.current) { el.pause(); setPlaying(false); } };
      el.onended = () => setPlaying(false);
      audio.current = el;
    }
    const el = audio.current;
    stopAt.current = start + len;
    el.currentTime = start;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const commit = (sec: number) => { stop(); onStart(clampStart(sec, trackSec, videoSec)); };
  const pick = () => {
    if (!a || a === "reading") return;
    // The first press picks the best; each press after gives the next one SOCIA found.
    const list = picks?.list ?? bestParts(a.rms, videoSec, a.beat).picks;
    const at = picks ? (picks.at + 1) % list.length : 0;
    setPicks({ list, at });
    commit(list[at].startSec);
  };

  const secAt = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * trackSec; };
  const reading = a === "reading";

  if (!videoSec) return null;
  if (!choice) {
    return trackSec > 0
      ? <small className="sd-part-note">“{name}” is {fmtClock(trackSec)} and this video is {fmtClock(videoSec)}, so it plays from the start. Save a longer part of the song to choose which stretch plays.</small>
      : null;
  }
  const shown = picks && picks.list[picks.at]?.startSec === start ? picks.list[picks.at] : null;
  return (
    <div className="sd-part">
      <div className="sd-part-head">
        <span>Part of the song</span>
        <em>{fmtClock(start)} to {fmtClock(start + len)} of {fmtClock(trackSec)}</em>
      </div>
      {reading ? <p className="cbm-muted"><Loader2 size={12} className="spin" /> Reading the sound…</p>
        : a == null ? <p className="cbm-muted">The sound couldn&apos;t be read in this browser. Use the slider to choose where it starts.</p>
        : (
          <canvas
            ref={canvas}
            className="sd-wave sd-part-wave"
            aria-hidden
            onPointerDown={(e) => { if (!canEdit) return; e.currentTarget.setPointerCapture(e.pointerId); stop(); setMoving(clampStart(secAt(e) - len / 2, trackSec, videoSec)); }}
            onPointerMove={(e) => { if (moving == null) return; setMoving(clampStart(secAt(e) - len / 2, trackSec, videoSec)); }}
            onPointerUp={() => { if (moving == null) return; const m = moving; setMoving(null); setPicks(null); commit(m); }}
            onPointerCancel={() => setMoving(null)}
          />
        )}
      <input className="sd-part-slider" type="range" min={0} max={last} step={0.5} value={start} disabled={!canEdit} aria-label="Where the music starts in the song" aria-valuetext={`Starts at ${fmtClock(start)}`} onChange={(e) => { setPicks(null); commit(Number(e.target.value)); }} />
      <div className="sd-part-actions">
        <button type="button" className="ov-btn ghost small" disabled={!url} onClick={listen}>{playing ? <Pause size={12} /> : <Play size={12} />} {playing ? "Stop" : "Listen to this part"}</button>
        {canEdit && <button type="button" className="ov-btn ghost small" disabled={reading || a == null} onClick={pick}><Music size={12} /> {picks ? "Try another part" : "Pick the best part for me"}</button>}
      </div>
      {shown?.reason && <small className="sd-part-why" role="status">{shown.reason}{picks && picks.list.length > 1 ? ` Choice ${picks.at + 1} of ${picks.list.length}.` : ""}</small>}
    </div>
  );
}
