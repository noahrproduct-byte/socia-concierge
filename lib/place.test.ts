import { describe, expect, it } from "vitest";
import { FILMING_DIRECTION_RULE, PLACE_MAX_SPOTS, placeLines, sanitizePlace } from "./place";
import { brandContext } from "./prompt";

const scan = {
  kind: "A small coffee shop with a long counter — and eight tables",
  spots: [
    { name: "Front door", looks: "glass door with the logo in white", filmIt: "stand on the sidewalk and walk in as it opens" },
    { name: "", looks: "nameless", filmIt: "dropped" },
    { name: "Pastry case", looks: "lit glass case by the register", filmIt: "" },
  ],
  light: "big front windows, brightest before noon",
  signature: "the red espresso machine",
  unseen: "the kitchen",
  scannedAt: "2026-11-04T18:00:00.000Z",
  photos: 4,
};

describe("sanitizePlace", () => {
  it("keeps named spots, bounds the text and drops em dashes", () => {
    const p = sanitizePlace(scan)!;
    expect(p.spots.map((s) => s.name)).toEqual(["Front door", "Pastry case"]);
    expect(p.kind).toBe("A small coffee shop with a long counter, and eight tables");
    expect(p.photos).toBe(4);
  });
  it("caps spots and photos, and rejects nothing usable", () => {
    const many = { ...scan, photos: 40, spots: Array.from({ length: 20 }, (_, i) => ({ name: `Spot ${i}`, looks: "x", filmIt: "y" })) };
    const p = sanitizePlace(many)!;
    expect(p.spots).toHaveLength(PLACE_MAX_SPOTS);
    expect(p.photos).toBe(6);
    expect(sanitizePlace({ kind: "", spots: [] })).toBeNull();
    expect(sanitizePlace("nope")).toBeNull();
  });
});

describe("placeLines", () => {
  it("names each spot and what the photos didn't show", () => {
    const lines = placeLines(sanitizePlace(scan)).join("\n");
    expect(lines).toContain("SOCIA scanned 4 photos");
    expect(lines).toContain("- Front door: glass door with the logo in white How to film it: stand on the sidewalk");
    expect(lines).toContain("Not seen in the photos, so don't assume it: the kitchen");
  });
  it("adds nothing without a scan", () => {
    expect(placeLines(null)).toEqual([]);
  });
  it("reaches every writer through brandContext", () => {
    expect(brandContext({ place: sanitizePlace(scan)! })).toContain("Front door");
    expect(brandContext({})).toBe("");
  });
});

describe("FILMING_DIRECTION_RULE", () => {
  it("asks for a spot, a camera move and the first frame, and forbids invented features", () => {
    expect(FILMING_DIRECTION_RULE).toMatch(/spot/);
    expect(FILMING_DIRECTION_RULE).toMatch(/camera position and move/);
    expect(FILMING_DIRECTION_RULE).toMatch(/never state a feature as fact/);
    expect(FILMING_DIRECTION_RULE).not.toMatch(/—/);
  });
});
