import { describe, expect, it } from "vitest";
import { findOpportunities, opportunitiesEvidence, type OpportunityInput } from "./opportunities";
import type { TrendGroup, TrendSignals } from "../trendSignals";

const now = new Date("2026-11-25T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const g = (label: string, kind: "hook" | "topic", med: number, leads = true, accounts = 4): TrendGroup => ({
  label, kind, posts: 9, accounts, withBaseline: 9, aboveBaseline: 7, medianMultiplier: med, leads,
  examples: [{ line: "Why does nobody talk about this?", url: `https://instagram.com/reel/${label}`, platform: "instagram", account: "@a", multiplier: 3.1, basis: "views" }],
});
const signals = (hooks: TrendGroup[], topics: TrendGroup[] = []): TrendSignals => ({ reelsRead: 40, accounts: 6, hooks, topics, strongLines: [] });
const own = (captions: string[], format = "Reel") => captions.map((c, i) => ({ caption: c, format, at: day(i * 3 + 1) }));
const base = (o: Partial<OpportunityInput>): OpportunityInput => ({ signals: null, provenFormats: [], own: [], rosterPace: [], targetPerWeek: null, loc: [], now, ...o });

describe("findOpportunities", () => {
  it("a hook leading across the niche that the brand never uses is an opportunity, with its evidence and a way to try it", () => {
    const ops = findOpportunities(base({ signals: signals([g("Question", "hook", 2.2)]), own: own(["Fresh pizza today", "Our new oven", "Lunch special all week", "Weekend hours"]) }));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "hook", title: "Try the question hook" });
    expect(ops[0].observed).toBe("9 recent Reels from 4 accounts in your niche open this way; their median is 2.2x their creators' usual (7 of 9 beat it).");
    expect(ops[0].you).toBe("None of your last 4 posts opens this way.");
    expect(ops[0].how).toMatch(/question your customer actually asks/);
    expect(ops[0].why).toMatch(/not proof it will work for you/);
    expect(ops[0].examples).toHaveLength(1);
  });

  it("a hook the brand already uses often, or one that doesn't lead, isn't one", () => {
    const asks = own(["Why is our crust so crispy?", "What makes a great slice?", "Who wants lunch?", "Weekend hours"]);
    expect(findOpportunities(base({ signals: signals([g("Question", "hook", 2.2)]), own: asks }))).toEqual([]);
    expect(findOpportunities(base({ signals: signals([g("POV", "hook", 1.1, false)]), own: own(["a b c"]) }))).toEqual([]);
  });

  it("a leading topic the brand hasn't covered is one", () => {
    const ops = findOpportunities(base({ signals: signals([], [g("Catering / large orders", "topic", 1.8)]), own: own(["Fresh pizza today", "Our new oven"]) }));
    expect(ops[0]).toMatchObject({ kind: "topic", title: "Cover catering / large orders" });
  });

  it("short video: only when the niche's winners are mostly Reels and the brand posts few", () => {
    const photos = own(["a", "b", "c", "d", "e"], "Photo");
    const ops = findOpportunities(base({ provenFormats: ["Reel", "Reel", "Short", "Reel", "Photo"], own: photos }));
    expect(ops.map((o) => o.id)).toEqual(["format:short-video"]);
    expect(ops[0].you).toBe("0% of your last 5 posts are.");
    expect(findOpportunities(base({ provenFormats: ["Reel", "Reel", "Short", "Reel"], own: own(["a", "b", "c", "d"]) }))).toEqual([]);
  });

  it("posting rhythm: only when comparable accounts post clearly more and the brand's own target leaves room", () => {
    const rare = [{ caption: "a", format: "Reel", at: day(3) }, { caption: "b", format: "Reel", at: day(20) }];
    const ops = findOpportunities(base({ rosterPace: [3, 4, 5, 6], own: rare }));
    expect(ops[0]).toMatchObject({ kind: "cadence" });
    expect(ops[0].you).toMatch(/^You posted 0\.5 times a week/);
    // Below their own target: reach it first, never past it.
    expect(findOpportunities(base({ rosterPace: [3, 4, 5, 6], own: rare, targetPerWeek: 2 }))[0]).toMatchObject({ id: "cadence:reach-target", how: expect.stringMatching(/at 2 posts a week, the target you set/) });
    // At their own target: nothing, even when others post more.
    const weekly = [1, 8, 15, 22].map((d) => ({ caption: "x", format: "Reel", at: day(d) }));
    expect(findOpportunities(base({ rosterPace: [3, 4, 5, 6], own: weekly, targetPerWeek: 1 }))).toEqual([]);
    expect(findOpportunities(base({ rosterPace: [5, 6], own: rare }))).toEqual([]);
  });

  it("orders the strongest first and caps the list", () => {
    const ops = findOpportunities(base({ signals: signals([g("Question", "hook", 1.5), g("POV", "hook", 3.5)], [g("Tutorial", "topic", 2)]), own: own(["Our oven", "Lunch"]) }), 2);
    expect(ops.map((o) => o.title)).toEqual(["Try the POV hook", "Cover tutorial"]);
    expect(ops).toHaveLength(2);
  });

  it("says it's a test, never a promise, in the evidence for the writers", () => {
    const t = opportunitiesEvidence(findOpportunities(base({ signals: signals([g("Question", "hook", 2.2)]), own: own(["Fresh pizza"]) })));
    expect(t).toMatch(/seen on other accounts, untested on this one; a test to run, never a promise/);
    expect(opportunitiesEvidence([])).toBe("");
  });
});
