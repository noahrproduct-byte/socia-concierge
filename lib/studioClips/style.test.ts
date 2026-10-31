import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, captionLayout, cleanVolume, sanitizePresets, sanitizeStyle, textColors } from "./style";
import { revalidateEdl, validateEdl, type ClipForEdl } from "./edl";
import { aspectOf } from "./types";

const sizeOk = (w: number, h: number) => aspectOf(w, h).width === w && aspectOf(w, h).height === h;

describe("style is bounded", () => {
  it("keeps known choices and replaces anything else with the defaults", () => {
    expect(sanitizeStyle({ font: "comic", accent: "red", textBox: "neon", captions: { position: "side", size: "xl", box: "yes" } })).toEqual(DEFAULT_STYLE);
    expect(sanitizeStyle({ font: "bebas", accent: "#FF0000", textBox: "light", captions: { position: "top", size: "l", box: false, uppercase: true } })).toEqual({ font: "bebas", accent: "#ff0000", textBox: "light", captions: { position: "top", size: "l", box: false, uppercase: true } });
    expect(sanitizeStyle(null)).toBeUndefined();
  });

  it("bounds a clip's volume and drops the default", () => {
    expect(cleanVolume(5)).toBe(2);
    expect(cleanVolume(-1)).toBe(0);
    expect(cleanVolume(1)).toBeUndefined();
    expect(cleanVolume("loud")).toBeUndefined();
  });

  it("keeps only valid templates, at most six, and only editor sizes", () => {
    const tpl = (i: number, w = 1080, h = 1920) => ({ id: `tplabc${i}`, name: `T${i} — x`, style: DEFAULT_STYLE, width: w, height: h });
    const p = sanitizePresets({ brand: { style: DEFAULT_STYLE, width: 1080, height: 1080 }, templates: [tpl(1), tpl(2, 640, 480), { id: "bad id", name: "x", style: DEFAULT_STYLE, width: 1080, height: 1920 }, ...[3, 4, 5, 6, 7, 8].map((i) => tpl(i))] }, sizeOk);
    expect(p.brand).toMatchObject({ width: 1080, height: 1080 });
    expect(p.templates.map((t) => t.id)).toEqual(["tplabc1", "tplabc3", "tplabc4", "tplabc5", "tplabc6", "tplabc7"]);
    expect(p.templates[0].name).toBe("T1 , x");
  });
});

describe("what the style draws", () => {
  it("always puts the call to action on the brand colour", () => {
    expect(textColors({ ...DEFAULT_STYLE, accent: "#112233", textBox: "light" }, "cta").bg).toBe("#112233");
    expect(textColors({ ...DEFAULT_STYLE, textBox: "light" }, "mid")).toMatchObject({ fg: "#111111" });
    expect(textColors({ ...DEFAULT_STYLE, textBox: "none" }, "opening").bg).toBeNull();
  });
  it("places captions where chosen", () => {
    expect(captionLayout({ position: "top", size: "s", box: true, uppercase: false })).toEqual({ top: "12%", bottom: null, fontSize: 44 });
    expect(captionLayout(DEFAULT_STYLE.captions)).toEqual({ top: null, bottom: "27%", fontSize: 54 });
  });
});

describe("style and volume survive a save", () => {
  const clips = [{ id: "c1", position: 0, durationSec: 10, words: null, pauses: [] } as unknown as ClipForEdl];
  it("carries them through validation", () => {
    const first = validateEdl({ style: { ...DEFAULT_STYLE, font: "poppins" }, segments: [{ clipId: "c1", in: 0, out: 5, volume: 0 }] }, clips).edl;
    const again = revalidateEdl(first, clips).edl;
    expect(again.style?.font).toBe("poppins");
    expect(again.segments[0].volume).toBe(0);
    expect(validateEdl({ segments: [{ clipId: "c1", in: 0, out: 5 }] }, clips).edl.style).toBeUndefined();
  });
});
