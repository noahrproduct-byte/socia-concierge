import { describe, it, expect } from "vitest";
import { SpikeDetector, isReaction, scoreSpike, SPIKES } from "./spikes";

/** A chat at `perSec` messages a second from `people` different users, from `from` to `to` seconds. */
function chat(d: SpikeDetector, from: number, to: number, perSec: number, people: number, text = "hello") {
  let n = 0;
  for (let t = from * 1000; t < to * 1000; t += 1000 / perSec) d.push({ at: Math.round(t), user: `u${n++ % people}`, text });
}
/** Ask the detector every second, as the watcher does. */
function run(d: SpikeDetector, from: number, to: number) {
  const out = [];
  for (let t = from; t <= to; t++) { const s = d.check(t * 1000); if (s) out.push(s); }
  return out;
}

describe("chat spikes", () => {
  it("finds the moment chat jumps well above its usual pace", () => {
    const d = new SpikeDetector();
    chat(d, 0, 180, 0.5, 20);
    chat(d, 180, 200, 4, 30, "KEKW");
    const spikes = [...run(d, 0, 179), ...run(d, 180, 200)];
    expect(spikes).toHaveLength(1);
    expect(spikes[0].at / 1000).toBeGreaterThanOrEqual(180);
    expect(spikes[0].at / 1000).toBeLessThan(190);
    expect(spikes[0].hype).toBeGreaterThan(0.5);
  });
  it("ignores one person spamming, a quiet channel's two messages, and the first minute", () => {
    const spam = new SpikeDetector();
    chat(spam, 0, 120, 0.3, 10);
    chat(spam, 120, 140, 5, 1, "LUL");
    expect([...run(spam, 0, 119), ...run(spam, 120, 140)]).toHaveLength(0);

    const quiet = new SpikeDetector();
    chat(quiet, 0, 120, 0.05, 3);
    chat(quiet, 120, 130, 0.5, 5);
    expect([...run(quiet, 0, 119), ...run(quiet, 120, 130)]).toHaveLength(0);

    const early = new SpikeDetector();
    chat(early, 0, 30, 5, 30, "LUL");
    expect(run(early, 0, 30)).toHaveLength(0);
  });
  it("clips one moment once, then again after the cooldown", () => {
    const d = new SpikeDetector();
    chat(d, 0, 120, 0.5, 20);
    chat(d, 120, 200, 4, 30, "W");
    const spikes = [...run(d, 0, 119), ...run(d, 120, 200)];
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < spikes.length; i++) expect(spikes[i].at - spikes[i - 1].at).toBeGreaterThanOrEqual(SPIKES.cooldownSec * 1000);
  });
  it("reads a reaction, not ordinary chat", () => {
    for (const t of ["KEKW", "LUL LUL", "no way", "CLIP IT", "😂😂", "????", "hahaha", "W"]) expect(isReaction(t)).toBe(true);
    for (const t of ["what game is this", "hi from brazil", "how long is the stream", ""]) expect(isReaction(t)).toBe(false);
  });
  it("scores a bigger, wider, longer moment higher, and says why", () => {
    const small = scoreSpike({ at: 0, rate: 2, baseline: 0.7, people: 6, hype: 0.1 }, 2);
    const big = scoreSpike({ at: 0, rate: 8, baseline: 0.7, people: 40, hype: 0.7 }, 18);
    expect(big.score).toBeGreaterThan(small.score);
    expect(big.score).toBeLessThanOrEqual(100);
    expect(small.score).toBeGreaterThanOrEqual(0);
    expect(big.why).toMatch(/Chat ran 11× its usual pace with 40 people, 70% reacting, for 18 s\./);
  });
});

import { channelFromInput } from "./channels";
describe("Twitch channels from what people paste", () => {
  it("reads a name, a link or an @handle, and nothing else", () => {
    expect(channelFromInput("xQc")).toBe("xqc");
    expect(channelFromInput("https://www.twitch.tv/Kai_Cenat?sr=a")).toBe("kai_cenat");
    expect(channelFromInput("twitch.tv/summit1g/videos")).toBe("summit1g");
    expect(channelFromInput("@shroud")).toBe("shroud");
    expect(channelFromInput("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(channelFromInput("twitch.tv/directory")).toBeNull();
    expect(channelFromInput("a b")).toBeNull();
  });
});
