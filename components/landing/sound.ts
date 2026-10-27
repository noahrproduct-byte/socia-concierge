"use client";

// The opening's sound, made here with the Web Audio API: nothing to load,
// nothing licensed, nothing generated. Four small gestures, each tied to a
// moment in the timeline:
//
//   letter(i)  a soft rush of filtered air and a low, rounded tone, a
//              little higher for each letter as it rises in
//   land()     a restrained low thump when the last letter lands
//   resolve()  a quiet two-note chord that settles as the tagline arrives
//
// Nothing plays before the browser allows it: ready() resumes the context
// and reports whether it is actually running. Levels sit well under speech.

type Synth = {
  ready: () => Promise<boolean>;
  letter: (i: number) => void;
  land: () => void;
  resolve: () => void;
  mute: () => void;
  close: () => void;
};

function noiseBuffer(ctx: AudioContext) {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function introSound(): Synth | null {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 6000;
  master.connect(soften).connect(ctx.destination);
  const noise = noiseBuffer(ctx);
  let muted = false;

  const at = () => ctx.currentTime + 0.01;

  const air = (t: number, from: number, to: number, dur: number, peak: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  };

  const tone = (t: number, freq: number, dur: number, peak: number, type: OscillatorType = "sine", slideTo?: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  return {
    ready: async () => {
      try { if (ctx.state !== "running") await ctx.resume(); } catch { /* blocked until a gesture */ }
      return ctx.state === "running";
    },
    letter: (i) => {
      if (muted) return;
      const t = at();
      air(t, 300, 1400, 0.34, 0.07);
      tone(t, 98 * Math.pow(2, i / 12), 0.42, 0.05);
    },
    land: () => {
      if (muted) return;
      const t = at();
      tone(t, 52, 0.7, 0.22, "sine", 38);
      air(t, 120, 60, 0.18, 0.06);
    },
    resolve: () => {
      if (muted) return;
      const t = at();
      tone(t, 196, 1.2, 0.035);
      tone(t + 0.08, 294, 1.1, 0.03);
    },
    mute: () => { muted = true; master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    close: () => { window.setTimeout(() => { void ctx.close().catch(() => {}); }, 1500); },
  };
}

export const SOUND_PREF = "socia-intro-sound";
