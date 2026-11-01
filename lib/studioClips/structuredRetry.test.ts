import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: (...a: unknown[]) => create(...a) } }, modelFor: () => "claude-sonnet-5-5", effortFor: () => ({}) }));
vi.mock("@/lib/aiUsage", () => ({ recordAiUsage: () => undefined }));

import { breakDownReference, AnalysisError } from "./analysis";

const ref = { name: "r.mp4", durationSec: 6, width: 1080, height: 1920, cuts: [2, 4], frames: [{ t: 0.4, jpeg: "QUJD" }], words: null, audio: null };
const acct = { niche: null, location: null, goals: null, brand: null, ownerId: "u1" };
const answer = (text: string, stop: string) => ({ stop_reason: stop, content: [{ type: "text", text }], usage: {} });

describe("an answer cut off at the output budget", () => {
  beforeEach(() => { create.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); });

  it("is asked for again with more room, and the full answer is used", async () => {
    create.mockResolvedValueOnce(answer('{"summary":"A rev', "max_tokens")).mockResolvedValueOnce(answer('{"summary":"A reveal"}', "end_turn"));
    const out = await breakDownReference(ref, acct);
    expect(out.raw).toEqual({ summary: "A reveal" });
    expect(create.mock.calls.map((c) => (c[0] as { max_tokens: number }).max_tokens)).toEqual([6000, 15000]);
  });

  it("says so plainly when even the second try runs out", async () => {
    create.mockResolvedValue(answer('{"summary":"A rev', "max_tokens"));
    await expect(breakDownReference(ref, acct)).rejects.toThrow(/too long to finish/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry an answer that finished but can't be read", async () => {
    create.mockResolvedValue(answer("not json", "end_turn"));
    await expect(breakDownReference(ref, acct)).rejects.toBeInstanceOf(AnalysisError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
