import { describe, expect, it } from "vitest";
import { storyboardInstruction } from "./storyboard";

describe("storyboardInstruction", () => {
  it("asks for nothing when every shot is kept", () => {
    expect(storyboardInstruction(["keep", "keep"], ["", ""])).toBeNull();
    expect(storyboardInstruction(["keep", "maybe"], ["", "  "])).toBeNull();
  });
  it("names the shots to remove and the changes asked for", () => {
    expect(storyboardInstruction(["keep", "drop", "maybe", "drop"], ["", "", "make it shorter", ""])).toBe("Remove shots 2, 4. Shot 3: make it shorter.");
    expect(storyboardInstruction(["drop", "keep"], ["", ""])).toBe("Remove shot 1.");
  });
});
