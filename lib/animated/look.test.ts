import { describe, expect, it } from "vitest";
import { contrast, lookFromStyle, readLook } from "./look";
import type { VideoStyle } from "@/lib/videoStyle";

const betaTwin = {
  version: 1, read_at: "2026-11-14T20:11:02.530Z", sources: [], confirmed_at: null, limitations: [],
  measured: { own: { seconds: 31.8, cutsPer10s: 0.2, palette: [] }, competitors: { seconds: 44, cutsPer10s: 1.2 } },
  structure: { hooks: [], pacing: "", spines: [], endings: [] },
  identity: {
    background: "#101418", text: "#838384", accent: "#A6CA43", palette: ["#101418", "#373C4A", "#616A33", "#838384", "#A6CA43", "#9C7C26", "#595A63"],
    font: "condensed", type: "Tall, narrow, bold all-caps headlines", logo: { spot: "top-right", what: "" },
    characters: "A white stick-figure climber with round joints", stage: "A dark navy indoor bouldering wall with scattered colourful oval holds", formats: [],
  },
} as unknown as VideoStyle;

describe("the account's look", () => {
  const l = lookFromStyle(betaTwin)!;
  it("uses the account's background and draws its stage and character", () => {
    expect(l.bg).toBe("#101418");
    expect(l.stage).toBe("climb_wall");
    expect(l.character).toBe("stick");
    expect(l.upper).toBe(true);
    expect(l.font).toBe("condensed");
  });
  it("keeps every colour readable on the background", () => {
    expect(contrast(l.fg, l.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(l.accent, l.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(l.key, l.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("takes the key colour from the palette, not the accent", () => {
    expect(l.key).not.toBe(l.accent);
  });
  it("survives the trip through JSON, and refuses a broken look", () => {
    expect(readLook(JSON.parse(JSON.stringify(l)))).toEqual(l);
    expect(readLook({ bg: "red" })).toBeNull();
  });
  it("is null without a style", () => expect(lookFromStyle(null)).toBeNull());
});
