import { describe, it, expect } from "vitest";
import { buildQueries, discoveryProfileFrom, goalFromMain, locationMatters, scoreAccount, type AccountCandidate } from "./discovery";

const base = { niche: null, brandName: null, goals: null, nicheDetail: null, brandDetail: null, ownHandle: null, ownFollowers: null, ownFormats: [] };

describe("discoveryProfileFrom", () => {
  it("prefers what the person confirmed, then what SOCIA inferred, then the old fields", () => {
    const p = discoveryProfileFrom({
      ...base,
      niche: "Food & Restaurant",
      goals: "grow followers",
      nicheDetail: { sub_niche: "Italian" },
      brandDetail: {
        location: "Hermitage, Tennessee",
        growth: {
          account_type: "business",
          main_goal: "local_customers",
          niche_path: { subcategory: "Pizza", specific: "Neapolitan pizza" },
          business: { offer: "Wood-fired pizza and catering", service_area: "local" },
          understanding: { audience: { value: "Families nearby", confidence: 60, evidence: [] } } as never,
        },
      },
    });
    expect(p.subNiche).toBe("Pizza");
    expect(p.specific).toBe("Neapolitan pizza");
    // The main goal wins over the free-text goal.
    expect(p.goal).toBe("local_awareness");
    expect(p.accountType).toBe("business");
    expect(p.audience).toBe("Families nearby");
    expect(p.scope).toBe("local");
    expect(p.focus).toBe("Wood-fired pizza and catering");
  });

  it("falls back to the free-text goal when no main goal is set", () => {
    expect(discoveryProfileFrom({ ...base, niche: "Travel", goals: "more engagement" }).goal).toBe("engagement");
    expect(goalFromMain(undefined)).toBeNull();
  });
});

describe("buildQueries from the Growth Profile", () => {
  it("searches a local pizza place's own town and niche first, then creators and the broad local category", () => {
    const p = discoveryProfileFrom({
      ...base, niche: "Food & Restaurant", brandDetail: { location: "Hermitage, Tennessee", growth: { account_type: "business", main_goal: "local_customers", niche_path: { subcategory: "Pizza", specific: "Neapolitan pizza" } } },
    });
    const qs = buildQueries(p).map((q) => q.q);
    expect(qs[0]).toBe("Hermitage Neapolitan pizza");
    expect(qs).toContain("Pizza creator");
    expect(qs).toContain("Hermitage food restaurant");
  });

  it("never sends a fitness creator to food searches, and leaves location out when the audience is global", () => {
    const p = discoveryProfileFrom({
      ...base, niche: "Fitness & Health", brandDetail: { location: "Austin, Texas", growth: { account_type: "creator", main_goal: "followers", niche_path: { subcategory: "Strength training" }, audience: { where: "global" } } },
    });
    const qs = buildQueries(p).map((q) => q.q.toLowerCase());
    expect(qs.some((q) => q.includes("food"))).toBe(false);
    expect(qs.some((q) => q.includes("austin"))).toBe(false);
    expect(qs[0]).toBe("strength training");
    expect(qs).toContain("strength training creator");
    expect(locationMatters(p)).toBe(false);
  });
});

describe("scoring weighs location by reach", () => {
  const acct: AccountCandidate = { platform: "youtube", platformAccountId: "x", handle: "austinlifts", displayName: "Austin Lifts", profileImage: null, profileUrl: null, followers: null, location: null, category: null, dataSource: "youtube_api" };
  it("counts a local match more for a local business than for a global creator", () => {
    const local = discoveryProfileFrom({ ...base, niche: "Fitness & Health", brandDetail: { location: "Austin", growth: { business: { service_area: "local" } } } });
    const global = discoveryProfileFrom({ ...base, niche: "Fitness & Health", brandDetail: { location: "Austin", growth: { audience: { where: "global" } } } });
    expect(scoreAccount(acct, local).relevanceScore).toBeGreaterThan(scoreAccount(acct, global).relevanceScore);
  });
});
