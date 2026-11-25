"use client";

// The reference video's music on the Video editor's screen (components/studio/QuickEdit.tsx):
// what SOCIA measured in it (lib/music/referenceMusic.ts: tempo, where the energy lifts, whether
// its cuts follow the beat, talking over it), how much music the video needs, and the ways to
// give the video its music. SOCIA doesn't name songs (Noah, 2026-11-25), and never takes the
// sound out of someone else's Reel: the person brings music they own or have the rights to.
//   - Use from my library: the newest sounds are lined up with the reference in this browser;
//     the same recording is suggested first, with the part that matches.
//   - Upload song: the file is read here, the matching part found, and that part saved to the
//     library (lib/music/soundFile.ts), so it's there for every video after.
//   - Find licensed alternative: music made with AI for this video (instrumental, at the
//     reference's tempo and energy, price in credits shown first; app/api/studio/tracks/generate),
//     then library sounds with a similar tempo and energy.
//   - Choose different music: the Music setting under Customize.
//   - Continue without music.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Library, Loader2, Music, Search, SlidersHorizontal, Upload, VolumeX } from "lucide-react";
import { frameLevels } from "@/lib/audio/features";
import { alignSection, envelopeFromRms, partLabel, referenceMusicLines, type Alignment, type ReferenceMusic } from "@/lib/music/referenceMusic";
import { AUTO_CHECK, rankLibrary, type LibraryMatch } from "@/lib/music/libraryMatch";
import { decodeFile, monoOf, sameSound, saveSoundPart } from "@/lib/music/soundFile";
import { MAX_TRACK_SEC } from "@/lib/music/limits";
import type { Track } from "@/lib/music/tracks";
import type { MusicMode } from "@/lib/studioClips/creative";
import { actionCredits } from "@/lib/credits/config";
import { aiMusicSeconds, energyWords, MOOD_MAX } from "@/lib/music/aiMusic";

type View = null | "library" | "similar";
type Upload = { kind: "idle" } | { kind: "busy"; note: string; progress: number } | { kind: "done"; name: string; alignment: Alignment } | { kind: "dup"; track: Track; file: File };

/** One library sound against the reference, in words. */
export function matchLine(m: LibraryMatch, needSec: number): string {
  const a = m.alignment;
  // The part can't run past the end of the sound.
  const left = Math.max(0, Math.round(m.track.durationSec - a.startSec));
  const short = m.track.durationSec > 0 && left < needSec;
  needSec = short ? left : needSec;
  const ends = short ? " The sound ends there, before the video does." : "";
  if (a.level === "matched") {
    const speed = a.speed !== 1 ? `, which plays it ${Math.round(Math.abs(a.speed - 1) * 100)}% ${a.speed > 1 ? "faster" : "slower"}` : "";
    return `Same recording. Its part ${partLabel(a.startSec, needSec)} lines up with the reference${speed}.${ends}`;
  }
  if (a.level === "suggested") return `Similar shape: ${partLabel(a.startSec, needSec)} moves like the reference's music${m.bpm ? `, ${m.bpm} BPM` : ""}.${ends}`;
  if (m.bpm) return `${m.bpm} BPM${m.tempo >= 0.7 ? ", close to the reference's tempo" : ""}.`;
  return "No steady beat measured.";
}

export default function ReferenceMusicCard({ music, needSec, tracks, trackId, mode, disabled, onTracks, onChoose, onCustomize }: {
  music: ReferenceMusic;
  /** how long the video's music needs to be, seconds */
  needSec: number;
  tracks: Track[];
  trackId: string;
  mode: MusicMode;
  disabled: boolean;
  onTracks: (next: Track[]) => void;
  onChoose: (c: { trackId: string; mode: MusicMode }) => void;
  onCustomize: () => void;
}) {
  const [view, setView] = useState<View>(null);
  const [rank, setRank] = useState<{ ranked: LibraryMatch[]; checked: number } | null>(null);
  const [ranking, setRanking] = useState(false);
  const [upload, setUpload] = useState<Upload>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  // AI music (lib/music/aiMusic.ts): the person's mood words, and the one being made.
  const [mood, setMood] = useState("");
  const [making, setMaking] = useState<"idle" | "busy" | { name: string; seconds: number }>("idle");
  const aiSec = aiMusicSeconds(needSec);
  const aiCredits = actionCredits("music_tracks");
  const makeMusic = async () => {
    setError(null);
    setMaking("busy");
    try {
      const res = await fetch("/api/studio/tracks/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoSec: needSec, mood, reference: { bpm: music.bpm, drops: music.drops, speechShare: music.speechShare, musicLikely: music.musicLikely } }) }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { track?: Track; seconds?: number; error?: string } | null) : null;
      if (!res?.ok || !j?.track) throw new Error(j?.error ?? "SOCIA couldn't be reached. Check your connection and try again. No credits were used.");
      onTracks([j.track, ...tracks]);
      onChoose({ trackId: j.track.id, mode: "pick" });
      setMaking({ name: j.track.name, seconds: j.seconds ?? aiSec });
    } catch (e) {
      setError((e as Error).message);
      setMaking("idle");
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const lines = referenceMusicLines(music);
  const chosen = tracks.find((t) => t.id === trackId) ?? null;
  const need = Math.max(1, Math.round(needSec));

  // The newest sounds are lined up as soon as there is music to match (free, in this browser).
  // The answer is kept with the library it was made for; a changed library is lined up again.
  const pending = useRef("");
  const key = `${music.env.length}:${music.bpm}:${tracks.slice(0, AUTO_CHECK).map((t) => t.id).join()}`;
  useEffect(() => {
    if (!music.musicLikely || !tracks.length || pending.current === key) return;
    pending.current = key;
    setRanking(true);
    rankLibrary(music, tracks)
      .then((r) => { if (pending.current === key) setRank(r); })
      .finally(() => { if (pending.current === key) setRanking(false); });
  }, [key, music, tracks]);
  const checkAll = async () => { setRanking(true); try { setRank(await rankLibrary(music, tracks, tracks.length)); } finally { setRanking(false); } };

  const same = rank?.ranked.find((r) => r.alignment.level === "matched") ?? null;
  const alike = rank?.ranked.filter((r) => r.alignment.level !== "matched") ?? [];

  const save = async (file: File, force = false) => {
    setError(null);
    setUpload({ kind: "busy", note: "Reading the song", progress: 0 });
    const ctx = new AudioContext();
    try {
      const buffer = await decodeFile(file, ctx, (note) => setUpload({ kind: "busy", note: note.replace(/…$/, ""), progress: 0 }));
      setUpload({ kind: "busy", note: "Finding the part the reference uses", progress: 0 });
      const mono = monoOf(buffer);
      const alignment = alignSection(music, envelopeFromRms(frameLevels(mono, buffer.sampleRate).rms));
      // The whole song when it fits the library; otherwise the stretch around the matching part.
      let from = 0, to = Math.min(buffer.duration, MAX_TRACK_SEC);
      if (buffer.duration > MAX_TRACK_SEC) {
        const at = alignment.level !== "none" ? alignment.startSec : 0;
        from = Math.max(0, Math.min(buffer.duration - MAX_TRACK_SEC, at - 10));
        to = from + MAX_TRACK_SEC;
      }
      const dup = force ? null : sameSound(tracks, file.name, to - from);
      if (dup) { setUpload({ kind: "dup", track: dup, file }); return; }
      const saved = await saveSoundPart(buffer, from, to, { name: file.name.replace(/\.[a-z0-9]+$/i, ""), sourceName: file.name }, (note, progress) => setUpload({ kind: "busy", note: note.replace(/…$/, ""), progress }));
      onTracks([saved, ...tracks]);
      onChoose({ trackId: saved.id, mode: "match" });
      setUpload({ kind: "done", name: saved.name, alignment: { ...alignment, startSec: Math.max(0, alignment.startSec - from) } });
    } catch (e) {
      setError((e as Error).message || "Couldn't read that song.");
      setUpload({ kind: "idle" });
    } finally {
      void ctx.close().catch(() => {});
    }
  };

  const use = (m: LibraryMatch) => onChoose({ trackId: m.track.id, mode: m.alignment.level === "matched" ? "match" : "similar" });
  const row = (m: LibraryMatch) => (
    <li key={m.track.id}>
      <span><b>{m.track.name}</b><small>{matchLine(m, need)}</small></span>
      {trackId === m.track.id && mode !== "none"
        ? <span className="qe-music-on"><Check size={13} aria-hidden /> In use</span>
        : <button type="button" className="qe-btn is-small" disabled={disabled} onClick={() => use(m)}>Use</button>}
    </li>
  );

  return (
    <div className="qe-music" aria-live="polite">
      <div className="qe-music-head"><Music size={15} aria-hidden /><b>Reference music</b></div>
      <ul className="qe-music-facts">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {music.musicLikely && (
        <>
          <p className="qe-fine">Your video needs about {need} s of music. SOCIA measures the music; it doesn&apos;t name songs.</p>

          {/* What the video will play */}
          <p className="qe-music-now">
            {mode === "none" ? <><VolumeX size={13} aria-hidden /> No music in this video.</>
              : chosen ? <><Check size={13} aria-hidden /> {chosen.name}{mode === "match" ? ": SOCIA lines its part up with the reference when you make the video." : mode === "similar" ? ": a similar energy to the reference." : "."}</>
              : mode === "similar" ? <><Check size={13} aria-hidden /> SOCIA picks the closest sound from your library when you make the video.</>
              : "No music chosen yet."}
          </p>

          {same && !(trackId === same.track.id && mode !== "none") && (
            <div className="qe-music-same">
              <span><b>{same.track.name}</b> in your library is the same recording. <small>{matchLine(same, need).replace(/^Same recording\. /, "")}</small></span>
              <button type="button" className="qe-btn is-small" disabled={disabled} onClick={() => use(same)}>Use it</button>
            </div>
          )}

          <div className="qe-row qe-music-actions">
            <button type="button" className="qe-btn is-small" aria-expanded={view === "library"} disabled={disabled} onClick={() => setView((v) => (v === "library" ? null : "library"))}><Library size={13} aria-hidden /> Use from my library</button>
            <button type="button" className="qe-btn is-small" disabled={disabled || upload.kind === "busy"} onClick={() => fileInput.current?.click()}><Upload size={13} aria-hidden /> Upload song</button>
            <button type="button" className="qe-btn is-small" aria-expanded={view === "similar"} disabled={disabled} onClick={() => setView((v) => (v === "similar" ? null : "similar"))}><Search size={13} aria-hidden /> Find licensed alternative</button>
            <button type="button" className="qe-btn is-small" disabled={disabled} onClick={onCustomize}><SlidersHorizontal size={13} aria-hidden /> Choose different music</button>
            <button type="button" className="qe-btn is-small" disabled={disabled || mode === "none"} onClick={() => onChoose({ trackId: "", mode: "none" })}><VolumeX size={13} aria-hidden /> Continue without music</button>
          </div>
          <input ref={fileInput} type="file" hidden accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.ogg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void save(f); e.target.value = ""; }} />

          {upload.kind === "busy" && <p className="qe-fine" role="status"><Loader2 size={13} className="spin" aria-hidden /> {upload.note}{upload.progress > 0 ? ` (${Math.round(upload.progress * 100)}%)` : ""}…</p>}
          {upload.kind === "done" && (
            <p className="qe-fine">
              {upload.alignment.level === "matched" ? `Saved ${upload.name} to your library. Its part ${partLabel(upload.alignment.startSec, need)} matches the reference, so that part plays.`
                : upload.alignment.level === "suggested" ? `Saved ${upload.name} to your library. SOCIA couldn't confirm it's the same recording; ${partLabel(upload.alignment.startSec, need)} is the closest part. Move it in the editor, under Sound, if it's wrong.`
                : `Saved ${upload.name} to your library. It didn't line up with the reference's music, so its strongest part plays. Move it in the editor, under Sound.`}
            </p>
          )}
          {upload.kind === "dup" && (
            <div className="qe-music-same">
              <span><b>{upload.track.name}</b> is already in your library ({upload.file.name}).</span>
              <button type="button" className="qe-btn is-small" onClick={() => { onChoose({ trackId: upload.track.id, mode: "match" }); setUpload({ kind: "idle" }); }}>Use the saved one</button>
              <button type="button" className="qe-btn is-small" onClick={() => void save(upload.file, true)}>Save it again</button>
            </div>
          )}
          {error && <small className="qe-note"><AlertTriangle size={12} aria-hidden /> {error}</small>}

          {view === "similar" && (
            <div className="qe-music-ai">
              <b><Music size={13} aria-hidden /> Make music with AI</b>
              <small>Instrumental, about {aiSec} s, {music.bpm ? `around ${music.bpm} BPM, ` : ""}{energyWords(music)}{music.drops.length ? ", lifting where the reference lifts" : ""}. Made for this video, cleared for social media use, and saved to your library.</small>
              <label className="qe-music-mood">
                <span>Mood or style (optional)</span>
                <input className="qe-input" value={mood} maxLength={MOOD_MAX} disabled={disabled || making === "busy"} placeholder="For example: warm acoustic, morning cafe" onChange={(e) => setMood(e.target.value)} />
                <small>Describe a feeling or a style, not a song or an artist.</small>
              </label>
              {making === "busy"
                ? <p className="qe-fine" role="status"><Loader2 size={13} className="spin" aria-hidden /> Making the music. This takes up to a minute…</p>
                : <button type="button" className="qe-btn is-small" disabled={disabled} onClick={() => void makeMusic()}><Music size={13} aria-hidden /> Make the music: {aiCredits} credits</button>}
              {typeof making === "object" && <p className="qe-fine">Made {making.name} ({making.seconds} s) and saved it to your library. It plays under this video.</p>}
            </div>
          )}
          {view && (
            !tracks.length ? view === "similar" ? null : <p className="qe-fine">Your library has no sounds yet. Upload music you own or have the rights to.</p>
              : ranking && !rank ? <p className="qe-fine" role="status"><Loader2 size={13} className="spin" aria-hidden /> Lining your sounds up with the reference…</p>
              : rank && (
                <>
                  {view === "similar" && <p className="qe-fine">Sounds from your library with a tempo and energy like the reference&apos;s. SOCIA doesn&apos;t check who owns a sound: use music you own or have the rights to.</p>}
                  <ul className="qe-music-list">{(view === "library" ? rank.ranked : alike).slice(0, 5).map(row)}</ul>
                  {view === "similar" && !alike.length && <p className="qe-fine">No other sounds in your library to compare yet.</p>}
                  {rank.checked < tracks.length && (
                    <button type="button" className="qe-link" disabled={ranking} onClick={() => void checkAll()}>{ranking ? "Checking…" : `Check all ${tracks.length} sounds`}</button>
                  )}
                </>
              )
          )}

          <p className="qe-fine">To post with the reference&apos;s own song: make the video without music, then add the song from Instagram&apos;s music library before you share it.</p>
        </>
      )}
    </div>
  );
}
