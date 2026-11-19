import { describe, expect, it } from "vitest";
import { READINESS, readinessLines, readinessOf, readinessThresholds, type ReadinessPost } from "./readiness";
import { starterQuestions, unanswered } from "./questions";
import { factLines, normalizeStrategy, strategyLines, type StrategyFacts } from "../strategy";

const now = new Date("2026-11-18T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const posts = (n: number, format = "Reel", start = 3): ReadinessPost[] => Array.from({ length: n }, (_, i) => ({ date: daysAgo(start + i), format, metric: { value: 100 + i } }));

describe("readinessOf", () => {
  it("an account with a handful of posts is starting, whatever its age or followers", () => {
    const r = readinessOf(posts(3), now);
    expect(r.stage).toBe("starting");
    expect(r.measured).toBe(3);
    expect(r.toNext).toBe(READINESS.startUnder - 3);
    expect(r.ownWeight).toBeLessThanOrEqual(0.2);
  });

  it("only settled posts with a number, inside the window, count", () => {
    const r = readinessOf([
      { date: daysAgo(0.5), format: "Reel", metric: { value: 10 } },     // too fresh
      { date: daysAgo(400), format: "Reel", metric: { value: 10 } },     // too old
      { date: daysAgo(5), format: "Reel", metric: null },                 // no number
      { date: null, format: "Reel", metric: { value: 10 } },              // no date
      { date: daysAgo(5), format: "Reel", metric: { value: 10 } },
    ], now);
    expect(r.measured).toBe(1);
  });

  it("enough posts but all in one format with too few of any: still starting", () => {
    const mixed = ["Reel", "Carousel", "Static", "Short"].flatMap((f) => posts(2, f));
    expect(readinessOf(mixed, now).stage).toBe("starting");
  });

  it("the account's own weight rises gradually with every measured post, never jumping", () => {
    const ws = [4, 8, 12, 19, 25, 30, 40].map((n) => readinessOf([...posts(n - Math.floor(n / 2)), ...posts(Math.floor(n / 2), "Carousel", 40)], now).ownWeight);
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i]).toBeGreaterThanOrEqual(ws[i - 1]);
      expect(ws[i] - ws[i - 1]).toBeLessThanOrEqual(0.25);
    }
    expect(ws[0]).toBeLessThanOrEqual(0.2);
    expect(ws[ws.length - 1]).toBeGreaterThanOrEqual(0.8);
  });

  it("established needs the post count and two comparable formats", () => {
    expect(readinessOf(posts(35), now).stage).toBe("learning");
    expect(readinessOf([...posts(20), ...posts(15, "Carousel", 30)], now).stage).toBe("established");
  });

  it("thresholds can be set in configuration", () => {
    const t = readinessThresholds({ READINESS_START_UNDER: "4", READINESS_FULL_AT: "2" });
    expect(t.startUnder).toBe(4);
    expect(t.fullAt).toBe(5);
    expect(readinessOf(posts(5), now, t).stage).toBe("learning");
  });

  it("tells the writers to treat a starting account's own patterns as hints", () => {
    expect(readinessLines(readinessOf(posts(2), now))).toMatch(/still building its history.*hint, not evidence/s);
  });
});

describe("starterQuestions", () => {
  it("reuses what onboarding already asked, so nothing is asked twice", () => {
    const qs = starterQuestions({
      focus: "Weeknight recipes for students", main_goal: "followers", audience: { who: "Students on a budget" },
      personality: { on_camera: "no" }, resources: { video_maker: "claude" },
      routine: { post_days: 3, formats: ["tutorials", "animated"], filming: [{ day: "sat", minutes: 120 }] },
    }, { admired: ["chefjohn"] });
    expect(unanswered(qs)).toEqual([]);
    expect(qs.find((q) => q.id === "style")?.answer).toBe("On camera: no, keep me off camera; My Claude makes them");
    expect(qs.find((q) => q.id === "filming")?.answer).toBe("Saturday");
    expect(qs.find((q) => q.id === "admired")?.answer).toBe("@chefjohn");
  });

  it("an empty profile asks all eight", () => {
    expect(unanswered(starterQuestions(null)).map((q) => q.id)).toEqual(["about", "audience", "goal", "formats", "style", "post_days", "filming", "admired"]);
  });

  it("faceless formats alone count as an answer to the style question", () => {
    expect(starterQuestions({ routine: { formats: ["animated", "ai_generated"] } }).find((q) => q.id === "style")?.answer).toBe("Faceless or AI-generated videos");
  });
});

describe("the starter strategy", () => {
  const readiness = readinessOf(posts(2), now);
  const facts: StrategyFacts = { growth: { routine: { post_days: 3 } }, niche: "Food", brandName: "Kitchen", pace: null, works: [], findings: [], goals: [], themes: [], readiness, nicheSeen: ['@cook (instagram), Reel: "3 meals under $5", 120,000 views, 4.0x their median views'], admired: ["cook"] };

  it("the facts say the account is new and keep niche numbers apart as other accounts'", () => {
    const { prompt, basedOn } = factLines(facts);
    expect(prompt).toContain("still building its history");
    expect(prompt).toContain("Observed on other accounts in their niche (those accounts' published numbers, not this account's)");
    expect(prompt).toContain("@cook");
    expect(basedOn).toContain("Starter mode: your account is still building its history");
  });

  it("keeps three experiments, each on what it varies, and records the stage, weight and observations", () => {
    const raw = { pillars: [{ name: "Cheap meals", why: "profile" }], posts_per_week: 7, frequency_why: "", experiments: [
      { dimension: "hook", hypothesis: "Question hooks may hold viewers", test: "3 vs 3", measure: "views" },
      { dimension: "length", hypothesis: "Shorter may do better", test: "3 vs 3", measure: "views" },
      { dimension: "format", hypothesis: "Tutorials may beat vlogs", test: "3 vs 3", measure: "views" },
      { dimension: "bogus", hypothesis: "Fourth", test: "x", measure: "y" },
    ], priorities: [], milestones: [], secondary_objectives: [], audience: "" };
    const s = normalizeStrategy(raw, { growth: facts.growth, goalLine: null, basedOn: [], now, readiness, nicheSeen: facts.nicheSeen });
    expect(s.experiments).toHaveLength(3);
    expect(s.experiments.map((e) => e.dimension)).toEqual(["hook", "length", "format"]);
    expect(s.frequency.posts_per_week).toBe(3);
    expect(s).toMatchObject({ stage: "starting", observed: facts.nicheSeen });
    expect(s.own_weight).toBeLessThanOrEqual(0.2);
    expect(strategyLines(s)).toContain("(hooks)");
  });

  it("an established account keeps two experiments and stores no niche observations", () => {
    const est = readinessOf([...posts(20), ...posts(15, "Carousel", 30)], now);
    const s = normalizeStrategy({ experiments: [1, 2, 3].map((i) => ({ dimension: "hook", hypothesis: `h${i}`, test: "t", measure: "m" })) }, { growth: null, goalLine: null, basedOn: [], now, readiness: est, nicheSeen: ["x"] });
    expect(s.experiments).toHaveLength(2);
    expect(s.observed).toBeUndefined();
    expect(s.stage).toBe("established");
  });
});
