// The sound of one finished video, measured from its samples, for Quick
// Analyze: level, how much of it has sound, a silent opening, the longest
// pause, whether music is likely and its tempo. Pure (tested on synthetic
// signals); the browser decodes the file (lib/audio/decode.ts) and calls it.
import { analyzeAudio } from "./features";
import { audioSummary, pcmWindows, SILENCE_DB } from "@/lib/studioClips/facts";

export type QuickAudio = {
  durationSec: number;
  hasAudio: boolean;
  /** mean level of the audible parts, dBFS */
  levelDb: number | null;
  peakDb: number | null;
  level: "silent" | "quiet" | "ok" | "loud" | "unknown";
  /** share of the video with audible sound, 0..1 */
  audibleRatio: number | null;
  /** seconds of silence before the first sound */
  silentOpeningSec: number;
  /** longest pause anywhere, seconds */
  longestPauseSec: number;
  pauses: { start: number; end: number }[];
  bpm: number | null;
  bpmConfidence: number;
  musicLikely: boolean;
};

export function quickAudioFrom(pcm: Float32Array, rate: number): QuickAudio {
  const ints = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
  const windows = pcmWindows(ints, rate);
  const summary = audioSummary(windows);
  const f = analyzeAudio(pcm, rate);
  // Silence from the very start: windows at or below the silence threshold from t=0.
  let opening = 0;
  for (const w of windows) { if (w.db <= SILENCE_DB) opening = w.t + 0.1; else break; }
  const pauses = summary.silences;
  return {
    durationSec: f.durationSec,
    hasAudio: summary.level !== "silent" && (summary.audibleRatio ?? 0) > 0.02,
    levelDb: summary.rmsDb,
    peakDb: summary.peakDb,
    level: summary.level,
    audibleRatio: summary.audibleRatio,
    silentOpeningSec: Number(Math.min(opening, f.durationSec).toFixed(1)),
    longestPauseSec: Number((pauses.length ? Math.max(...pauses.map((p) => p.end - p.start)) : 0).toFixed(1)),
    pauses: pauses.slice(0, 8),
    bpm: f.bpm,
    bpmConfidence: f.bpmConfidence,
    musicLikely: f.musicLikely,
  };
}

/** One line for the model and the UI, from the numbers only. */
export function describeQuickAudio(a: QuickAudio): string {
  if (!a.hasAudio) return "No audible sound in the file.";
  const parts = [
    `${a.level} level${a.levelDb != null ? ` (${a.levelDb} dBFS, peak ${a.peakDb ?? "?"})` : ""}`,
    `sound ${Math.round((a.audibleRatio ?? 0) * 100)}% of the time`,
    a.silentOpeningSec >= 0.5 ? `silent for the first ${a.silentOpeningSec}s` : "sound from the first second",
    a.longestPauseSec >= 0.7 ? `longest pause ${a.longestPauseSec}s` : "no long pauses",
    a.musicLikely ? `music likely${a.bpm ? `, steady beat around ${a.bpm} BPM` : ""}` : a.bpm ? `a steady beat around ${a.bpm} BPM` : "no clear music",
  ];
  return parts.join("; ");
}

/** A transcript as short timestamped lines ("[0:04] We fed two hundred people."), for the model. */
export function timedTranscript(t: { text: string; words: { text: string; startMs: number }[] }, maxChars = 2400): string {
  if (!t.words.length) return t.text.slice(0, maxChars);
  const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const lines: string[] = [];
  let cur: string[] = [];
  let start = t.words[0].startMs;
  for (const w of t.words) {
    if (cur.length && (w.startMs - start > 6000 || /[.!?]$/.test(cur[cur.length - 1]))) { lines.push(`[${clock(start)}] ${cur.join(" ")}`); cur = []; start = w.startMs; }
    cur.push(w.text);
  }
  if (cur.length) lines.push(`[${clock(start)}] ${cur.join(" ")}`);
  const out = lines.join("\n");
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}
