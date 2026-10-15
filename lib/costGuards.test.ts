import { describe, it, expect } from "vitest";
import { usageProps } from "./aiUsage";
import { clip, clipList, firstTooLong, LIMITS } from "./inputLimits";
import { MAX_TRANSCRIBE_SECONDS, wavSeconds, transcriptSkippedNote } from "./transcribe/limits";

describe("AI usage records", () => {
  it("keeps the response's own numbers, and null for what it didn't report", () => {
    const res = { model: "claude-opus-5-5", usage: { input_tokens: 2400, output_tokens: 900, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 3 } } };
    expect(usageProps("competitor_research", res)).toEqual({
      feature: "competitor_research", model: "claude-opus-5-5", input_tokens: 2400, output_tokens: 900,
      cache_read_input_tokens: 0, cache_creation_input_tokens: null, web_search_requests: 3,
    });
    expect(usageProps("ask", { content: [] })).toBeNull();
    expect(usageProps("ask", null)).toBeNull();
  });
});

describe("input limits", () => {
  it("trims context and lists, and finds the first field that's too long", () => {
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip(42, 3)).toBe("");
    expect(clipList(["a", 7, "bcdef", "c"], 2, 3)).toEqual(["a", "bcd"]);
    expect(clipList("nope", 2, 3)).toEqual([]);
    expect(firstTooLong({ a: { value: "ok", max: 5, label: "A" }, b: { value: "x".repeat(6), max: 5, label: "B" } })).toEqual({ label: "B", max: 5 });
    expect(firstTooLong({ a: { value: undefined, max: 5, label: "A" } })).toBeNull();
    expect(LIMITS.question).toBeLessThan(LIMITS.historyMessage);
  });
});

describe("transcription limits", () => {
  it("reads the length of the browser's WAV and explains a skipped transcript", () => {
    expect(wavSeconds(44 + 32_000 * 60)).toBe(60);
    expect(wavSeconds(10)).toBe(0);
    expect(MAX_TRANSCRIBE_SECONDS).toBe(900);
    expect(transcriptSkippedNote("too_long", "x")).toBe("The video is longer than 15 minutes, so it wasn't transcribed");
    expect(transcriptSkippedNote("limit", "x")).toMatch(/allowance is used up/);
    expect(transcriptSkippedNote("timeout", "Transcription didn't finish")).toBe("Transcription didn't finish");
  });
});
