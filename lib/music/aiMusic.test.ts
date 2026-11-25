import { describe, expect, it } from "vitest";
import { aiMusicName, aiMusicSeconds, cleanMood, energyWords, musicPrompt, AI_MUSIC_MAX_SEC, AI_MUSIC_MIN_SEC } from "./aiMusic";
import { actionCredits } from "@/lib/credits/config";
import { musicMicros } from "@/lib/aiSpend";

const ref = { bpm: 124, drops: [3.2, 9], speechShare: 0, musicLikely: true };

describe("AI music", () => {
  it("is made a second longer than the video, between 10 and 60 seconds", () => {
    expect(aiMusicSeconds(15)).toBe(16);
    expect(aiMusicSeconds(3)).toBe(AI_MUSIC_MIN_SEC);
    expect(aiMusicSeconds(240)).toBe(AI_MUSIC_MAX_SEC);
    expect(aiMusicSeconds(NaN)).toBe(AI_MUSIC_MIN_SEC);
  });

  it("describes the reference's music by its measured tempo and lifts, always instrumental", () => {
    const p = musicPrompt({ reference: ref, seconds: 16 });
    expect(p).toContain("About 124 BPM, upbeat and energetic");
    expect(p).toContain("The energy lifts at 0:03 and 0:09.");
    expect(p).toContain("No vocals.");
    expect(p).not.toMatch(/\u2014/);
  });

  it("leaves out lifts past the end and reference numbers when there was no music", () => {
    expect(musicPrompt({ reference: { ...ref, drops: [30] }, seconds: 16 })).not.toContain("lifts at");
    const none = musicPrompt({ reference: { ...ref, musicLikely: false }, seconds: 16 });
    expect(none).not.toContain("BPM");
    expect(none).toContain("Steady and warm");
  });

  it("puts the person's mood first and leaves room for talking", () => {
    const p = musicPrompt({ reference: { ...ref, speechShare: 0.6 }, mood: "warm acoustic \u2014 cafe morning", seconds: 30 });
    expect(p).toContain("Mood and style: warm acoustic, cafe morning.");
    expect(p).toContain("Leave room for someone talking");
  });

  it("cleans the mood words", () => {
    expect(cleanMood("  a\n\nb  ")).toBe("a b");
    expect(cleanMood(42)).toBe("");
    expect(cleanMood("x".repeat(500))).toHaveLength(160);
  });

  it("names the sound after the mood or the tempo", () => {
    expect(aiMusicName({ mood: "Warm acoustic, cafe" })).toBe("AI music: Warm acoustic");
    expect(aiMusicName({ bpm: 120 })).toBe("AI music: 120 BPM");
    expect(aiMusicName({})).toBe("AI music: Background");
  });

  it("reads energy from tempo and lifts", () => {
    expect(energyWords({ bpm: 80, drops: [], speechShare: 0 })).toBe("calm and relaxed");
    expect(energyWords({ bpm: 100, drops: [1, 5], speechShare: 0 })).toBe("upbeat and energetic");
    expect(energyWords(null)).toBe("steady and warm");
  });

  it("is priced at the longest music's cost plus the margin, never below cost", () => {
    const costUsd = musicMicros(AI_MUSIC_MAX_SEC) / 1_000_000;
    expect(actionCredits("music_tracks") * 0.01).toBeGreaterThanOrEqual(costUsd * 1.5 - 1e-9);
  });
});
