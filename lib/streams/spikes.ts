// Chat spikes on a live stream: the moment to clip. Chat reacts a few seconds
// after something happens on stream, and it reacts by speeding up, by more
// people talking at once, and by the same few reactions ("LUL", "KEKW", "no
// way", "clip it"). A spike is chat running well above this channel's own
// usual pace, with enough different people in it, not one person spamming.
//
// Twitch's Create Clip captures about 85 s before the call and 5 s after, and
// publishes the last `duration` seconds of that (lib/streams/twitch.ts). Called
// when the spike is seen, a 30 s clip starts about 20 s before the reaction,
// so the moment that caused it is in the clip (Noah's reference: Marqee Clip,
// "saves the clip from 20 s before").
//
// Pure and deterministic: the watcher feeds messages with their times and asks
// for spikes; nothing here touches the network or the clock.

export type ChatMessage = { at: number; user: string; text: string };

export type Spike = {
  /** when the spike was seen, ms (the moment to call Create Clip) */
  at: number;
  /** chat's pace in the last window and its usual pace, messages a second */
  rate: number;
  baseline: number;
  /** different people talking in the last window */
  people: number;
  /** share of messages in the window that are reactions (laughs, "no way", "clip it") */
  hype: number;
};

export type ScoredSpike = Spike & {
  /** 0 to 100: how big a moment this was for this channel */
  score: number;
  /** seconds chat stayed above its usual pace after the spike */
  sustainSec: number;
  /** the score in one plain line */
  why: string;
};

export const SPIKES = {
  /** the window chat's current pace is read over */
  windowSec: 10,
  /** how slowly the usual pace follows chat (seconds for the average to mostly catch up) */
  baselineSec: 300,
  /** a spike runs at least this many times the usual pace... */
  ratio: 2.5,
  /** ...and at least this fast, so a quiet channel's two messages aren't a moment */
  minRate: 0.8,
  /** ...with at least this many different people in the window */
  minPeople: 5,
  /** one clip per moment: no new spike this soon after the last one */
  cooldownSec: 45,
  /** chat is read this long before spikes are trusted, so the usual pace means something */
  warmupSec: 60,
  /** how long after a spike its sustain is measured, for the score */
  sustainWindowSec: 20,
} as const;

// What a chat says when something clip-worthy happened. Lower-cased whole tokens or phrases.
const REACTION_TOKENS = new Set([
  "lul", "lol", "lmao", "lmfao", "kekw", "omegalul", "icant", "pepelaugh", "lulw", "kek", "xd", "haha", "hahaha", "w", "ww", "www", "l", "dead", "pog", "pogchamp", "poggers", "pogu", "omg", "wtf", "bro", "noway", "clip", "clipit", "monkas", "sheesh", "insane", "holy", "wow", "goat", "letsgo", "🤣", "😂", "💀", "😭", "🔥", "😱",
]);
const REACTION_PHRASES = ["clip it", "clip that", "no way", "let's go", "lets go", "oh my god", "what the", "bro what", "hold on"];

/** Whether one chat message is a reaction. */
export function isReaction(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  if (/^[?!]{3,}$/.test(t) || /^(ha){2,}h?$/.test(t)) return true;
  if (REACTION_PHRASES.some((p) => t.includes(p))) return true;
  const tokens = t.split(/\s+/).map((w) => w.replace(/[.,:;'"()]/g, ""));
  // Whole words, or a reaction emoji anywhere in a word ("😂😂", "lol💀"); single letters only as a whole word ("W").
  return tokens.some((w) => REACTION_TOKENS.has(w) || Array.from(w).some((ch) => ch.codePointAt(0)! > 0x2000 && REACTION_TOKENS.has(ch)));
}

type Entry = { at: number; user: string; reaction: boolean };

/**
 * One channel's chat, read as it arrives. `push` each message in time order;
 * `check(now)` returns a spike when there is one (and starts the cooldown).
 */
export class SpikeDetector {
  private recent: Entry[] = [];
  private baseline: number | null = null;
  private lastTick: number | null = null;
  private firstAt: number | null = null;
  private lastSpikeAt = -Infinity;

  push(m: ChatMessage): void {
    if (this.firstAt == null) this.firstAt = m.at;
    this.recent.push({ at: m.at, user: m.user, reaction: isReaction(m.text) });
  }

  /** chat's pace over the last window, messages a second */
  rateAt(now: number): number {
    const from = now - SPIKES.windowSec * 1000;
    return this.recent.filter((e) => e.at > from && e.at <= now).length / SPIKES.windowSec;
  }

  /** The usual pace, updated to `now`. A spike doesn't drag it up much: it follows slowly. */
  private updateBaseline(now: number, rate: number): number {
    if (this.baseline == null || this.lastTick == null) {
      this.baseline = rate;
    } else {
      const dt = Math.max(0, (now - this.lastTick) / 1000);
      const k = 1 - Math.exp(-dt / SPIKES.baselineSec);
      // While chat is spiking, the usual pace barely moves, so one long moment isn't read as the new normal.
      const spiking = rate > this.baseline * SPIKES.ratio;
      this.baseline += (spiking ? k * 0.1 : k) * (rate - this.baseline);
    }
    this.lastTick = now;
    return this.baseline;
  }

  check(now: number): Spike | null {
    // Keep only what the window and the sustain measurement need.
    const keepFrom = now - Math.max(SPIKES.windowSec, SPIKES.sustainWindowSec) * 1000 * 2;
    if (this.recent.length && this.recent[0].at < keepFrom) this.recent = this.recent.filter((e) => e.at >= keepFrom);
    const rate = this.rateAt(now);
    const usual = this.baseline ?? rate;
    this.updateBaseline(now, rate);
    if (this.firstAt == null || now - this.firstAt < SPIKES.warmupSec * 1000) return null;
    if (now - this.lastSpikeAt < SPIKES.cooldownSec * 1000) return null;
    const from = now - SPIKES.windowSec * 1000;
    const inWindow = this.recent.filter((e) => e.at > from && e.at <= now);
    const people = new Set(inWindow.map((e) => e.user)).size;
    const floor = Math.max(usual, 0.05);
    if (rate < SPIKES.minRate || rate < floor * SPIKES.ratio || people < SPIKES.minPeople) return null;
    this.lastSpikeAt = now;
    const hype = inWindow.length ? inWindow.filter((e) => e.reaction).length / inWindow.length : 0;
    return { at: now, rate: r2(rate), baseline: r2(Math.max(usual, 0)), people, hype: r2(hype) };
  }

  /**
   * How long chat stayed above its usual pace after `spike`, read once
   * SPIKES.sustainWindowSec has passed (or less if asked sooner).
   */
  sustainAfter(spike: Spike, now: number): number {
    const end = Math.min(now, spike.at + SPIKES.sustainWindowSec * 1000);
    const over = Math.max(spike.baseline, 0.05) * 1.5;
    let sec = 0;
    for (let t = spike.at + 1000; t <= end; t += 1000) {
      if (this.rateAt(t) >= over) sec++;
      else break;
    }
    return sec;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The score, 0 to 100, from what chat did: how far above its usual pace
 * (40), how many people (20), how much of it was reaction (20) and how long
 * it lasted (20). Relative to the channel, so a small streamer's big moment
 * scores like a big streamer's.
 */
export function scoreSpike(spike: Spike, sustainSec: number): ScoredSpike {
  const times = spike.rate / Math.max(spike.baseline, 0.05);
  const intensity = clamp01(Math.log2(Math.max(1, times)) / Math.log2(8));
  const breadth = clamp01(spike.people / 25);
  const hype = clamp01(spike.hype / 0.5);
  const sustain = clamp01(sustainSec / SPIKES.sustainWindowSec);
  const score = Math.round(100 * (0.4 * intensity + 0.2 * breadth + 0.2 * hype + 0.2 * sustain));
  const why = `Chat ran ${times >= 10 ? Math.round(times) : times.toFixed(1)}× its usual pace with ${spike.people} people${spike.hype >= 0.1 ? `, ${Math.round(spike.hype * 100)}% reacting` : ""}${sustainSec ? `, for ${sustainSec} s` : ""}.`;
  return { ...spike, score, sustainSec, why };
}
