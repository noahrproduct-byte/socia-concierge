import { describe, it, expect } from "vitest";
import { ACCENTS, cleanSpec, inkOn, inventsNumbers, numberTokens, palette, sceneFrames, specTimeline } from "./spec";

const SOURCE = "Hook: Three things to order on your first visit. Concept: our 3 house drinks under $5, open 7am.";

describe("animated spec cleaning", () => {
  it("keeps good scenes, puts the hook first and drops unknown types", () => {
    const s = cleanSpec({
      theme: "light", accent: ACCENTS[1],
      scenes: [
        { type: "point", text: "Start with the house latte", emphasis: "house latte" },
        { type: "hook", text: "Three things to order on your first visit", emphasis: "first visit" },
        { type: "banner", text: "nope" },
        { type: "list", title: "Our picks", items: ["Latte", "Cold brew", "Cardamom bun"] },
        { type: "cta", text: "Come say hi", sub: "Open from 7am" },
      ],
      caption: "Your first visit, sorted.", hashtags: ["#coffee", "first visit!"],
    }, SOURCE, { signoff: "Salvo's" })!;
    expect(s.scenes.map((x) => x.type)).toEqual(["hook", "point", "list", "cta"]);
    expect(s.theme).toBe("light");
    expect(s.accent).toBe(ACCENTS[1]);
    expect(s.signoff).toBe("Salvo's");
    expect(s.hashtags).toEqual(["coffee", "firstvisit"]);
  });

  it("drops any scene with a number, price or percentage the plan didn't contain", () => {
    const s = cleanSpec({ scenes: [
      { type: "hook", text: "Three drinks under $5" },
      { type: "point", text: "Rated 4.9 by 2,000 locals" },
      { type: "point", text: "Our 3 house drinks" },
      { type: "point", text: "Save 20% today" },
    ] }, SOURCE)!;
    expect(s.scenes.map((x) => ("text" in x ? x.text : ""))).toEqual(["Three drinks under $5", "Our 3 house drinks"]);
  });

  it("refuses a video without a hook or with nothing after it", () => {
    expect(cleanSpec({ scenes: [{ type: "point", text: "Hi" }, { type: "cta", text: "Follow" }] }, SOURCE)).toBeNull();
    expect(cleanSpec({ scenes: [{ type: "hook", text: "Hi" }] }, SOURCE)).toBeNull();
    expect(cleanSpec(null, SOURCE)).toBeNull();
  });

  it("removes em dashes, caps words, keeps emphasis only when it is in the line, and falls back to safe colours", () => {
    const s = cleanSpec({ theme: "neon", accent: "#123456", scenes: [
      { type: "hook", text: "Coffee — but better, and also much much much much faster than ever", emphasis: "tea" },
      { type: "list", title: "Only one", items: ["a"] },
      { type: "quote", text: "Best morning stop" },
    ] }, SOURCE)!;
    const hook = s.scenes[0] as { text: string; emphasis?: string };
    expect(hook.text).toBe("Coffee, but better, and also much much much much");
    expect(hook.emphasis).toBeUndefined();
    expect(s.scenes.map((x) => x.type)).toEqual(["hook", "quote"]);
    expect(s.theme).toBe("ink");
    expect(s.accent).toBe(ACCENTS[0]);
  });

  it("turns a second hook into a point and stops at six scenes", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ type: i < 2 ? "hook" : "point", text: `Line ${["a", "b", "c", "d", "e", "f", "g", "h", "i"][i]}` }));
    const s = cleanSpec({ scenes: many }, SOURCE)!;
    expect(s.scenes).toHaveLength(6);
    expect(s.scenes.filter((x) => x.type === "hook")).toHaveLength(1);
  });

  it("clears a caption that invents a number", () => {
    expect(cleanSpec({ scenes: [{ type: "hook", text: "A" }, { type: "point", text: "B" }], caption: "Join 500 happy regulars" }, SOURCE)!.caption).toBe("");
  });
});

describe("numbers", () => {
  it("reads numbers with their units and compares them to the source", () => {
    expect([...numberTokens("Under $5, open 7am, 20%!")]).toEqual(["$5", "7am", "20%"]);
    expect(inventsNumbers("open 7am", numberTokens(SOURCE))).toBe(false);
    expect(inventsNumbers("open 8am", numberTokens(SOURCE))).toBe(true);
  });
});

describe("timing and colour", () => {
  it("gives longer lines more time, within limits, and adds an end card only with a sign-off", () => {
    expect(sceneFrames({ type: "hook", text: "Hi" })).toBe(60);
    expect(sceneFrames({ type: "quote", text: Array(40).fill("word").join(" ") })).toBe(165);
    const spec = cleanSpec({ scenes: [{ type: "hook", text: "One two three" }, { type: "cta", text: "Follow for more" }] }, SOURCE)!;
    const t = specTimeline(spec);
    expect(t.starts).toEqual([0, t.frames[0]]);
    expect(t.total).toBe(t.frames[0] + t.frames[1]);
    expect(specTimeline({ ...spec, signoff: "Salvo's" }).total).toBe(t.total + 48);
  });

  it("picks readable text colours", () => {
    expect(inkOn("#FFFFFF")).toBe("#111111");
    expect(inkOn("#101012")).toBe("#FFFFFF");
    expect(palette({ theme: "accent", accent: "#F5A623" }).fg).toBe("#111111");
    expect(palette({ theme: "ink", accent: "#2F5BFF" }).markInk).toBe("#FFFFFF");
  });
});
