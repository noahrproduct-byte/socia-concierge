import { describe, expect, it } from "vitest";
import { MIN_PER_VOICE, pickVoice, type VoiceUse } from "./voicePick";

const voices = [
  { id: "bella", name: "Bella - Professional, Bright, Warm" },
  { id: "alice", name: "Alice - Clear, Engaging Educator" },
  { id: "charlie", name: "Charlie - Deep, Confident, Energetic" },
];
const use = (voiceId: string, multiplier: number | null = null, settled = multiplier != null): VoiceUse => ({ voiceId, multiplier, settled });
const twiceEach = (m: Record<string, number[]>) => Object.entries(m).flatMap(([id, xs]) => xs.map((x) => use(id, x)));

describe("choosing the voice from the account's own results", () => {
  it("has nothing to choose from without voices", () => {
    expect(pickVoice([], [])).toEqual({ voiceId: null, why: "none", line: "", stats: [] });
  });
  it("starts with the first voice and says it is taking turns", () => {
    const p = pickVoice(voices, []);
    expect(p.why).toBe("trying");
    expect(p.voiceId).toBe("bella");
    expect(p.line).toContain("starts with Bella");
    expect(p.line).toContain(`used ${MIN_PER_VOICE} times`);
  });
  it("gives the next turn to the voice used least", () => {
    expect(pickVoice(voices, [use("bella"), use("bella"), use("alice")]).voiceId).toBe("charlie");
    const p = pickVoice(voices, [use("bella"), use("bella"), use("alice"), use("charlie")]);
    expect(p.voiceId).toBe("alice");
    expect(p.line).toContain("1 of 3 has been used 2 times");
  });
  it("waits for results once every voice has had its turns", () => {
    const p = pickVoice(voices, [use("bella"), use("bella"), use("alice"), use("alice"), use("charlie"), use("charlie", 3, false)]);
    expect(p.why).toBe("trying");
    expect(p.line).toContain("waiting for results");
  });
  it("picks the voice whose videos did best against the account's usual result", () => {
    const p = pickVoice(voices, twiceEach({ bella: [0.8, 1.0], alice: [1.6, 2.2], charlie: [1.1, 0.9] }));
    expect(p.why).toBe("best");
    expect(p.voiceId).toBe("alice");
    expect(p.line).toContain("SOCIA picked Alice");
    expect(p.line).toContain("1.9×");
    expect(p.line).toContain("best of the 3 voices");
    expect(p.line).toContain("only a few videos");
    const alice = p.stats.find((s) => s.voiceId === "alice")!;
    expect(alice).toMatchObject({ videos: 2, measured: 2 });
    expect(alice.median).toBeCloseTo(1.9, 5);
  });
  it("doesn't count results that are still moving, or a voice with one result", () => {
    // Charlie's 5× is early and Alice has one settled result: only Bella could be compared, so nothing is picked by results.
    const p = pickVoice(voices, [use("bella", 1), use("bella", 1.2), use("alice", 2), use("alice"), use("charlie", 5, false), use("charlie", 5, false)]);
    expect(p.why).toBe("trying");
  });
  it("ignores videos made in a voice that is no longer offered", () => {
    const p = pickVoice(voices.slice(0, 2), twiceEach({ bella: [1, 1], alice: [2, 2], gone: [9, 9] }));
    expect(p.voiceId).toBe("alice");
    expect(p.stats.map((s) => s.voiceId)).toEqual(["bella", "alice"]);
  });
  it("drops the caution once a voice has several results", () => {
    const p = pickVoice(voices.slice(0, 2), twiceEach({ bella: [1, 1, 1, 1, 1], alice: [2, 2, 2, 2, 2] }));
    expect(p.line).not.toContain("only a few");
  });
});
