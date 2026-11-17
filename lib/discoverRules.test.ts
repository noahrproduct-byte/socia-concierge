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
    expect(fitRules(k)).toMatch(/^competitor: .*OWN app/m);
    expect(fitRules(k)).toMatch(/^niche: .*AI tools in action/m);
    expect(fitRules(k)).toMatch(/^off: coaches/m);
    expect(r).toMatch(/founder's or creator's account that sells its OWN app/);
  });
  it("keeps creators competing with other creators", () => {
    const k = brandKind({ accountType: "creator" });
    expect(competitorWords(k)).toBe("other creators in the same niche");
    expect(researchRules(k, null)).not.toMatch(/NOT competitors/);
  });
});

describe("where viral Reels come from", () => {
  it("a local business copies the same kind of business anywhere; an app copies its video style", async () => {
    const { viralSource } = await import("./discoverRules");
    const pizza = brandKind({ accountType: "business", name: "Salvo's Pizza", niche: "Pizza restaurant" });
    const socia = brandKind({ accountType: "business", name: "SOCIA", niche: "AI app for Instagram growth" });
    const creator = brandKind({ accountType: "creator", name: "Ana", niche: "Fitness" });
    expect(viralSource(pizza, "filmed footage")).toBe("kind");
    expect(viralSource(pizza, null)).toBe("kind");
    expect(viralSource(socia, "animated")).toBe("style");
    expect(viralSource(socia, null)).toBeNull();
    expect(viralSource(creator, null)).toBeNull();
  });
});
