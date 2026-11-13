import { describe, expect, it } from "vitest";
import { STAB_PARAMS, stabilizeFilters, stablePath } from "./stabilize";

describe("stabilizeFilters", () => {
  it("uses vidstab's two passes when the binary has it, deshake alone otherwise", () => {
    const v = stabilizeFilters("medium", "/tmp/m.trf", true);
    expect(v.detect).toContain("vidstabdetect=shakiness=6");
    expect(v.transform).toContain("vidstabtransform=input=/tmp/m.trf:smoothing=20:zoom=6");
    const d = stabilizeFilters("high", "/tmp/m.trf", false);
    expect(d.detect).toBeNull();
    expect(d.transform).toMatch(/^deshake=rx=48:ry=48/);
    expect(stabilizeFilters("low", "x", false).transform).toMatch(/^deshake=rx=16:ry=16/);
    expect(d.transform).toContain("crop=iw/1.100");
  });
  it("strengths grow in every parameter and the copy sits next to the source", () => {
    expect(STAB_PARAMS.low.zoom).toBeLessThan(STAB_PARAMS.medium.zoom);
    expect(STAB_PARAMS.medium.smoothing).toBeLessThan(STAB_PARAMS.high.smoothing);
    expect(stablePath("u/p/c/", "low")).toBe("u/p/c/stable-low.mp4");
  });
});
