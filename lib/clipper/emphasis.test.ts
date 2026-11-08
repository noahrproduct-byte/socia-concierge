import { describe, expect, it } from "vitest";
import { checkEmphasis, emphasisIndex, readEmphasis } from "./emphasis";

describe("the coloured word", () => {
  it("takes the marked word, however the caption is punctuated", () => {
    expect(emphasisIndex([" Sleep", " is", " everything."], ["everything"])).toBe(2);
  });
  it("falls back to a number", () => {
    expect(emphasisIndex([" made", " $17,000", " last"], [])).toBe(1);
  });
  it("colours nothing on a plain line", () => {
    expect(emphasisIndex([" and", " then"], ["sleep"])).toBe(-1);
  });
  it("only keeps words really said, once each", () => {
    expect(checkEmphasis(["Sleep", "sleep", "invented", 4], ["sleep.", "well"])).toEqual(["sleep"]);
    expect(readEmphasis(null)).toEqual([]);
  });
});
