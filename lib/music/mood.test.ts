import { describe, expect, it } from "vitest";
import { moodLine } from "./server";
import type { Edl } from "@/lib/studioClips/types";

const base = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 10 }, segments: [], text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [] } as unknown as Edl;

describe("moodLine", () => {
  it("names the theme's music mood for the playlist writer, nothing without one", () => {
    expect(moodLine(base)).toBe("");
    expect(moodLine({ ...base, theme: { id: "cinematic" } })).toContain("cinematic and slow");
    expect(moodLine({ ...base, theme: { id: "talking-head" } })).toContain("lo-fi");
    expect(moodLine({ ...base, theme: { id: "clean-minimal" } })).toBe("");
  });
});
