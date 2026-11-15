// Which voice an animated video's voiceover is read in, chosen from the
// account's own results (Noah, 2026-11-15: "it should choose the voice by
// seeing which one is doing best"). Each saved video remembers its voice
// (scheduled_posts.voice_id); once it is posted, its result against the
// account's own median is the evidence. Until every voice has been used a
// couple of times there is nothing to compare, so the voices take turns, and
// the screen says so. The turns start from the kind of voice the account's own
// best Reels use, or else its competitors' (lib/voiceRead.ts, measured during
// the video style read): results decide, and what was heard only decides who
// goes first. Pure and browser-safe.
import { median } from "@/lib/metrics";
import { fmtMultiplier } from "@/lib/multiplier";
import { voiceLabel } from "./voice";
import { pitchGap, pitchWord, type HeardVoices } from "@/lib/voiceRead";

/** Videos a voice needs before it is compared: fewer than this is one lucky or unlucky post. */
export const MIN_PER_VOICE = 2;

/** One saved video that has a voiceover. */
export type VoiceUse = {
  voiceId: string;
  /** Its result against the account's own median, once posted and reported; null before that. */
  multiplier: number | null;
  /** The result was read after the first days, when the numbers have stopped moving much. */
  settled: boolean;
};

export type VoiceStat = { voiceId: string; name: string; videos: number; measured: number; median: number | null };

export type VoicePick = {
  /** The voice to start from; null when there are no voices. */
  voiceId: string | null;
  /** best: chosen from results. trying: the voices are still taking turns. none: no voices to choose from. */
  why: "best" | "trying" | "none";
  /** One plain sentence for the screen about why this voice. */
  line: string;
  /** Set when few of the competitors' best Reels have anyone speaking: worth knowing before adding a voice. */
  note?: string;
  stats: VoiceStat[];
};

/** Reels with someone speaking needed before their voice is taken as the kind that set of videos uses. */
export const MIN_HEARD = 2;

/**
 * Who goes first, from what was heard: the voices in order of how close each
 * is to the voice in the account's own best Reels, or else its competitors',
 * with a sentence saying what was heard. Null when nothing usable was heard.
 */
export function heardOrder(voices: { id: string; name: string }[], heard: HeardVoices | null | undefined): { order: string[]; lead: string } | null {
  if (!heard) return null;
  const pitchOf = new Map(heard.stock.map((x) => [x.id, x.pitchHz]));
  if (voices.filter((v) => pitchOf.has(v.id)).length < 2) return null;
  const mine = heard.own.spoken >= MIN_HEARD && heard.own.pitchHz != null;
  const theirs = heard.competitors.spoken >= MIN_HEARD && heard.competitors.pitchHz != null;
  if (!mine && !theirs) return null;
  const k = mine ? heard.own : heard.competitors;
  const hz = k.pitchHz as number;
  const order = [...voices].sort((a, b) => (pitchOf.has(a.id) ? pitchGap(pitchOf.get(a.id) as number, hz) : 99) - (pitchOf.has(b.id) ? pitchGap(pitchOf.get(b.id) as number, hz) : 99)).map((v) => v.id);
  const first = voiceLabel(voices.find((v) => v.id === order[0])!).name;
  const who = mine ? `${k.spoken} of the ${k.reels} Reels of yours that SOCIA listened to` : `${k.spoken} of your competitors' ${k.reels} best Reels that SOCIA listened to`;
  return { order, lead: `${who} have someone speaking, in ${pitchWord(hz)}. ${first} is the closest of SOCIA's voices, so it goes first.` };
}

/**
 * The voice to use next. `voices` is what can be chosen now, in the order
 * they take turns; `uses` is every saved video with a voiceover.
 */
export function pickVoice(voices: { id: string; name: string }[], uses: VoiceUse[], heard?: HeardVoices | null): VoicePick {
  if (!voices.length) return { voiceId: null, why: "none", line: "", stats: [] };
  const start = heardOrder(voices, heard);
  const rank = (id: string) => { const i = start ? start.order.indexOf(id) : voices.findIndex((v) => v.id === id); return i < 0 ? 99 : i; };
  const c = heard?.competitors;
  const note = c && c.reels >= 4 && c.spoken / c.reels < 1 / 3
    ? `Only ${c.spoken} of your competitors' ${c.reels} best Reels that SOCIA listened to ${c.spoken === 1 ? "has" : "have"} someone speaking, so a voiceover is less common in your niche.`
    : undefined;
  const stats: VoiceStat[] = voices.map((v) => {
    const mine = uses.filter((u) => u.voiceId === v.id);
    const results = mine.filter((u) => u.settled && u.multiplier != null).map((u) => u.multiplier as number);
    return { voiceId: v.id, name: voiceLabel(v).name, videos: mine.length, measured: results.length, median: results.length ? median(results) : null };
  });
  // The next turn: the voice used least; among equals, the one closest to what was heard.
  const turn = [...stats].sort((a, b) => a.videos - b.videos || rank(a.voiceId) - rank(b.voiceId))[0];
  const stillTrying = stats.filter((s) => s.videos < MIN_PER_VOICE);
  if (stillTrying.length) {
    const done = stats.length - stillTrying.length;
    const line = uses.length === 0
      ? start
        ? `${start.lead} After that the voices take turns, and SOCIA picks by your own results once each has been used ${MIN_PER_VOICE} times.`
        : `None of your videos has a voiceover with results yet, so SOCIA starts with ${turn.name} and takes turns through the voices. It picks by your results once each voice has been used ${MIN_PER_VOICE} times.`
      : `SOCIA is still trying each voice on your videos: ${done} of ${stats.length} ${done === 1 ? "has" : "have"} been used ${MIN_PER_VOICE} times. This one is ${turn.name}'s turn. It picks by your results after that.`;
    return { voiceId: turn.voiceId, why: "trying", line, note, stats };
  }
  const ready = stats.filter((s) => s.measured >= MIN_PER_VOICE && s.median != null);
  if (ready.length < 2) {
    return { voiceId: turn.voiceId, why: "trying", line: `Every voice has been used, and SOCIA is waiting for results from your posted videos (a result counts 3 days after posting). Until then this one is ${turn.name}'s turn.`, note, stats };
  }
  const best = [...ready].sort((a, b) => (b.median as number) - (a.median as number) || b.measured - a.measured)[0];
  const few = best.measured < 5 ? " That is from only a few videos, so it can still change." : "";
  return {
    voiceId: best.voiceId, why: "best", stats,
    line: `SOCIA picked ${best.name}: your ${best.measured} posted videos with this voice did ${fmtMultiplier(best.median as number)} your usual result, the best of the ${ready.length} voices it could compare.${few}`,
  };
}
