import { describe, expect, it } from "vitest";
import { fileLabel, firstLineOf, postLabel } from "./postLabel";

describe("postLabel", () => {
  it("uses the caption's first line when there is one", () => {
    expect(postLabel("\n  Morning bake  \nmore", [{ platform: "youtube", settings: { title: "Other" } }])).toBe("Morning bake");
  });

  it("drops a trailing run of hashtags but keeps a line that is only hashtags", () => {
    expect(firstLineOf("Sourdough day #bread #bake")).toBe("Sourdough day");
    expect(firstLineOf("#bread #bake")).toBe("#bread #bake");
  });

  it("falls back to the YouTube title for a post with no caption", () => {
    expect(postLabel("", [{ platform: "instagram", settings: { caption: "IG text" } }, { platform: "youtube", settings: { title: "  How we laminate  " } }])).toBe("How we laminate");
  });

  it("then a Facebook title, then an Instagram or TikTok caption", () => {
    expect(postLabel(null, [{ platform: "tiktok", settings: { caption: "TT line" } }, { platform: "facebook", settings: { title: "" } }])).toBe("TT line");
    expect(postLabel(null, [{ platform: "facebook", settings: { title: "FB title" } }])).toBe("FB title");
  });

  it("is null when nothing has text, and ignores odd settings", () => {
    expect(postLabel("  \n ", [{ platform: "youtube", settings: { title: "" } }, { platform: "instagram", settings: null }, { platform: "x" }])).toBeNull();
    expect(postLabel(undefined)).toBeNull();
  });
});

describe("fileLabel", () => {
  it("reads a file name as words", () => {
    expect(fileLabel("latte_art-01.mp4")).toBe("latte art 01");
    expect(fileLabel("user/ask/abc_Croissants.JPG")).toBe("abc Croissants");
    expect(fileLabel("IMG.2041.mov")).toBe("IMG 2041");
  });
  it("is null when nothing readable is left", () => {
    expect(fileLabel("")).toBeNull();
    expect(fileLabel(null)).toBeNull();
    expect(fileLabel("___.mp4")).toBeNull();
  });
});
