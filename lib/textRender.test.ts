import { describe, expect, it } from "vitest";
import { ASPECTS } from "./studioClips/types";
import { fitMessage, isRtl, layoutTextLayer, normalizeText, wrapParagraph, type Measure } from "./textRender";
import { TEXT_PRESETS, TEXT_PRESET_IDS, charCount, clampChars, clampWords, fitLine, defaultTiming, frameScale, presetForRole, presetForLine, presetInStyle, asStepLabel, becomesStepLabel, presetOf, safeZoneFor, type TextPresetId, type TextSlot, presetInFont } from "./textPresets";
import { CAPCUT_FONTS } from "./studioClips/style";

/** A fake canvas: every character is 0.55 em wide (emoji 1 em), whatever the face. */
const measure: Measure = (text, font) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return Array.from(text).reduce((a, ch) => a + (/\p{Extended_Pictographic}/u.test(ch) ? px : px * 0.55), 0);
};

const inside = (box: { x: number; y: number; width: number; height: number }, zone: { x: number; y: number; width: number; height: number }) =>
  box.x >= zone.x && box.y >= zone.y && box.x + box.width <= zone.x + zone.width + 0.01 && box.y + box.height <= zone.y + zone.height + 0.01;

const lay = (presetId: TextPresetId, text: string, w = 1080, h = 1920, slot?: TextSlot) => layoutTextLayer({ preset: TEXT_PRESETS[presetId], text, slot, width: w, height: h, measure });

describe("the safe zone", () => {
  it("is the brief's zone at the reference size", () => {
    expect(safeZoneFor(1080, 1920)).toEqual({ x: 60, y: 250, width: 880, height: 1190 });
  });
  it("scales with the frame", () => {
    expect(safeZoneFor(1080, 1080)).toEqual({ x: 60, y: 141, width: 880, height: 669 });
    expect(safeZoneFor(540, 960)).toEqual({ x: 30, y: 125, width: 440, height: 595 });
    expect(frameScale(1080, 1920)).toBe(1);
    expect(frameScale(1920, 1080)).toBe(1);
    expect(frameScale(540, 960)).toBe(0.5);
  });
});

describe("the CapCut look (Noah, 2026-11-06)", () => {
  it("has no web-app fonts, full-width bars, coloured buttons or accent stripes", () => {
    for (const id of TEXT_PRESET_IDS) {
      const p = TEXT_PRESETS[id];
      expect(p.font.family).not.toBe("inter");
      expect(p.box.fullWidth).toBeFalsy();
      expect(p.box.accentBar).toBeUndefined();
      if (p.box.kind === "fill") expect(["#000000", "#ffffff"]).toContain(p.box.fill);
    }
  });
  it("draws every line in the video's font; a font that was dropped falls back to the preset's", () => {
    expect(presetInFont(TEXT_PRESETS.hook_title, "tiktok").font).toEqual({ family: "tiktok", weight: 800 });
    expect(presetInFont(TEXT_PRESETS.subtitle, "bebas").font).toEqual({ family: "bebas", weight: 400 });
    expect(presetInFont(TEXT_PRESETS.subtitle, "inter").font.family).toBe("montserrat");
    expect(presetInFont(TEXT_PRESETS.subtitle, "playfair").font.family).toBe("montserrat");
    expect(presetInFont(TEXT_PRESETS.subtitle).font.family).toBe("montserrat");
  });
  it("only offers the bold fonts", () => {
    expect(CAPCUT_FONTS.map((f) => f.id)).toEqual(["montserrat", "tiktok", "anton", "poppins", "bebas"]);
  });
});

describe("presets", () => {
  it("are the six from the brief plus Hook Pair and Step Label, each with a size range, limits and a default time", () => {
    expect(TEXT_PRESET_IDS).toEqual(["hook_pair", "step_label", "hook_title", "caption_bar", "callout_box", "lower_third", "big_stat", "subtitle"]);
    for (const id of TEXT_PRESET_IDS) {
      const p = TEXT_PRESETS[id];
      expect(p.size.min).toBeLessThanOrEqual(p.size.max);
      expect(p.maxLines).toBeGreaterThan(0);
      expect(p.maxChars).toBeGreaterThan(0);
      expect(p.time.end).toBeGreaterThan(p.time.start);
      expect(["fade", "pop"]).toContain(p.animation);
    }
    expect(TEXT_PRESETS.hook_title.slot).toBe("top");
    expect(TEXT_PRESETS.caption_bar.slot).toBe("bottom");
    expect(TEXT_PRESETS.callout_box.slot).toBe("bottom");
    expect(TEXT_PRESETS.lower_third.align).toBe("left");
  });
  it("map old roles to the closest look", () => {
    expect(presetForRole("opening").id).toBe("hook_title");
    expect(presetForRole("cta").id).toBe("callout_box");
    expect(presetForRole("mid").id).toBe("caption_bar");
    expect(presetOf({ presetId: "big_stat", role: "mid" }).id).toBe("big_stat");
    expect(presetOf({ presetId: "nope", role: "cta" }).id).toBe("callout_box");
    expect(presetOf({}).id).toBe("caption_bar");
  });
  it("set an opening written as two lines as a Hook Pair, and keep old cuts on their look (2026-11-11 study)", () => {
    expect(presetForLine("opening", "straight from\nTHE DECK").id).toBe("hook_pair");
    expect(presetForLine("opening", "Fresh out of the oven").id).toBe("hook_title");
    expect(presetForLine("mid", "the first\ncut").id).toBe("caption_bar");
    expect(presetForRole("opening").id).toBe("hook_title");
  });
  it("draw outlined looks with the clean shadow unless the video is set to the outline, and the other way round", () => {
    expect(presetInStyle(TEXT_PRESETS.hook_title, "montserrat", "none").box.kind).toBe("shadow");
    expect(presetInStyle(TEXT_PRESETS.hook_title, "montserrat", "outline").box.kind).toBe("outline");
    expect(presetInStyle(TEXT_PRESETS.hook_pair, "montserrat", "outline").box.kind).toBe("outline");
    expect(presetInStyle(TEXT_PRESETS.hook_pair, "montserrat", "none").box.kind).toBe("shadow");
    // Labels and tags keep their own boxes.
    expect(presetInStyle(TEXT_PRESETS.callout_box, "montserrat", "none").box.kind).toBe("fill");
    // The serif is never a whole video's font.
    expect(presetInStyle(TEXT_PRESETS.caption_bar, "serif", "none").font.family).toBe("montserrat");
  });
  it("count characters as people do and clamp at one", () => {
    expect(charCount("héllo 🔥")).toBe(7);
    expect(clampChars("abcdef", 3)).toBe("abc");
    expect(clampChars("ab 🔥🔥", 4)).toBe("ab 🔥");
  });
  it("shorten a line at a whole word and never leave it hanging (Noah's pizza cut, 2026-11-11)", () => {
    // Cut at a character, this came out as "when the pizza comes out looking like th".
    expect(clampWords("when the pizza comes out looking like this 🔥", 40)).toBe("when the pizza comes out looking");
    expect(clampWords("Fresh out of the oven", 40)).toBe("Fresh out of the oven");
    expect(clampWords("Supercalifragilistic", 5)).toBe("Super");
    expect(clampWords("Open late, every night of the week", 12)).toBe("Open late");
  });
  it("move a line too long for its look to the roomier Caption in the same place, shortening only past that", () => {
    const hook = fitLine("when the pizza comes out looking like this 🔥", TEXT_PRESETS.hook_title);
    expect([hook.preset.id, hook.slot, hook.text, hook.shortened]).toEqual(["caption_bar", "top", "when the pizza comes out looking like this 🔥", false]);
    expect(fitLine("Fresh out of the oven", TEXT_PRESETS.hook_title)).toEqual({ text: "Fresh out of the oven", preset: TEXT_PRESETS.hook_title, shortened: false });
    const long = fitLine("word ".repeat(30), TEXT_PRESETS.hook_title);
    expect(long.shortened).toBe(true);
    expect(charCount(long.text)).toBeLessThanOrEqual(TEXT_PRESETS.caption_bar.maxChars);
    expect(long.text.endsWith("word")).toBe(true);
  });
  it("default timing fits the video", () => {
    expect(defaultTiming(TEXT_PRESETS.hook_title, 20)).toEqual({ at: 0, end: 3 });
    expect(defaultTiming(TEXT_PRESETS.caption_bar, 2)).toEqual({ at: 0, end: 2 });
    expect(defaultTiming(TEXT_PRESETS.callout_box, 20, 7.25)).toEqual({ at: 7.25, end: 10.25 });
    expect(defaultTiming(TEXT_PRESETS.callout_box, 8, 7.9)).toEqual({ at: 7.5, end: 8 });
  });
});

describe("Step Label (2026-11-11 food study)", () => {
  it("is small, in the middle, and keeps its lighter weight in the video's font", () => {
    const l = lay("step_label", "green onions");
    expect(l.fits).toBe(true);
    expect(l.lines[0].fontSize).toBeLessThanOrEqual(58);
    expect(TEXT_PRESETS.step_label.slot).toBe("middle");
    expect(presetInStyle(TEXT_PRESETS.step_label, "montserrat", "none").font.weight).toBe(600);
    expect(presetInStyle(TEXT_PRESETS.step_label, "anton", "none").font.weight).toBe(400);
    expect(presetInStyle(TEXT_PRESETS.hook_title, "tiktok", "none").font.weight).toBe(800);
  });
  it("turns a hook into one lowercase line, shortened only at a whole word", () => {
    expect(asStepLabel("tossed in\nTHE PAN")).toEqual({ text: "tossed in the pan", shortened: false });
    expect(asStepLabel("Salvo's margherita")).toEqual({ text: "Salvo's margherita", shortened: false });
    const long = asStepLabel("the slowest most careful hand stretched dough in the whole city");
    expect(long.shortened).toBe(true);
    expect(charCount(long.text)).toBeLessThanOrEqual(TEXT_PRESETS.step_label.maxChars);
    expect(becomesStepLabel("hook_pair")).toBe(true);
    expect(becomesStepLabel("callout_box")).toBe(false);
  });
});

describe("Hook Pair", () => {
  it("sets the first line small in the italic serif and the rest big in the heavy sans", () => {
    const l = lay("hook_pair", "straight from\nTHE DECK");
    expect(l.fits).toBe(true);
    expect(l.lead).toBe(true);
    expect(l.lines.map((x) => x.text)).toEqual(["straight from", "THE DECK"]);
    expect(l.lines[0].font).toMatch(/^italic 400 .*Instrument Serif/);
    expect(l.lines[1].fontSize).toBeGreaterThan(l.lines[0].fontSize);
  });
  it("sets a single line big, never as a lone small line", () => {
    const l = lay("hook_pair", "THE DECK");
    expect(l.fits).toBe(true);
    expect(l.lead).toBe(false);
    expect(l.lines[0].font).not.toMatch(/italic/);
  });
});

describe("wrapping", () => {
  it("keeps explicit line breaks and collapses other whitespace", () => {
    expect(normalizeText("  a   b \n\n c  ")).toEqual(["a b", "", "c"]);
    expect(normalizeText("\n\n")).toEqual([]);
  });
  it("wraps at words and never past the width", () => {
    const font = "700 40px Inter";
    const lines = wrapParagraph("we start the dough at five every morning", 300, font, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(300);
    expect(lines.map((l) => l.text).join(" ")).toBe("we start the dough at five every morning");
  });
  it("breaks a word wider than the line at characters", () => {
    const lines = wrapParagraph("supercalifragilistic", 100, "700 40px Inter", measure);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(100);
    expect(lines.map((l) => l.text).join("")).toBe("supercalifragilistic");
  });
});

describe("layout inside the safe zone", () => {
  const SIZES = ASPECTS.map((a) => [a.width, a.height] as const);
  it("puts every preset's sample inside the zone on every aspect, in every slot", () => {
    for (const [w, h] of SIZES) {
      const zone = safeZoneFor(w, h);
      for (const id of TEXT_PRESET_IDS) {
        for (const slot of ["top", "middle", "bottom"] as const) {
          const l = lay(id, TEXT_PRESETS[id].sample, w, h, slot);
          expect(l.fits, `${id} ${w}x${h} ${slot}`).toBe(true);
          expect(inside(l.box, zone), `${id} ${w}x${h} ${slot}`).toBe(true);
          for (const line of l.lines) expect(line.width).toBeLessThanOrEqual(l.box.width);
        }
      }
    }
  });
  it("holds the longest allowed line of each preset at its smallest size", () => {
    for (const [w, h] of SIZES) {
      for (const id of TEXT_PRESET_IDS) {
        const p = TEXT_PRESETS[id];
        const words = p.lead ? `12\n${"word ".repeat(Math.min(10, Math.floor((p.maxChars - 3) / 5))).trim()}` : "word ".repeat(Math.ceil(p.maxChars / 5)).trim().slice(0, p.maxChars).trim();
        const l = lay(id, words, w, h);
        expect(l.fits, `${id} ${w}x${h}: ${l.reason}`).toBe(true);
        expect(inside(l.box, safeZoneFor(w, h))).toBe(true);
      }
    }
  });
  it("uses the largest size that fits and shrinks for longer lines", () => {
    const short = lay("hook_title", "Wait");
    const long = lay("hook_title", "Supercalifragilistic");
    expect(short.fontSize).toBe(84);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.fontSize).toBeGreaterThanOrEqual(56);
  });
  it("says no when a line can't fit even at the smallest size", () => {
    const l = lay("hook_title", "x".repeat(200));
    expect(l.fits).toBe(false);
    expect(l.reason).toBe("too_long");
    expect(fitMessage(TEXT_PRESETS.hook_title, l)).toMatch(/Too long for Hook Title/);
    expect(fitMessage(TEXT_PRESETS.hook_title, lay("hook_title", "fine"))).toBeNull();
    expect(lay("hook_title", "   ").reason).toBe("empty");
  });
  it("slots are top, middle and bottom of the zone", () => {
    const zone = safeZoneFor(1080, 1920);
    const top = lay("callout_box", "Hi", 1080, 1920, "top"), mid = lay("callout_box", "Hi", 1080, 1920, "middle"), bot = lay("callout_box", "Hi", 1080, 1920, "bottom");
    expect(top.box.y).toBe(zone.y);
    expect(bot.box.y + bot.box.height).toBe(zone.y + zone.height);
    expect(mid.box.y).toBeGreaterThan(top.box.y);
    expect(mid.box.y).toBeLessThan(bot.box.y);
  });
  it("text hugs its words, with no bar across the frame; a tag sits at the left", () => {
    const line = lay("caption_bar", "Open at 7");
    expect(line.box.width).toBeLessThan(880);
    const label = lay("lower_third", "Downtown");
    expect(label.box.x).toBe(60);
    expect(label.box.width).toBeLessThan(880);
    expect(label.lines[0].text).toBe("Downtown");
  });
  it("big stat: the number leads, the subline follows", () => {
    const l = lay("big_stat", "200+\nburgers every Friday");
    expect(l.fits).toBe(true);
    expect(l.lines[0].text).toBe("200+");
    expect(l.lines[0].fontSize).toBeGreaterThan(l.lines[1].fontSize);
    expect(lay("big_stat", "1,000,000,000,000,000,000,000").fits).toBe(false);
  });
  it("emoji and Arabic lay out like any other text", () => {
    const e = lay("subtitle", "so good 🔥🔥🔥 come see");
    expect(e.fits).toBe(true);
    const ar = lay("caption_bar", "نفتح كل يوم من السابعة صباحا");
    expect(ar.fits).toBe(true);
    expect(ar.rtl).toBe(true);
    expect(isRtl("hello")).toBe(false);
  });
  it("lays out the same way relative to the frame at any resolution", () => {
    const a = lay("callout_box", "Only 20 made a day", 1080, 1920);
    const b = lay("callout_box", "Only 20 made a day", 540, 960);
    expect(b.box.x * 2).toBeCloseTo(a.box.x, -1);
    expect(b.box.y * 2).toBeCloseTo(a.box.y, -1);
    expect(b.fontSize * 2).toBeCloseTo(a.fontSize, 0);
  });
});
