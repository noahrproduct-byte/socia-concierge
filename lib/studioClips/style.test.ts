import { describe, it, expect } from "vitest";
import { CAPCUT_STYLE, CAPTION_STYLES, DEFAULT_HIGHLIGHT, DEFAULT_STYLE, captionLayout, captionStyle, cleanVolume, sanitizePresets, sanitizeStyle, withCaptionStyle } from "./style";
import { revalidateEdl, validateEdl, type ClipForEdl } from "./edl";
import { aspectOf } from "./types";

const sizeOk = (w: number, h: number) => aspectOf(w, h).width === w && aspectOf(w, h).height === h;

describe("style is bounded", () => {
  it("keeps known choices and replaces anything else with the defaults", () => {
    expect(sanitizeStyle({ font: "comic", accent: "red", textBox: "neon", captions: { position: "side", size: "xl", box: "yes" } })).toEqual(DEFAULT_STYLE);
    expect(sanitizeStyle({ font: "bebas", accent: "#FF0000", textBox: "light", captions: { position: "top", size: "l", box: false, uppercase: true } })).toEqual({ font: "bebas", accent: "#ff0000", textBox: "light", captions: { position: "top", size: "l", box: false, uppercase: true, preset: "classic", highlight: DEFAULT_HIGHLIGHT } });
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
  it("places captions where chosen", () => {
    expect(captionLayout({ position: "top", size: "s" })).toEqual({ top: "12%", bottom: null, fontSize: 44 });
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

describe("caption styles", () => {
  it("reads an old style as Classic with the default highlight, and keeps a stored one", () => {
    const old = sanitizeStyle({ font: "inter", accent: "#112233", textBox: "dark", captions: { position: "top", size: "s", box: true, uppercase: true } })!;
    expect(old.captions).toMatchObject({ preset: "classic", highlight: DEFAULT_HIGHLIGHT, position: "top", uppercase: true });
    const kept = sanitizeStyle({ ...old, captions: { ...old.captions, preset: "vox", highlight: "#FFAA00" } })!;
    expect(kept.captions).toMatchObject({ preset: "vox", highlight: "#ffaa00" });
    expect(sanitizeStyle({ ...old, captions: { ...old.captions, preset: "comic", highlight: "yellow" } })!.captions).toMatchObject({ preset: "classic", highlight: DEFAULT_HIGHLIGHT });
  });
  it("applies a style's own font, case and position but keeps the colours", () => {
    const s = withCaptionStyle({ ...CAPCUT_STYLE, accent: "#ff0000", captions: { ...CAPCUT_STYLE.captions, highlight: "#00ff00" } }, "highlight");
    expect(s).toMatchObject({ font: "montserrat", accent: "#ff0000", captions: { preset: "highlight", uppercase: true, position: "middle", size: "l", highlight: "#00ff00" } });
    expect(withCaptionStyle(s, "vox").captions).toMatchObject({ preset: "vox", uppercase: false, position: "bottom" });
    for (const c of CAPTION_STYLES) expect(captionStyle(c.id).maxWords).toBeGreaterThan(0);
  });
});
