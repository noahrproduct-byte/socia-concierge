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

import { sanitizeArt } from "./sceneArt";
import { withPictures } from "./scenes";
import { clearest, headOf, placeClear, samplesFor } from "./placement";
import { toOutput } from "./lookAtCut";
import { countryArt } from "./countryMap";
import { picturesFrom } from "./visualsModel";

describe("picture scenes", () => {
  it("keeps a drawing made only of path data in known tones", () => {
    const art = sanitizeArt([{ kind: "draw", name: "Ware<b>house", shapes: [{ d: "M10 44 L50 22 L90 44 V88 H10 Z", fill: "accent" }, { d: "M0 0 <script>", fill: "accent" }, { d: "M1 1 L2 2", fill: "url(#x)", stroke: "none" }] }]);
    expect(art).toHaveLength(1);
    expect(art[0]).toMatchObject({ kind: "draw", name: "Warebhouse" });
    expect(art[0].kind === "draw" && art[0].shapes).toHaveLength(1);
  });
  it("finds a country by how it is said, and nothing for a place that is not one", () => {
    expect(countryArt("Egypt")?.name).toBe("Egypt");
    expect(countryArt("the US")?.name).toBe("United States");
    expect(countryArt("Narnia")).toBeNull();
    expect(countryArt("constructor")).toBeNull();
  });
  it("turns a model's answer into scenes on the words it names, dropping what cannot be drawn", () => {
    const said = [{ text: "I", key: "a@0", sec: 0 }, { text: "bought", key: "a@300", sec: 0.3 }, { text: "a", key: "a@600", sec: 0.6 }, { text: "warehouse", key: "a@900", sec: 0.9 }];
    const out = picturesFrom({ scenes: [
      { word: 4, dur: 9, headline: "Warehouse in Egypt.", art: [{ kind: "map", country: "Egypt" }, { kind: "draw", name: "warehouse", shapes: [{ d: "M10 44 L50 22 L90 44 V88 H10 Z", fill: "accent" }] }] },
      { word: 99, headline: "No such word", art: [{ kind: "map", country: "Egypt" }] },
      { word: 2, headline: "Nothing to draw", art: [{ kind: "map", country: "Narnia" }] },
    ] }, said);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "picture", key: "a@900", dur: 4, text: "Warehouse in Egypt" });
    expect(out[0].art?.map((a) => a.kind)).toEqual(["map", "draw"]);
  });
  it("survives the server's check of a cut and replaces a card that would be up with it", () => {
    const words = { talk: [100, 400, 700, 1000, 1300, 1600, 1900, 2200, 2500, 2800, 3100, 3400].map((ms, i) => ({ text: `w${i}`, startMs: ms, endMs: ms + 200, confidence: 1 })) };
    const edl = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 60 }, segments: [{ id: "s1", clipId: "talk", in: 0, out: 12, role: "opener", note: "" }], text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      scenes: [{ id: "g1", kind: "stat", key: "talk@700", dur: 2, text: "500" }] } as unknown as Edl;
    const pic = { id: "p1", kind: "picture" as const, key: "talk@1000", dur: 3, text: "Warehouse", art: sanitizeArt([{ kind: "draw", name: "w", shapes: [{ d: "M1 1 L9 9 Z", fill: "accent" }] }]) };
    const merged = withPictures(edl, [pic], words);
    expect(merged.map((s) => s.kind)).toEqual(["picture"]);
    expect(sanitizeScenes(merged, new Set(["talk"]))?.[0].art).toHaveLength(1);
    expect(sanitizeScenes([{ ...pic, art: [] }], new Set(["talk"]))).toBeUndefined();
  });
});

describe("keeping things off the face", () => {
  it("takes the top third of a person as their head and picks the place that clears it", () => {
    const head = headOf({ top: 0.15, bottom: 0.95 });
    expect(head.top).toBeCloseTo(0.14);
    expect(head.bottom).toBeCloseTo(0.42, 1);
    const cards = { top: { top: 0.12, bottom: 0.4 }, upper: { top: 0.27, bottom: 0.55 }, lower: { top: 0.5, bottom: 0.78 } };
    expect(clearest(cards, ["top", "upper", "lower"], head)).toBe("lower");
    expect(clearest(cards, ["top", "upper", "lower"], { top: 0.6, bottom: 0.8 })).toBe("top");
  });
  it("maps a band of a wide source into a tall frame's centred crop", () => {
    expect(toOutput({ top: 0.25, bottom: 0.75 }, 1080, 1920, 1080, 1920)).toEqual({ top: 0.25, bottom: 0.75 });
    const tall = toOutput({ top: 0, bottom: 0.5 }, 1080, 2400, 1080, 1920);
    expect(tall.top).toBe(0);
    expect(tall.bottom).toBeCloseTo(0.5, 1);
  });
  it("moves a card, a line and the captions when they would cross the head, and nothing when no one is seen", () => {
    const words = { talk: [1000, 1300, 1600, 1900].map((ms, i) => ({ text: `w${i}`, startMs: ms, endMs: ms + 200, confidence: 1 })) };
    const edl = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 60 }, segments: [{ id: "s1", clipId: "talk", in: 0, out: 10, role: "opener", note: "" }], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
      text: [{ id: "t1", text: "Hello there", at: 5, end: 7, slot: "top" }], scenes: [{ id: "g1", kind: "stat", key: "talk@1000", dur: 2, text: "500" }],
      style: { font: "inter", textBox: "none", accent: "#fff", captions: { preset: "pop", position: "top", size: "m", box: false, uppercase: false } } } as unknown as Edl;
    const samples = samplesFor(edl, words);
    expect(samples.length).toBeGreaterThanOrEqual(2);
    const head = { top: 0.1, bottom: 0.45 };
    const placed = placeClear(edl, samples.map((s) => ({ sec: s.sec, head })), words);
    expect(placed.edl.scenes?.[0].place).toBe("lower");
    expect((placed.edl.text[0] as { slot?: string }).slot).toBe("bottom");
    expect(placed.edl.style?.captions.position).toBe("lower");
    expect(placed.moved).toEqual({ scenes: 1, lines: 1, captions: true });
    expect(placeClear(edl, samples.map((s) => ({ sec: s.sec, head: null })), words).edl).toBe(edl);
  });
});

import { effectsFrom } from "./visualsModel";

describe("effect scenes", () => {
  const said = [{ text: "We", key: "a@0", sec: 0 }, { text: "grew", key: "a@300", sec: 0.3 }, { text: "10x", key: "a@600", sec: 0.6 }];
  it("keeps known effects on the words named and drops the rest", () => {
    const out = effectsFrom({ effects: [{ word: 3, dur: 9, fx: "graph", text: "10X" }, { word: 1, fx: "explode", text: "x" }, { word: 44, fx: "glass", text: "x" }, { word: 2, fx: "news", text: "One", lines: ["Two", "Three", "Four", "Five"] }] }, said);
    expect(out.map((s) => [s.fx, s.key, s.dur])).toEqual([["graph", "a@600", 3.5], ["news", "a@300", 2.6]]);
    expect(out[1].lines).toEqual(["Two", "Three", "Four"]);
  });
  it("survives the server's check of a cut, bounded", () => {
    const kept = sanitizeScenes([{ kind: "effect", fx: "cover", key: "a@0", dur: 30, text: "x".repeat(80), label: "Cover line", lines: ["not for a cover"] }, { kind: "effect", fx: "nope", key: "a@0", dur: 2, text: "" }, { kind: "effect", fx: "dolly", key: "a@0", dur: 2, text: "" }], new Set(["a"]))!;
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ kind: "effect", fx: "cover", dur: 5, label: "Cover line" });
    expect(kept[0].text).toHaveLength(28);
    expect(kept[0].lines).toBeUndefined();
    expect(kept[1].fx).toBe("dolly");
  });
});

import { addScene, effectAt } from "./scenes";

describe("an effect pressed at the playhead", () => {
  const say = ["We", "sold", "500", "handmade", "rugs", "this", "week", "and", "people", "loved", "them", "so", "much"];
  const words = { talk: say.map((text, i) => ({ text, startMs: 1000 + i * 400, endMs: 1300 + i * 400, confidence: 1 })) };
  const edl = { version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 1, max: 60 }, segments: [{ id: "s1", clipId: "talk", in: 0, out: 12, role: "opener", note: "" }], text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
    scenes: [{ id: "g1", kind: "stat", key: "talk@1800", dur: 2, text: "500" }] } as unknown as Edl;
  it("lands on the word being said, with its words taken from what is said there", () => {
    expect(effectAt(edl, words, "glass", 1.1)).toMatchObject({ kind: "effect", fx: "glass", key: "talk@1000", text: "handmade" });
    expect(effectAt(edl, words, "graph", 1.1)?.text).toBe("500");
    expect(effectAt(edl, words, "dolly", 99)).toMatchObject({ key: "talk@5800", text: "" });
    expect(effectAt({ ...edl, segments: [] } as Edl, words, "glass", 0)).toBeNull();
  });
  it("takes the place of whatever was on screen then, and leaves the rest", () => {
    const made = effectAt(edl, words, "cover", 1.1)!;
    const scenes = addScene(edl, words, made);
    expect(scenes.map((s) => s.kind)).toEqual(["effect"]);
    const later = addScene(edl, words, effectAt(edl, words, "frame", 5.4)!);
    expect(later.map((s) => s.kind)).toEqual(["stat", "effect"]);
  });
});

import { SPLIT_SKINS, isSplitSkin, pictureWindow } from "./splitSkins";

describe("split screen looks", () => {
  it("leaves the picture whole before a scene and puts it in the look's window when one is up", () => {
    expect(pictureWindow(SPLIT_SKINS.night, 0, 1080, 1920)).toEqual({ box: { left: 0, top: 0, width: 1080, height: 1920, borderRadius: 0 }, inner: { left: -0, top: -0 } });
    const w = pictureWindow(SPLIT_SKINS.night, 1, 1080, 1920, 0.5);
    expect(w.box).toEqual({ left: 69, top: 1405, width: 942, height: 455, borderRadius: 46 });
    // The band of the picture around its middle is what shows.
    expect(w.inner.top).toBeCloseTo(-(960 - 227.5));
    // SOCIA's own split shows the same band it always did: the picture a fifth of the frame lower.
    const own = pictureWindow(SPLIT_SKINS.socia, 1, 1080, 1920);
    expect(own.box.top + own.inner.top).toBeCloseTo(0.2 * 1920);
  });
  it("is kept on a split cut and dropped otherwise", () => {
    expect(isSplitSkin("ember")).toBe(true);
    expect(isSplitSkin("toString")).toBe(false);
  });
});

import { bareDomain } from "./brandLogo";
import { publicPage } from "./pageCapture";

describe("real marks and real pages in a picture scene", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const said = [{ text: "We", key: "a@0", sec: 0 }, { text: "use", key: "a@300", sec: 0.3 }, { text: "Notion", key: "a@600", sec: 0.6 }];
  it("takes only a plain public domain, and only a plain public https page", () => {
    expect(bareDomain("https://www.Notion.so/product")).toBe("notion.so");
    expect(bareDomain("localhost")).toBeNull();
    expect(bareDomain("10.0.0.1")).toBeNull();
    expect(bareDomain("evil.com@internal")).toBeNull();
    expect(publicPage("notion.so/pricing")).toEqual({ url: "https://notion.so/pricing", host: "notion.so" });
    expect(publicPage("https://user:pw@notion.so")).toBeNull();
    expect(publicPage("https://notion.so:8443/")).toBeNull();
    expect(publicPage("https://169.254.169.254/latest")).toBeNull();
  });
  it("puts a fetched mark in its scene and leaves out one that was not fetched", () => {
    const out = picturesFrom({ scenes: [{ word: 3, headline: "Everything in Notion", art: [{ kind: "logo", brand: "Notion", domain: "notion.so" }, { kind: "logo", brand: "Other", domain: "other.example" }] }] }, said, { "notion.so": png });
    expect(out[0].art).toEqual([{ kind: "logo", name: "Notion", src: png }]);
    expect(picturesFrom({ scenes: [{ word: 3, headline: "x", art: [{ kind: "logo", brand: "Notion", domain: "notion.so" }] }] }, said)).toEqual([]);
  });
  it("gives a photographed page the scene to itself, and keeps only image data", () => {
    const out = picturesFrom({ scenes: [{ word: 3, headline: "Notion's home page", art: [{ kind: "logo", brand: "Notion", domain: "notion.so" }, { kind: "page", url: "https://notion.so" }] }] }, said, { "notion.so": png }, { "https://notion.so/": { src: png, host: "notion.so" } });
    expect(out[0].art).toEqual([{ kind: "page", name: "notion.so", src: png }]);
    expect(sanitizeArt([{ kind: "page", name: "x", src: "https://example.com/a.png" }, { kind: "logo", name: "x", src: "data:text/html;base64,AAAA" }])).toEqual([]);
  });
});
