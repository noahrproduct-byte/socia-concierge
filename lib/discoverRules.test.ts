import { describe, it, expect } from "vitest";
import { brandKind, competitorWords, fitRules, researchRules } from "./discoverRules";

// Discover training, round 1 (docs/discover/examples.json): SOCIA is an app,
// and coaches and educators came back as its competitors.
describe("who counts as a competitor", () => {
  it("knows an app from what the business says about itself", () => {
    expect(brandKind({ accountType: "business", name: "SOCIA", niche: "Social media", about: ["An AI app that tells creators what to post"] })).toEqual({ business: true, app: true });
    expect(brandKind({ accountType: "business", name: "Salvo's", niche: "Food & Restaurant > Pizza" })).toEqual({ business: true, app: false });
    expect(brandKind({ accountType: "creator", niche: "Social media", about: ["tips about apps"] })).toEqual({ business: false, app: false });
  });
  it("sends an app to other apps, never to coaches, with animated product videos first", () => {
    const k = brandKind({ accountType: "business", about: ["a social media app"] });
    expect(competitorWords(k)).toBe("other apps and software products");
    const r = researchRules(k, "Animated");
    expect(r).toMatch(/NOT competitors for a business/);
    expect(r).toMatch(/Coaches, educators/);
    expect(r).toMatch(/animated or motion-graphics product videos/);
    expect(fitRules(k)).toMatch(/do NOT fit/);
  });
  it("keeps creators competing with other creators", () => {
    const k = brandKind({ accountType: "creator" });
    expect(competitorWords(k)).toBe("other creators in the same niche");
    expect(researchRules(k, null)).not.toMatch(/NOT competitors/);
  });
});
