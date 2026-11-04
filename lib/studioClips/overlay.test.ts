import { describe, expect, it } from "vitest";
import { humanText, overlayStyle, placeOverlays } from "./overlay";
import { DEFAULT_STYLE } from "./style";

describe("on-screen text that reads like a person typed it", () => {
  it("keeps a plain line as it is", () => {
    expect(humanText("fresh out the oven")).toBe("fresh out the oven");
    expect(humanText("We open at 7 tomorrow")).toBe("We open at 7 tomorrow");
  });

  it("takes out what reads as machine-made", () => {
    expect(humanText("“The Best Slice In Town Is Here”")).toBe("The best slice in town is here");
    expect(humanText("WATCH WHAT HAPPENS NEXT")).toBe("Watch what happens next");
    expect(humanText("Hot pizza — made fresh daily.")).toBe("Hot pizza, made fresh daily");
    expect(humanText("so good!!! 🔥🔥🍕 #pizza #food")).toBe("so good! 🔥");
    expect(humanText("“Wait For The Cheese Pull” 🔥🔥")).toBe("Wait for the cheese pull 🔥");
  });

  it("drops lines with marketing or model phrases", () => {
    expect(humanText("Unlock the secret to perfect crust")).toBeNull();
    expect(humanText("Elevate your lunch game")).toBeNull();
    expect(humanText("A mouthwatering journey for your taste buds")).toBeNull();
    expect(humanText("x".repeat(61))).toBeNull();
  });

});

describe("where the text goes", () => {
  it("opens, sits in the middle and closes without overlapping", () => {
    const out = placeOverlays([
      { text: "wait for the cheese pull", role: "opening", t: 0 },
      { text: "12 hour dough", role: "mid", t: 7 },
      { text: "come by tonight", role: "cta", t: 18 },
    ], 20);
    expect(out.map((t) => [t.role, t.at, t.end])).toEqual([["opening", 0.2, 3.2], ["mid", 7, 9.5], ["cta", 17, 19.8]]);
    for (let i = 1; i < out.length; i++) expect(out[i].at).toBeGreaterThanOrEqual(out[i - 1].end);
  });

  it("drops lines it can't make human, and repeats", () => {
    const out = placeOverlays([{ text: "Unlock flavor" }, { text: "made this morning" }, { text: "Made this morning" }], 12);
    expect(out.map((t) => t.text)).toEqual(["made this morning"]);
  });

  it("keeps a short video to one line", () => {
    expect(placeOverlays([{ text: "a" + "b" }, { text: "second" }], 3)).toHaveLength(1);
    expect(placeOverlays([], 10)).toEqual([]);
  });
});

describe("the look", () => {
  it("uses the brand's own look when there is one", () => {
    const preset = { ...DEFAULT_STYLE, font: "bebas" as const };
    expect(overlayStyle({ preset, brightness: "bright" })).toBe(preset);
  });
  it("is plain white on dark, or dark on white over dark footage", () => {
    expect(overlayStyle({ preset: null, brightness: "ok" })).toMatchObject({ font: "inter", textBox: "dark", accent: "#111111" });
    expect(overlayStyle({ preset: null, brightness: "dark" }).textBox).toBe("light");
  });
});
