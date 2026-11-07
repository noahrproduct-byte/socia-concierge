import { describe, expect, it } from "vitest";
import { byPriority, citedIds, cleanCompetitors, cleanDirections, cleanExperiments, cleanFixExtras, directionText, fmtSpan, scoreAfterEdits, validCuts, type PostRef } from "./studioVerdict";

const posts: PostRef[] = [
  { id: "R1", title: "POV: the first bite", url: "https://www.instagram.com/reel/r1/", thumb: null, account: "@cornerpatty", result: "240K views, 6.0x their usual" },
  { id: "R2", title: "Why this bun?", url: "https://www.instagram.com/reel/r2/", thumb: null, account: "@smashlab", result: "88K views" },
];

describe("a fix's priority, range and evidence", () => {
  it("keeps what the model gave when it is valid, bounded to the video", () => {
    const x = cleanFixExtras({ priority: "critical", end: 99, why: "The opening delays the proof.", evidence: { account: "W1 and W3", niche: "R1", confidence: "moderate", confidenceWhy: "A pattern, not proof." } }, 0, 0, 30);
    expect(x).toEqual({ priority: "critical", end: 30, why: "The opening delays the proof.", evidence: { account: "W1 and W3", niche: "R1", confidence: "moderate", confidenceWhy: "A pattern, not proof." }, steps: [], motion: "", part: null, scoreAfter: null, aiPrompt: "" });
  });
  it("falls back by rank, never invents a range, and treats unknown confidence as low", () => {
    expect(cleanFixExtras({}, 0, 4, 30)).toEqual({ priority: "high", end: null, why: "", evidence: null, steps: [], motion: "", part: null, scoreAfter: null, aiPrompt: "" });
    expect(cleanFixExtras({ priority: "urgent", end: 4, evidence: { confidence: "certain" } }, 2, 4, 30)).toMatchObject({ priority: "medium", end: null, evidence: { confidence: "low" } });
    // A fix with no time has no range, whatever the model sent.
    expect(cleanFixExtras({ end: 8 }, 1, null, 30).end).toBeNull();
  });
  it("orders fixes by priority and keeps the model's order inside one", () => {
    const fixes = [{ n: 1, priority: "medium" as const }, { n: 2, priority: "experiment" as const }, { n: 3, priority: "critical" as const }, { n: 4, priority: "medium" as const }, { n: 5 }];
    expect(byPriority(fixes).map((f) => f.n)).toEqual([3, 1, 4, 5, 2]);
  });
});

describe("cuts the editor may really make", () => {
  it("drops zero-length, backwards, too-short and out-of-video ranges", () => {
    const edits = [{ start: 0, end: 0, reason: "a" }, { start: 9, end: 8, reason: "b" }, { start: 3, end: 3.1, reason: "c" }, { start: 6.2, end: 7.9, reason: "d" }, { start: 28, end: 40, reason: "e" }, { start: 31, end: 35, reason: "f" }, "junk", null];
    expect(validCuts(edits, 30)).toEqual([{ start: 6.2, end: 7.9, reason: "d" }, { start: 28, end: 30, reason: "e" }]);
    expect(validCuts(undefined, 30)).toEqual([]);
  });
  it("never labels a short range 0:00 to 0:00", () => {
    expect(fmtSpan(0.2, 0.8)).toBe("0.2s to 0.8s");
    expect(fmtSpan(28, 34)).toBe("0:28 to 0:34");
  });
});

describe("the comparison with competitors", () => {
  it("cites only posts that were shown to the model", () => {
    expect(citedIds([" r1 ", "R9", "W1", "R2", "R1", 4], posts)).toEqual(["R1", "R2"]);
  });
  it("is null with no posts on file or no rows, whatever the model wrote", () => {
    const raw = { rows: [{ label: "Opening", current: "Black frame", theirs: "The payoff", verdict: "worse", refs: ["R1"] }], takeaways: ["Open on the payoff."], summary: "They show the result first." };
    expect(cleanCompetitors(raw, [], "x")).toBeNull();
    expect(cleanCompetitors({ rows: [] }, posts, "x")).toBeNull();
    const c = cleanCompetitors(raw, posts, "2 Reels that took off")!;
    expect(c.rows).toEqual([{ label: "Opening", current: "Black frame", theirs: "The payoff", verdict: "worse", refs: ["R1"] }]);
    expect(c.posts).toBe(posts);
    expect(c.basis).toBe("2 Reels that took off");
  });
  it("treats an unknown verdict as unknown and drops rows with nothing in them", () => {
    const c = cleanCompetitors({ rows: [{ label: "Length", current: "30 s", theirs: "", verdict: "amazing", refs: ["R7"] }, { label: "", current: "x", theirs: "y" }, { label: "Ask", current: "", theirs: "" }] }, posts, "x")!;
    expect(c.rows).toEqual([{ label: "Length", current: "30 s", theirs: "", verdict: "unknown", refs: [] }]);
  });
});

describe("experiments and directions", () => {
  it("keeps an experiment only when it says how to test it", () => {
    expect(cleanExperiments([{ title: "Test library music", hypothesis: "h", basis: "3 posts against 7", how: "Next three Reels" }, { title: "No method" }, null])).toEqual([{ title: "Test library music", hypothesis: "h", basis: "3 posts against 7", how: "Next three Reels" }]);
  });
  it("gives three directions at most, with exactly one to test first", () => {
    const d = (name: string, testFirst: boolean) => ({ name, approach: "a", opening: `${name} opening`, storyboard: [{ at: "0 to 2s", shot: "The comparison", say: "Line" }, { shot: "" }], lengthSec: 28, bestFor: "b", tradeoff: "t", evidence: "e", testFirst });
    const out = cleanDirections([d("Proof first", false), d("Problem first", true), d("Demo first", true), d("Fourth", false), { name: "No opening" }]);
    expect(out.map((x) => [x.name, x.testFirst])).toEqual([["Proof first", false], ["Problem first", true], ["Demo first", false]]);
    expect(out[0].storyboard).toEqual([{ at: "0 to 2s", shot: "The comparison", say: "Line" }]);
    // None marked: the first listed is the one to test first.
    expect(cleanDirections([d("A", false), d("B", false)]).map((x) => x.testFirst)).toEqual([true, false]);
    expect(directionText(out[0])).toContain("Opening: Proof first opening");
    expect(directionText(out[0])).toContain('0 to 2s: The comparison Say: "Line"');
  });
  it("replaces em dashes the model wrote", () => {
    expect(cleanExperiments([{ title: "Test music — quietly", how: "Next three" }])[0].title).toBe("Test music, quietly");
  });
});

describe("the full plan for a fix", () => {
  const scores = { hook: 58, cta: 52, audio: null };
  it("keeps the steps, the motion and the prompt, bounded", () => {
    const x = cleanFixExtras({ steps: ["At 0.0s, put the line up.", "", 4, "Hold it to 2.0s."], motion: "Pops in over 0.2 s.", aiPrompt: "Vertical 9:16 close-up." }, 0, 0, 10, scores);
    expect(x.steps).toEqual(["At 0.0s, put the line up.", "Hold it to 2.0s."]);
    expect(x.motion).toBe("Pops in over 0.2 s.");
    expect(x.aiPrompt).toBe("Vertical 9:16 close-up.");
  });
  it("accepts an estimate only when it lifts a part that was scored, by what one edit can earn", () => {
    expect(cleanFixExtras({ part: "hook", scoreAfter: 74 }, 0, 0, 10, scores)).toMatchObject({ part: "hook", scoreAfter: 74 });
    expect(cleanFixExtras({ part: "hook", scoreAfter: 99 }, 0, 0, 10, scores).scoreAfter).toBe(88);
    expect(cleanFixExtras({ part: "hook", scoreAfter: 40 }, 0, 0, 10, scores)).toMatchObject({ part: null, scoreAfter: null });
    expect(cleanFixExtras({ part: "audio", scoreAfter: 80 }, 0, 0, 10, scores)).toMatchObject({ part: null, scoreAfter: null });
    expect(cleanFixExtras({ part: "views", kind: "ending", scoreAfter: 70 }, 0, 0, 10, scores)).toMatchObject({ part: "cta", scoreAfter: 70 });
    expect(cleanFixExtras({ part: "hook" }, 0, 0, 10, scores)).toMatchObject({ part: null, scoreAfter: null });
  });
  it("estimates the whole score from each part's largest gain, averaged over the parts scored", () => {
    const categories = [{ id: "hook", score: 58 }, { id: "cta", score: 52 }, { id: "audio", score: null }, { id: "goal", score: 70 }];
    const a = { score: { overall: 60 }, categories, topFixes: [{ part: "hook", scoreAfter: 76 }, { part: "hook", scoreAfter: 70 }, { part: "cta", scoreAfter: 64 }] };
    expect(scoreAfterEdits(a)).toBe(70);
    expect(scoreAfterEdits({ ...a, topFixes: [{ part: null, scoreAfter: null }] })).toBeNull();
    expect(scoreAfterEdits({ ...a, score: { overall: 99 } })).toBe(100);
  });
});
