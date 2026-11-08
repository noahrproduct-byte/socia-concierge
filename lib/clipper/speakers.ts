// Following the conversation on a one-camera podcast: the transcript says who
// is talking when, Claude says where each person sits, and this turns the two
// into hard cuts. A short "yeah" doesn't move the picture, a new voice cuts on
// its first word, and when people trade quick lines the picture shows them
// both. Pure, client-safe.

import type { TranscriptWord } from "@/lib/transcribe/types";
import { shotScale, type CropKey, type ShotKind } from "./reframe";

/** A voice must carry on this long to take the picture. */
export const MIN_TURN_SEC = 1.2;
const MIN_TURN_WORDS = 3;
/** A shot holds at least this long. */
export const MIN_SPEAKER_HOLD_SEC = 1.5;
/** This many speaker changes inside TRADE_WINDOW_SEC is a quick exchange: show them both. */
const TRADE_TURNS = 3;
const TRADE_WINDOW_SEC = 8;

export type Turn = { t: number; speaker: string };

/** Who holds the floor when, from words with times counted from the clip's start. Short interjections are dropped. */
export function speakerTurns(words: TranscriptWord[]): Turn[] {
  const runs: { speaker: string; startMs: number; endMs: number; words: number }[] = [];
  for (const w of words) {
    if (!w.speaker) continue;
    const last = runs[runs.length - 1];
    if (last?.speaker === w.speaker) { last.endMs = w.endMs; last.words++; }
    else runs.push({ speaker: w.speaker, startMs: w.startMs, endMs: w.endMs, words: 1 });
  }
  const turns: Turn[] = [];
  for (const r of runs) {
    if (turns.length && ((r.endMs - r.startMs) / 1000 < MIN_TURN_SEC || r.words < MIN_TURN_WORDS)) continue;
    const last = turns[turns.length - 1];
    if (last?.speaker === r.speaker) continue;
    const t = turns.length ? Math.round((r.startMs / 1000) * 10) / 10 : 0;
    if (last && t - last.t < MIN_SPEAKER_HOLD_SEC) continue;
    turns.push({ t, speaker: r.speaker });
  }
  return turns;
}

type Person = { speaker?: unknown; center?: unknown; y?: unknown };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The shots for a one-camera conversation, or null when this isn't one: fewer
 * than two people who both speak and can be placed. Someone off camera never
 * takes the picture.
 */
export function speakerPath(raw: unknown, words: TranscriptWord[], durationSec: number, share: number): CropKey[] | null {
  const a = raw as { camera?: unknown; framing?: unknown; people?: unknown } | null;
  if (a?.camera !== "one_camera" || !Array.isArray(a.people) || share >= 1) return null;
  const seats = new Map<string, { c: number; y: number }>();
  for (const p of a.people as Person[]) {
    const c = Number(p?.center), y = Number(p?.y);
    if (typeof p?.speaker === "string" && Number.isFinite(c) && Number.isFinite(y)) seats.set(p.speaker, { c: r3(clamp01(c)), y: r3(clamp01(y)) });
  }
  const turns = speakerTurns(words.filter((w) => w.speaker && seats.has(w.speaker)));
  if (seats.size < 2 || new Set(turns.map((t) => t.speaker)).size < 2) return null;

  const shot: ShotKind = a.framing === "tall" ? "person" : "band";
  const both: Omit<CropKey, "t"> = { c: 0.5, y: 0.5, s: r3(shotScale("wide", share)) };
  const trading = (i: number) => {
    for (let from = Math.max(0, i - TRADE_TURNS); from <= i; from++) {
      const to = turns[from + TRADE_TURNS];
      if (to && from + TRADE_TURNS >= i && to.t - turns[from].t < TRADE_WINDOW_SEC) return true;
    }
    return false;
  };
  const path: CropKey[] = [];
  turns.forEach((turn, i) => {
    if (turn.t >= durationSec) return;
    const seat = seats.get(turn.speaker)!;
    const view = trading(i) ? both : { c: seat.c, y: seat.y, s: r3(shotScale(shot, share)) };
    const last = path[path.length - 1];
    if (!last || last.c !== view.c || last.s !== view.s) path.push({ t: turn.t, ...view });
  });
  return path.length ? path : null;
}
