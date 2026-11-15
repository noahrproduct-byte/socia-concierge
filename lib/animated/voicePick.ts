// Which voice an animated video's voiceover is read in, chosen from the
// account's own results (Noah, 2026-11-15: "it should choose the voice by
// seeing which one is doing best"). Each saved video remembers its voice
// (scheduled_posts.voice_id); once it is posted, its result against the
// account's own median is the evidence. Until every voice has been used a
// couple of times there is nothing to compare, so the voices take turns, and
// the screen says so. Pure and browser-safe.
import { median } from "@/lib/metrics";
import { fmtMultiplier } from "@/lib/multiplier";
import { voiceLabel } from "./voice";

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
  stats: VoiceStat[];
};

/**
 * The voice to use next. `voices` is what can be chosen now, in the order
 * they take turns; `uses` is every saved video with a voiceover.
 */
export function pickVoice(voices: { id: string; name: string }[], uses: VoiceUse[]): VoicePick {
  if (!voices.length) return { voiceId: null, why: "none", line: "", stats: [] };
  const stats: VoiceStat[] = voices.map((v) => {
    const mine = uses.filter((u) => u.voiceId === v.id);
    const results = mine.filter((u) => u.settled && u.multiplier != null).map((u) => u.multiplier as number);
    return { voiceId: v.id, name: voiceLabel(v).name, videos: mine.length, measured: results.length, median: results.length ? median(results) : null };
  });
  const turn = [...stats].sort((a, b) => a.videos - b.videos)[0];
  const stillTrying = stats.filter((s) => s.videos < MIN_PER_VOICE);
  if (stillTrying.length) {
    const done = stats.length - stillTrying.length;
    const line = uses.length === 0
      ? `None of your videos has a voiceover with results yet, so SOCIA starts with ${turn.name} and takes turns through the voices. It picks by your results once each voice has been used ${MIN_PER_VOICE} times.`
      : `SOCIA is still trying each voice on your videos: ${done} of ${stats.length} ${done === 1 ? "has" : "have"} been used ${MIN_PER_VOICE} times. This one is ${turn.name}'s turn. It picks by your results after that.`;
    return { voiceId: turn.voiceId, why: "trying", line, stats };
  }
  const ready = stats.filter((s) => s.measured >= MIN_PER_VOICE && s.median != null);
  if (ready.length < 2) {
    return { voiceId: turn.voiceId, why: "trying", line: `Every voice has been used, and SOCIA is waiting for results from your posted videos (a result counts 3 days after posting). Until then this one is ${turn.name}'s turn.`, stats };
  }
  const best = [...ready].sort((a, b) => (b.median as number) - (a.median as number) || b.measured - a.measured)[0];
  const few = best.measured < 5 ? " That is from only a few videos, so it can still change." : "";
  return {
    voiceId: best.voiceId, why: "best", stats,
    line: `SOCIA picked ${best.name}: your ${best.measured} posted videos with this voice did ${fmtMultiplier(best.median as number)} your usual result, the best of the ${ready.length} voices it could compare.${few}`,
  };
}
