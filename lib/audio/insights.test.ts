import { describe, it, expect } from "vitest";
import { buildInsights, accountAudio, type AudioMediaRow } from "./insights";
import type { AudioFeatures } from "./features";

const feat = (over: Partial<AudioFeatures> = {}): AudioFeatures => ({ durationSec: 20, audibleRatio: 0.95, energyDb: -20, peakDb: -3, bpm: 118, bpmConfidence: 0.6, flatness: 0.2, musicScore: 0.7, musicLikely: true, ...over });
const row = (over: Partial<AudioMediaRow> & { mediaId: string }): AudioMediaRow => ({ source: "own", accountKey: "me", accountLabel: "@me", permalink: null, postedAt: null, hasMediaUrl: true, interactions: 100, views: null, features: null, error: null, ...over });

describe("audio insights", () => {
  it("compares library music with original audio against the account's own median", () => {
    const rows: AudioMediaRow[] = [
      row({ mediaId: "l1", hasMediaUrl: false, interactions: 300 }),
      row({ mediaId: "l2", hasMediaUrl: false, interactions: 220 }),
      row({ mediaId: "l3", hasMediaUrl: false, interactions: 180 }),
      row({ mediaId: "o1", interactions: 100, features: feat({ bpm: 112 }) }),
      row({ mediaId: "o2", interactions: 90, features: feat({ bpm: 124 }) }),
      row({ mediaId: "o3", interactions: 80, features: feat({ bpm: null, musicLikely: false, musicScore: 0.2 }) }),
      row({ mediaId: "o4", interactions: 70, features: null }),
    ];
    const ins = buildInsights(rows);
    expect(ins.own?.baseline).toBe(true);
    // account median = 100 (70,80,90,100,180,220,300)
    expect(ins.own?.library.medianMultiplier).toBeCloseTo(2.2, 2);
    expect(ins.own?.original.medianMultiplier).toBeCloseTo(0.85, 2);
    expect(ins.recommendation).toMatch(/library have done 2\.2× your median against 0\.9× without/);
    expect(ins.recommendation).toMatch(/112–124 BPM/);
    expect(ins.own?.pending).toBe(1);
    expect(ins.coverage).toEqual({ total: 7, library: 3, measured: 3, pending: 1, failed: 0 });
  });

  it("never claims a comparison it cannot back", () => {
    const few = buildInsights([row({ mediaId: "a" }), row({ mediaId: "b" })]);
    expect(few.recommendation).toMatch(/Not enough posts/);
    const noPerf = buildInsights(Array.from({ length: 6 }, (_, i) => row({ mediaId: `p${i}`, interactions: null })));
    expect(noPerf.recommendation).toMatch(/don't have engagement numbers/);
    const oneSided = buildInsights([...Array.from({ length: 6 }, (_, i) => row({ mediaId: `o${i}`, interactions: 100 + i })), row({ mediaId: "l", hasMediaUrl: false, interactions: 500 })]);
    expect(oneSided.recommendation).toMatch(/Too few library-music posts \(1\)/);
  });

  it("adds competitor lines with their own baselines", () => {
    const comp = (id: string, lib: boolean, inter: number) => row({ mediaId: id, source: "competitor", accountKey: "rival", accountLabel: "@rival", hasMediaUrl: !lib, interactions: inter });
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => row({ mediaId: `o${i}`, interactions: 100 })),
      comp("c1", true, 900), comp("c2", true, 800), comp("c3", true, 700), comp("c4", false, 100), comp("c5", false, 120), comp("c6", false, 90),
    ];
    const ins = buildInsights(rows);
    expect(ins.evidence.some((e) => /@rival: 3 of 6 recent posts use library music \(.*× vs .*× their median\)/.test(e))).toBe(true);
    expect(accountAudio(rows.filter((r) => r.source === "competitor")).library.medianMultiplier).toBeGreaterThan(1);
  });
});
