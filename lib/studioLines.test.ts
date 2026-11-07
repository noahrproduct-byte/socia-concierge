import { describe, it, expect } from "vitest";
import { LINE_IDS, LINE_SEC, applyLine, lineInUse, lineLayer, mergeProposed } from "./studioLines";
import type { EdlText } from "./studioClips/types";

const blank = { hook: "", cta: "", caption: "", layers: [] as EdlText[] };
const line = (id: string, at: number, end: number, text = id): EdlText => ({ id, at, end, text, role: "mid", presetId: "caption_bar" });
const video = { video: true, durationSec: 20 };
const still = { video: false, durationSec: 0 };

describe("using a line on a video", () => {
  it("puts the hook on the picture from the first frame and says where to look", () => {
    const r = applyLine(blank, "hook", "Wait for the cheese pull", video);
    expect(r.used).toBe(true);
    expect(r.at).toBe(0);
    expect(r.next.hook).toBe("Wait for the cheese pull");
    expect(r.next.layers).toEqual([expect.objectContaining({ id: LINE_IDS.hook, at: 0, end: LINE_SEC, text: "Wait for the cheese pull" })]);
  });
  it("puts the ending over the last seconds", () => {
    const r = applyLine(blank, "cta", "Come before 10", video);
    expect(r.at).toBe(17);
    expect(r.next.layers[0]).toMatchObject({ id: LINE_IDS.cta, at: 17, end: 20 });
  });
  it("fits a video shorter than the line's time", () => {
    expect(lineLayer("cta", "Go", 2)).toMatchObject({ at: 0, end: 2 });
    expect(lineLayer("hook", "Go", 2)).toMatchObject({ at: 0, end: 2 });
  });
  it("takes it off when used again, and leaves other lines alone", () => {
    const on = applyLine({ ...blank, layers: [line("mid", 8, 10)] }, "hook", "A hook", video);
    const off = applyLine(on.next, "hook", "A hook", video);
    expect(off.used).toBe(false);
    expect(off.at).toBeNull();
    expect(off.next.hook).toBe("");
    expect(off.next.layers.map((l) => l.id)).toEqual(["mid"]);
  });
  it("swaps to another hook rather than stacking two, and clears what was proposed for those seconds", () => {
    const first = applyLine({ ...blank, layers: [line("proposed", 1, 2)] }, "hook", "First", video);
    expect(first.next.layers.map((l) => l.id)).toEqual([LINE_IDS.hook]);
    const second = applyLine(first.next, "hook", "Second", video);
    expect(second.next.layers.map((l) => l.text)).toEqual(["Second"]);
  });
});

describe("what counts as in use", () => {
  it("is not the hook the page detected in the draft, until the person uses it", () => {
    const detected = { ...blank, hook: "Detected" };
    expect(lineInUse(detected, "hook", "Detected", true)).toBe(false);
    expect(lineInUse(detected, "hook", "Detected", false)).toBe(false);
    const r = applyLine(detected, "hook", "Detected", video);
    expect(r.used).toBe(true);
    expect(lineInUse(r.next, "hook", "Detected", true)).toBe(true);
    expect(r.next.layers[0].text).toBe("Detected");
  });
});

describe("using a line on a still post", () => {
  it("puts the hook at the top of the caption and the ending at the end", () => {
    const hooked = applyLine({ ...blank, caption: "Our sauce." }, "hook", "Why it tastes better", still);
    expect(hooked.next.caption).toBe("Why it tastes better\n\nOur sauce.");
    expect(hooked.at).toBeNull();
    expect(hooked.next.layers).toEqual([]);
    expect(applyLine(hooked.next, "cta", "Come by", still).next.caption).toBe("Why it tastes better\n\nOur sauce.\n\nCome by");
  });
  it("takes it back out when used again, and swaps cleanly", () => {
    const on = applyLine({ ...blank, caption: "Our sauce." }, "hook", "A", still);
    expect(applyLine(on.next, "hook", "B", still).next.caption).toBe("B\n\nOur sauce.");
    expect(applyLine(on.next, "hook", "A", still).next.caption).toBe("Our sauce.");
  });
});

describe("the lines Improve proposes", () => {
  it("keeps what the person chose and drops a proposal over the same seconds", () => {
    const chosen = line(LINE_IDS.hook, 0, 3, "Mine");
    const merged = mergeProposed([chosen, line("old", 5, 6)], [line("p1", 1, 2), line("p2", 9, 10)], []);
    expect(merged.map((l) => l.id)).toEqual([LINE_IDS.hook, "p2"]);
  });
  it("keeps on-screen text the person added", () => {
    expect(mergeProposed([line("x", 4, 5, "Added")], [line("p", 8, 9)], ["Added"]).map((l) => l.id)).toEqual(["x", "p"]);
  });
});
