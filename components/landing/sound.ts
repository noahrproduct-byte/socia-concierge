"use client";

// The opening's sound, made here with the Web Audio API: nothing to load,
// nothing licensed, nothing generated. Three gestures, each tied to a moment
// in the timeline:
//
//   letter(i)  a soft rush of filtered air and a rounded tone, a step higher
//              for each letter as it rises in
//   land()     a restrained low landing when the last letter settles: a short
//              thump with a little body above it, so small speakers hear it
//   resolve()  a quiet two-note chord that settles as the tagline arrives
//
// The context is created by the click that turns sound on (that is the
// gesture browsers want) and reused for every replay. ready() resumes it
// and reports whether it is actually running. Levels are set for laptop
// speakers: present, never loud, and glued by a gentle compressor.

export type Synth = {
  ready: () => Promise<boolean>;
  letter: (i: number) => void;
  land: () => void;
  resolve: () => void;
  mute: () => void;
  stop: () => void;
};

export const SOUND_PREF = "socia-intro-sound";

export function makeContext(): AudioContext | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AC ? new AC() : null;
}

function noiseBuffer(ctx: AudioContext) {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// a pentatonic rise, one step per letter, around the middle of the keyboard
const STEPS = [329.63, 392.0, 440.0, 523.25, 587.33];

export function introSound(ctx: AudioContext): Synth {
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 4;
  glue.attack.value = 0.005;
  glue.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(glue).connect(ctx.destination);
  const noise = noiseBuffer(ctx);
  let muted = false;
  const live = new Set<AudioScheduledSourceNode>();

  const at = () => ctx.currentTime + 0.005;
  const keep = (n: AudioScheduledSourceNode, until: number) => { live.add(n); n.onended = () => live.delete(n); n.stop(until); };

  const air = (t: number, from: number, to: number, dur: number, peak: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    keep(src, t + dur + 0.05);
  };

  const tone = (t: number, freq: number, dur: number, peak: number, type: OscillatorType, slideTo?: number, attack = 0.015) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    keep(o, t + dur + 0.05);
  };

  return {
    ready: async () => {
      try { if (ctx.state !== "running") await ctx.resume(); } catch { /* blocked until a gesture */ }
      return ctx.state === "running";
    },
    letter: (i) => {
      if (muted) return;
      const t = at();
      air(t, 700, 2600, 0.36, 0.12);
      tone(t, STEPS[i] ?? STEPS[4], 0.5, 0.16, "triangle");
      tone(t, (STEPS[i] ?? STEPS[4]) / 2, 0.5, 0.08, "sine");
    },
    land: () => {
      if (muted) return;
      const t = at();
      tone(t, 110, 0.55, 0.42, "sine", 62, 0.008);   // the thump
      tone(t, 220, 0.18, 0.18, "triangle", 140, 0.004); // its body, for small speakers
      air(t, 1600, 300, 0.22, 0.16);                  // the contact
    },
    resolve: () => {
      if (muted) return;
      const t = at();
      tone(t, 261.63, 1.4, 0.07, "triangle", undefined, 0.3);
      tone(t + 0.1, 392.0, 1.3, 0.055, "triangle", undefined, 0.3);
      tone(t, 130.81, 1.4, 0.05, "sine", undefined, 0.3);
    },
    mute: () => { muted = true; master.gain.setTargetAtTime(0, ctx.currentTime, 0.04); },
    stop: () => { for (const n of live) { try { n.stop(); } catch { /* already done */ } } live.clear(); },
  };
}
