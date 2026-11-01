import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: (...a: unknown[]) => create(...a) } }, modelFor: () => "claude-sonnet-5-5", effortFor: () => ({}) }));
vi.mock("@/lib/aiUsage", () => ({ recordAiUsage: () => undefined }));

import { breakDownReference, AnalysisError } from "./analysis";

const ref = { name: "r.mp4", durationSec: 6, width: 1080, height: 1920, cuts: [2, 4], frames: [{ t: 0.4, jpeg: "QUJD" }], words: null, audio: null };
const acct = { niche: null, location: null, goals: null, brand: null, ownerId: "u1" };
const answer = (text: string, stop: string) => ({ stop_reason: stop, content: [{ type: "text", text }], usage: {} });

describe("the reference breakdown", () => {
  beforeEach(() => { create.mockReset(); vi.spyOn(console, "error").mockImplementation(() => undefined); });

  it("has room to think and answer (6,000 tokens)", async () => {
    create.mockResolvedValueOnce(answer('{"summary":"A reveal"}', "end_turn"));
    expect((await breakDownReference(ref, acct)).raw).toEqual({ summary: "A reveal" });
    expect((create.mock.calls[0][0] as { max_tokens: number }).max_tokens).toBe(6000);
  });

  it("says plainly when the answer was still cut off", async () => {
    create.mockResolvedValue(answer('{"summary":"A rev', "max_tokens"));
    await expect(breakDownReference(ref, acct)).rejects.toThrow(/too long to finish/);
  });

  it("says plainly when a finished answer can't be read", async () => {
    create.mockResolvedValue(answer("not json", "end_turn"));
    await expect(breakDownReference(ref, acct)).rejects.toThrow(/came back incomplete/);
    await expect(breakDownReference(ref, acct)).rejects.toBeInstanceOf(AnalysisError);
  });
});
