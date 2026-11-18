import { describe, expect, it } from "vitest";
import { cutoutSpans, findScenes, sanitizeScenes, sceneSpans, type SceneSpan } from "./scenes";
import { alphaOf } from "./matte";
import { revalidateEdl } from "./edl";
import type { ClipForEdl } from "./edl";
import type { Edl, TranscriptWord } from "./types";

// Words laid end to end from `at`, 0.3 s each with a breath after a sentence.
function say(text: string, at: number): TranscriptWord[] {
  let t = at;
  return text.split(" ").map((word) => {
    const w = { text: word, startMs: Math.round(t * 1000), endMs: Math.round((t + 0.28) * 1000), confidence: 1 };
    t += /[.!?]$/.test(word) ? 0.6 : 0.3;
    return w;
  });
}
const script = "So this is how we run the kitchen every single morning here. We sell 200 burgers a day from this one grill. People ask me about the way we do it all the time. First we smash the beef. Second we toast the buns. Third we stack it high. That is the whole method right there for you to copy at home. Nobody else does it this way. And that is really all there is to it folks. Come and see us this weekend if you are nearby okay.";
const talk = say(script, 0.2);
const dur = Math.ceil(talk[talk.length - 1].endMs / 1000) + 3;
const words = { talk };
const clips: ClipForEdl[] = [{ id: "talk", position: 0, durationSec: dur, words: talk, silences: null, medianLuma: 0.5, warmth: 0, brightness: "ok", contrastLevel: "ok", rmsDb: -20, audioLevel: "ok", hasSpeech: true }];
const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: dur + 1 },
  segments: [{ id: "s1", clipId: "talk", in: 0, out: dur, role: "opener", note: "" }],
  text: [], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
};

describe("findScenes", () => {
  const scenes = findScenes(edl, words);
  it("finds the figure, the list and the line, each from words that were said", () => {
    const stat = scenes.find((s) => s.kind === "stat");
    expect(stat?.text).toBe("200");
    expect(stat?.label).toBe("burgers a day");
    const steps = scenes.find((s) => s.kind === "steps");
    expect(steps?.items?.map((i) => i.text)).toEqual(["we smash the beef", "we toast the buns", "we stack it high"]);
    const line = scenes.find((s) => s.kind === "line");
    expect(line?.text).toBe("Nobody else does it this way");
    const said = script.replace(/[.]/g, "");
    for (const s of scenes) for (const t of [s.text, s.label ?? "", ...(s.items ?? []).map((i) => i.text)]) expect(said).toContain(t.replace(/[.%]/g, ""));
  });

  it("labels a figure with what it counts, cut where the sentence moves on", () => {
    const one = say("So here is how the shop runs on a normal day for us. We make 20 of these a day and that is it. Then we close the doors and go home to rest up.", 0.2);
    expect(findScenes(edl, { talk: one }).find((s) => s.kind === "stat")?.label).toBe("of these a day");
  });

  it("shows a change with the figure it was and the figure it became", () => {
    const one = say("So here is what happened to this video when we ran it. It went from 65 seconds to 38 with the pauses gone. That is the whole trick and it took a minute.", 0.2);
    const change = findScenes(edl, { talk: one }).find((s) => s.kind === "change");
    expect([change?.was, change?.text, change?.label]).toEqual(["65", "38", "with the pauses gone"]);
    expect(findScenes(edl, { talk: one }).some((s) => s.kind === "stat")).toBe(false);
    expect(sanitizeScenes([{ kind: "change", key: "talk@100", dur: 3, text: "38" }], new Set(["talk"]))).toBeUndefined();
  });

  it("keeps clear of the opening, the ending, the text lines and each other", () => {
    const spans = sceneSpans({ ...edl, scenes }, words);
    expect(spans.length).toBe(scenes.length);
    for (const s of spans) { expect(s.from).toBeGreaterThanOrEqual(3 * 30); expect(s.from + s.durationInFrames).toBeLessThanOrEqual(dur * 30); }
    for (let i = 1; i < spans.length; i++) expect(spans[i].from).toBeGreaterThanOrEqual(spans[i - 1].from + spans[i - 1].durationInFrames);
    // A line on the video where the figure is said takes its place.
    const statAt = talk.find((w) => w.text === "200")!.startMs / 1000;
    const under = findScenes({ ...edl, text: [{ id: "t1", at: statAt - 1, end: statAt + 2, text: "Open till 10", role: "mid" }] }, words);
    expect(under.some((s) => s.kind === "stat")).toBe(false);
  });

  it("finds nothing in a clip with no words, a year or a counted step", () => {
    expect(findScenes(edl, { talk: [] })).toEqual([]);
    const plain = say("So we opened the shop back in 2019 with my brother. It was a slow start for us that year. Step 2 was getting the word out around the city.", 0.2);
    expect(findScenes(edl, { talk: plain }).filter((s) => s.kind === "stat")).toEqual([]);
  });
});

describe("sceneSpans", () => {
  const scenes = findScenes(edl, words);
  it("moves a scene with its words through a trim and drops it when they are cut", () => {
    const stat = scenes.find((s) => s.kind === "stat")!;
    const whole = sceneSpans({ ...edl, scenes: [stat] }, words)[0];
    // Two seconds off the head: the scene comes on two seconds earlier, on the same word.
    const trimmed = sceneSpans({ ...edl, segments: [{ ...edl.segments[0], in: 2 }], scenes: [stat] }, words)[0];
    expect(whole.from - trimmed.from).toBe(60);
    // The sentence with the figure cut out: no scene.
    const statAt = talk.find((w) => w.text === "200")!.startMs / 1000;
    const cut: Edl = { ...edl, segments: [{ id: "s1", clipId: "talk", in: 0, out: statAt - 1.5, role: "opener", note: "" }, { id: "s2", clipId: "talk", in: statAt + 3, out: dur, role: "body", note: "" }], scenes: [stat] };
    expect(sceneSpans(cut, words)).toEqual([]);
  });

  it("lands each row of a list on its own line", () => {
    const steps = scenes.find((s) => s.kind === "steps")!;
    const span = sceneSpans({ ...edl, scenes: [steps] }, words)[0];
    expect(span.rows.map((r) => r.text)).toEqual(["we smash the beef", "we toast the buns", "we stack it high"]);
    expect(span.rows[0].at).toBe(0);
    expect(span.rows[1].at).toBeGreaterThan(span.rows[0].at);
    expect(span.rows[2].at).toBeGreaterThan(span.rows[1].at);
    expect(span.durationInFrames).toBeGreaterThan(span.rows[2].at + 30);
  });
});

describe("saving", () => {
  it("keeps bounded scenes through revalidation and drops what is not one", () => {
    const scenes = findScenes(edl, words);
    const kept = revalidateEdl({ ...edl, scenes }, clips).edl.scenes;
    expect(kept?.map((s) => [s.kind, s.key, s.text])).toEqual(scenes.map((s) => [s.kind, s.key, s.text]));
    const ids = new Set(["talk"]);
    expect(sanitizeScenes([{ kind: "stat", key: "other@100", dur: 2, text: "9" }, { kind: "wipe", key: "talk@100", dur: 2, text: "x" }, { kind: "line", key: "talk@100", dur: 2, text: "" }, { kind: "steps", key: "talk@100", dur: 4, text: "", items: [{ key: "talk@100", text: "one row" }] }], ids)).toBeUndefined();
    const long = sanitizeScenes([{ kind: "line", key: "talk@100", dur: 999, text: "x".repeat(200) }], ids)!;
    expect(long[0].dur).toBeLessThanOrEqual(14);
    expect(long[0].text.length).toBe(60);
    expect(revalidateEdl(edl, clips).edl.scenes).toBeUndefined();
  });
});

describe("behind the person", () => {
  const span = (from: number, frames: number): SceneSpan => ({ scene: { id: "g1", kind: "stat", key: "talk@0", dur: frames / 30, text: "9" }, from, durationInFrames: frames, rows: [] });
  it("covers the part of each cut a scene runs over, and skips a cut whose speed was changed", () => {
    const cuts = [{ startFrame: 0, durationFrames: 100 }, { startFrame: 100, durationFrames: 50, motion: { speed: { rate: 2 } } }, { startFrame: 150, durationFrames: 90 }];
    expect(cutoutSpans([span(80, 100)], cuts)).toEqual([
      { id: "g1-0", seg: 0, from: 80, frames: 20, offset: 80 },
      { id: "g1-2", seg: 2, from: 150, frames: 30, offset: 0 },
    ]);
    // A sliver of two frames is not worth a second decode.
    expect(cutoutSpans([span(98, 30)], [{ startFrame: 0, durationFrames: 100 }])).toEqual([]);
  });

  it("is kept through a save only with scenes, and the edge of the mask is soft", () => {
    const scenes = findScenes(edl, words);
    expect(revalidateEdl({ ...edl, scenes, scenesBehind: true }, clips).edl.scenesBehind).toBe(true);
    expect(revalidateEdl({ ...edl, scenesBehind: true }, clips).edl.scenesBehind).toBeUndefined();
    expect(alphaOf(0.1)).toBe(0);
    expect(alphaOf(0.95)).toBe(255);
    expect(alphaOf(0.525)).toBeGreaterThan(100);
    expect(alphaOf(0.525)).toBeLessThan(160);
  });
});

import { iconFor, isSceneIcon } from "./sceneIcons";
import { sanitizeLogo, LOGO_MAX_CHARS } from "./types";

describe("scene icons", () => {
  it("picks the icon the card's own words call for, or none", () => {
    expect(iconFor("$1,500 saved")).toBe("money");
    expect(iconFor("40% more orders")).toBe("percent");
    expect(iconFor("200 burgers a day")).toBe("food");
    expect(iconFor("38 seconds")).toBe("time");
    expect(iconFor("12 widgets")).toBeUndefined();
  });
  it("keeps a known icon on a card and drops anything else", () => {
    const base = { id: "g1", kind: "stat", key: "a@0", dur: 2, text: "200", label: "burgers" };
    expect(sanitizeScenes([{ ...base, icon: "food" }], new Set(["a"]))?.[0].icon).toBe("food");
    expect(sanitizeScenes([{ ...base, icon: "rocket" }], new Set(["a"]))?.[0].icon).toBeUndefined();
    expect(isSceneIcon("constructor")).toBe(false);
  });
});

describe("the cut's logo", () => {
  const src = "data:image/png;base64,iVBORw0KGgo=";
  it("keeps a small image with where it shows", () => {
    expect(sanitizeLogo({ src, corner: true, ending: true, name: "  Osh   Grill " })).toEqual({ src, name: "Osh Grill", corner: true, ending: true });
  });
  it("drops what is not an image, is too large, or shows nowhere", () => {
    expect(sanitizeLogo({ src: "https://example.com/logo.png", corner: true })).toBeUndefined();
    expect(sanitizeLogo({ src: "data:text/html;base64,AAAA", corner: true })).toBeUndefined();
    expect(sanitizeLogo({ src: `data:image/png;base64,${"A".repeat(LOGO_MAX_CHARS)}`, corner: true })).toBeUndefined();
    expect(sanitizeLogo({ src })).toBeUndefined();
  });
});
