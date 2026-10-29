import { describe, it, expect } from "vitest";
import { brandVoiceFrom } from "./commentBrand";

describe("brandVoiceFrom", () => {
  it("passes the voice and the words to avoid that Settings records", () => {
    const v = brandVoiceFrom(
      { niche: "Food", brand_name: "Salvo's", goals: "More bookings", brand_detail: { voice: "Casual", avoid: "discounts", description: "Family pizzeria", location: "Hermitage, TN" } },
      null,
    );
    expect(v.name).toBe("Salvo's");
    expect(v.location).toBe("Hermitage, TN");
    expect(v.notes).toContain("Voice: Casual");
    expect(v.notes).toContain("Family pizzeria");
    expect(v.notes).toContain("Never mention: discounts");
  });

  it("invents nothing when the brand recorded nothing", () => {
    const v = brandVoiceFrom({ brand_detail: null }, null);
    expect(v).toEqual({ name: null, niche: null, location: null, notes: null });
  });
});
