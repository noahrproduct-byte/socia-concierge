import { describe, expect, it } from "vitest";
import { needsMeasurement } from "./mediaInfo";

const base = { url: "https://example.test/scheduled-media/a.mp4", width: 1080, height: 1920, duration: 12 } as const;

describe("needsMeasurement", () => {
  it("is false for a stored video with length and dimensions", () => {
    expect(needsMeasurement({ kind: "video", ...base })).toBe(false);
  });

  it("is true for a stored video whose length was never measured (a draft made through the API)", () => {
    expect(needsMeasurement({ kind: "video", ...base, duration: null })).toBe(true);
  });

  it("is true for a stored file without dimensions", () => {
    expect(needsMeasurement({ kind: "image", ...base, width: null, height: null, duration: null })).toBe(true);
    expect(needsMeasurement({ kind: "video", ...base, height: null })).toBe(true);
  });

  it("is false for an image with dimensions: images have no length to measure", () => {
    expect(needsMeasurement({ kind: "image", ...base, duration: null })).toBe(false);
  });

  it("is false before the file is uploaded: there is nothing to read yet", () => {
    expect(needsMeasurement({ kind: "video", ...base, url: null, duration: null })).toBe(false);
  });
});
