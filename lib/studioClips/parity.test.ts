// Preview and export must be one and the same video. Both run the same
// composition (components/studio/remotion/ClipComposition.tsx) from the same
// EDL; what could still differ is the plan they are given. This check builds
// the plan the Player gets and the plan the export gets for one fixture cut
// (with a theme, a speed ramp, punches, B-roll, captions and text) and
// compares, frame by frame, which cut is on screen, the time inside the
// clip, the transform, the look effects, the caption page and the text lines.
import { describe, expect, it } from "vitest";
import { applyTheme } from "./themes/apply";
import { themeById } from "./themes";
import { timeline, captionPages, clearOfText, secToFrames } from "./timeline";
import { clipSecAt, motionAt, transformCss } from "./motion";
import { lookPlan } from "./look";
import { exportProps, previewProps } from "./renderProps";
import type { BuildSource, Edl, TranscriptWord } from "./types";

const w = (text: string, s: number, e: number): TranscriptWord => ({ text, startMs: Math.round(s * 1000), endMs: Math.round(e * 1000), confidence: 1 });
const words = [w("We", 0.2, 0.4), w("sell", 0.4, 0.7), w("two", 0.8, 1.0), w("hundred", 1.0, 1.4), w("a", 1.4, 1.5), w("day.", 1.5, 1.9), w("Come", 2.4, 2.6), w("early.", 2.6, 3.1)];
const sources: Record<string, BuildSource> = {
  c1: { clipId: "c1", position: 0, name: "talk.mp4", url: "https://x/talk.mp4", thumb: null, durationSec: 8, width: 1080, height: 1920, words, moments: [] },
  c2: { clipId: "c2", position: 1, name: "b.mp4", url: "https://x/b.mp4", thumb: null, durationSec: 10, width: 1920, height: 1080, words: null, moments: [] },
};
const base: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 15 },
  segments: [{ id: "s1", clipId: "c1", in: 0, out: 3.5, role: "opener", note: "" }, { id: "s2", clipId: "c2", in: 1, out: 4, role: "body", note: "", motion: { speed: { rate: 0.5, rampSec: 0.3 }, locked: true } }, { id: "s3", clipId: "c1", in: 4, out: 6.5, role: "ending", note: "" }],
  text: [{ id: "t1", at: 0, end: 2, text: "two hundred a day", role: "opening", presetId: "hook_title" }], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [], emphasis: ["hundred"],
  broll: [{ id: "b1", clipId: "c2", in: 5, out: 6.5, at: 1.2 }],
};
const themed = applyTheme(base, themeById("bold-hook")!, { words: { c1: words, c2: null } });

/** What is on screen at an output frame, from a composition's props. */
function plan(props: ReturnType<typeof exportProps>, frame: number) {
  const tl = timeline(props.edl);
  const seg = tl.segments.filter((s) => frame >= s.startFrame && frame < s.startFrame + s.durationFrames);
  const shots = seg.map((s, i) => {
    const local = frame - s.startFrame;
    const clipSec = clipSecAt(s, local);
    return { id: s.id, clipSec: Math.round(clipSec * 1000), transform: transformCss(motionAt(s.motion, local, s.durationFrames, clipSec, i)).transform ?? "", look: lookPlan(props.edl.theme ? themeById(props.edl.theme.id)!.color.grade : null, frame, props.edl.width) };
  });
  const pages = clearOfText(captionPages(props.edl, Object.fromEntries(Object.values(props.sources).map((s) => [s.clipId, s.words])), 30, 900, 3), props.edl, 30, Infinity);
  const page = pages.find((p) => frame >= p.from && frame < p.from + p.durationInFrames)?.page.text ?? null;
  const text = props.edl.text.filter((t) => frame >= secToFrames(t.at) && frame < secToFrames(t.end)).map((t) => `${t.presetId}:${t.text}`);
  const broll = (props.edl.broll ?? []).filter((b) => frame >= secToFrames(b.at) && frame < secToFrames(b.at) + secToFrames(b.out - b.in)).map((b) => b.id);
  return { shots, page, text, broll, captionsOn: props.captionsOn };
}

describe("preview and export parity", () => {
  it("the export is given the same cut, sources and captions as the preview", () => {
    const p = previewProps({ edl: themed, sources, musicUrl: null, voiceUrls: {}, cleanAudio: {}, finishOn: true, guide: true, watermarkUrl: null });
    const x = exportProps({ edl: themed, sources, musicUrl: null, voiceUrls: {}, cleanAudio: {}, watermarkUrl: null });
    expect(x.edl).toBe(p.edl);
    expect(x.captionsOn).toBe(p.captionsOn);
    // Preview-only aids never reach the file.
    expect("safeZoneGuide" in x).toBe(false);
    expect("finishOn" in x).toBe(false);
  });
  it("every frame shows the same cut, clip time, transform, look, caption page, text and B-roll in both", () => {
    const p = previewProps({ edl: themed, sources, musicUrl: null, voiceUrls: {}, cleanAudio: {}, finishOn: true, guide: true, watermarkUrl: null });
    const x = exportProps({ edl: themed, sources, musicUrl: null, voiceUrls: {}, cleanAudio: {}, watermarkUrl: null });
    const tl = timeline(p.edl);
    expect(timeline(x.edl).durationFrames).toBe(tl.durationFrames);
    let pages = 0, sped = 0;
    for (let f = 0; f < tl.durationFrames; f++) {
      const a = plan(p, f), b = plan(x, f);
      expect(b).toEqual(a);
      if (a.page) pages++;
      if (a.shots.some((s) => s.id === "s2")) sped++;
    }
    // The fixture really exercised captions and the slowed cut.
    expect(pages).toBeGreaterThan(10);
    expect(sped).toBeGreaterThan(secToFrames(3) * 1.5);
  });
  it("the timing of a slowed cut is the same function in both: clip time never runs backwards and ends at the out point", () => {
    const tl = timeline(themed);
    const s = tl.segments.find((x) => x.id === "s2")!;
    let last = -1;
    for (let f = 0; f < s.durationFrames; f++) { const t = clipSecAt(s, f); expect(t).toBeGreaterThanOrEqual(last); last = t; }
    expect(clipSecAt(s, s.durationFrames)).toBe(s.out);
  });
});
