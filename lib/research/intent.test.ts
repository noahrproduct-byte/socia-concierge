import { describe, expect, it } from "vitest";
import { guessIntent, linkIn, planSources, sanitizeIntent, type ResearchIntent } from "./intent";

// The six requests Noah named (2026-11-17). Each must get its own research
// strategy; none may fall back to "the account's top posts" for everything.
const SCENARIOS = {
  saasPitch: "I want to film a talking-head Reel pitching SOCIA to potential customers.",
  restaurantPromo: "Help me make a promotional Reel for our pizza restaurant's new lunch deal.",
  fitnessHooks: "Research what workout hooks are working for fitness creators right now.",
  referenceStyle: "How do I recreate the editing style of this video? https://www.instagram.com/reel/ABC123/",
  engagementDrop: "Why did my engagement drop over the last two weeks?",
  weeklyPlan: "Give me a competitor-backed content plan for next week.",
};

describe("the six real-world requests get different research", () => {
  const plan = (q: string, page = "global") => {
    const i = guessIntent(q, { page });
    return { i, p: planSources(i, { linkInQuestion: Boolean(linkIn(q)), page }) };
  };

  it("a SaaS founder's talking-head pitch studies comparable public videos, not the founder's own top posts", () => {
    const { i, p } = plan(SCENARIOS.saasPitch);
    expect(i.kind).toBe("create_content");
    expect(i.format).toBe("talking head");
    expect(p.external).toBe(true);
    expect(p.account).toBe("summary");
  });

  it("a restaurant promo researches comparable promos and the niche", () => {
    const { i, p } = plan(SCENARIOS.restaurantPromo);
    expect(i.kind).toBe("create_content");
    expect(p.external && p.niche).toBe(true);
    expect(p.account).not.toBe("full");
  });

  it("fitness hooks research the niche and competitors, without the account", () => {
    const { i, p } = plan(SCENARIOS.fitnessHooks);
    expect(i.kind).toBe("niche_research");
    expect(p).toMatchObject({ niche: true, competitors: true, account: "none" });
  });

  it("recreating a reference reads the supplied video only", () => {
    const { i, p } = plan(SCENARIOS.referenceStyle);
    expect(i.kind).toBe("reference_style");
    expect(p).toMatchObject({ reference: true, external: false, account: "none" });
  });

  it("an engagement drop reads the account's own history and nothing outside", () => {
    const { i, p } = plan(SCENARIOS.engagementDrop);
    expect(i.kind).toBe("own_performance");
    expect(p).toMatchObject({ account: "full", external: false, niche: false });
  });

  it("a competitor-backed weekly plan combines the account, the niche and competitors", () => {
    const { i, p } = plan(SCENARIOS.weeklyPlan);
    expect(i.kind).toBe("plan_week");
    expect(p).toMatchObject({ account: "full", niche: true, competitors: true });
  });

  it("no two of the six get the same sources", () => {
    const keys = Object.values(SCENARIOS).map((q) => { const { i, p } = plan(q); return `${i.kind}|${p.account}|${p.external}|${p.niche}|${p.competitors}|${p.reference}`; });
    // The two create_content requests may share a plan; everything else differs.
    expect(new Set(keys).size).toBeGreaterThanOrEqual(5);
  });
});

describe("planSources with the model's read", () => {
  const base: ResearchIntent = { kind: "create_content", goal: "", topic: "", format: "", platform: "", audience: "", outcome: "", queries: ["founder saas pitch shorts"] };
  it("searches outside only when there is a query", () => {
    expect(planSources(base).external).toBe(true);
    expect(planSources({ ...base, queries: [] }).external).toBe(false);
  });
  it("a link in the message is always read, except for a question about the account", () => {
    expect(planSources(base, { linkInQuestion: true }).reference).toBe(true);
    expect(planSources({ ...base, kind: "own_performance" }, { linkInQuestion: true }).reference).toBe(false);
  });
  it("the competitors page always brings its competitor", () => {
    expect(planSources({ ...base, kind: "general" }, { page: "competitors" }).competitors).toBe(true);
  });
  it("improving a post looks at that post", () => {
    expect(planSources({ ...base, kind: "improve_post" })).toMatchObject({ post: true, account: "full" });
  });
});

describe("sanitizeIntent", () => {
  const fb = guessIntent("make a reel");
  it("keeps a valid read and bounds it", () => {
    const i = sanitizeIntent({ kind: "niche_research", goal: "g", topic: "x".repeat(300), format: "", platform: "TikTok", audience: "", outcome: "", queries: ["a b c", "ok query", "third"] }, fb);
    expect(i.kind).toBe("niche_research");
    expect(i.topic.length).toBe(80);
    expect(i.platform).toBe("tiktok");
    expect(i.queries).toEqual(["a b c", "ok query"]);
  });
  it("an unknown kind or junk falls back to the guess", () => {
    expect(sanitizeIntent({ kind: "hack" }, fb).kind).toBe(fb.kind);
    expect(sanitizeIntent(null, fb)).toBe(fb);
  });
});

describe("linkIn", () => {
  it("finds video links and trims punctuation", () => {
    expect(linkIn("see https://youtu.be/abc123XYZ.")).toBe("https://youtu.be/abc123XYZ");
    expect(linkIn("this https://www.tiktok.com/@a/video/1)")).toBe("https://www.tiktok.com/@a/video/1");
    expect(linkIn("no link here")).toBeNull();
  });
});
