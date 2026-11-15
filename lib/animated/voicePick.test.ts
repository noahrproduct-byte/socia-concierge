import { describe, expect, it } from "vitest";
import { MIN_PER_VOICE, heardOrder, pickVoice, type VoiceUse } from "./voicePick";
import type { HeardVoices } from "@/lib/voiceRead";

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

describe("starting from the kind of voice the best Reels use", () => {
  const stock = [{ id: "bella", pitchHz: 208 }, { id: "alice", pitchHz: 190 }, { id: "charlie", pitchHz: 112 }];
  const none = { reels: 0, spoken: 0, pitchHz: null };
  const heard = (own: HeardVoices["own"], competitors: HeardVoices["competitors"]): HeardVoices => ({ own, competitors, stock });
  it("goes first with the voice closest to the competitors' voice when the account's own Reels have none", () => {
    const h = heard({ reels: 6, spoken: 0, pitchHz: null }, { reels: 6, spoken: 4, pitchHz: 118 });
    const p = pickVoice(voices, [], h);
    expect(p.why).toBe("trying");
    expect(p.voiceId).toBe("charlie");
    expect(p.line).toContain("4 of your competitors' 6 best Reels");
    expect(p.line).toContain("a lower voice");
    expect(p.line).toContain("Charlie is the closest");
    expect(p.line).toContain("picks by your own results");
    expect(heardOrder(voices, h)?.order).toEqual(["charlie", "alice", "bella"]);
  });
  it("uses the account's own voice before its competitors'", () => {
    const p = pickVoice(voices, [], heard({ reels: 8, spoken: 5, pitchHz: 200 }, { reels: 6, spoken: 4, pitchHz: 118 }));
    expect(p.voiceId).toBe("bella");
    expect(p.line).toContain("5 of the 8 Reels of yours");
    expect(p.line).toContain("a higher voice");
  });
  it("keeps turns fair after the first: the least used voice, the closest among equals", () => {
    const h = heard(none, { reels: 6, spoken: 4, pitchHz: 118 });
    expect(pickVoice(voices, [use("charlie")], h).voiceId).toBe("alice");
    expect(pickVoice(voices, [use("charlie"), use("alice")], h).voiceId).toBe("bella");
    expect(pickVoice(voices, [use("charlie"), use("alice"), use("bella")], h).voiceId).toBe("charlie");
  });
  it("lets results decide once there are enough, whatever was heard", () => {
    const p = pickVoice(voices, twiceEach({ bella: [2, 2.4], alice: [1, 1], charlie: [0.7, 0.9] }), heard(none, { reels: 6, spoken: 4, pitchHz: 118 }));
    expect(p.why).toBe("best");
    expect(p.voiceId).toBe("bella");
  });
  it("needs two speaking Reels and two measured voices before it trusts what it heard", () => {
    expect(heardOrder(voices, heard(none, { reels: 6, spoken: 1, pitchHz: 118 }))).toBeNull();
    expect(heardOrder(voices, { own: none, competitors: { reels: 6, spoken: 4, pitchHz: 118 }, stock: stock.slice(0, 1) })).toBeNull();
    expect(pickVoice(voices, [], heard(none, { reels: 6, spoken: 1, pitchHz: 118 })).voiceId).toBe("bella");
    expect(heardOrder(voices, null)).toBeNull();
  });
  it("says when few of the competitors' best Reels have anyone speaking", () => {
    const p = pickVoice(voices, [], heard(none, { reels: 6, spoken: 1, pitchHz: 118 }));
    expect(p.note).toBe("Only 1 of your competitors' 6 best Reels that SOCIA listened to has someone speaking, so a voiceover is less common in your niche.");
    expect(pickVoice(voices, [], heard(none, { reels: 6, spoken: 4, pitchHz: 118 })).note).toBeUndefined();
    expect(pickVoice(voices, [], heard(none, { reels: 2, spoken: 0, pitchHz: null })).note).toBeUndefined();
  });
});
