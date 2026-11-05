import { describe, it, expect } from "vitest";
import { anglesGap, nicheToTry, worksByAngle } from "./angles";
import type { AccountSample, SamplePost } from "./accountSample";
import type { TrendGroup, TrendSignals } from "../trendSignals";

let n = 0;
const reel = (text: string, value: number): SamplePost => ({ platform: "instagram", id: `r${n++}`, date: null, format: "Reel", text, metric: { name: "views", value } });
const sample = (posts: SamplePost[]): AccountSample => ({ facts: [], posts });
const group = (kind: "hook" | "topic", label: string, multiple: number, leads: boolean): TrendGroup => ({
  label, kind, posts: 6, accounts: 3, withBaseline: 6, aboveBaseline: 4, medianMultiplier: multiple, leads, examples: [],
});
const niche = (groups: TrendGroup[]): TrendSignals => ({
  reelsRead: 40, accounts: 8, strongLines: [],
  hooks: groups.filter((g) => g.kind === "hook"), topics: groups.filter((g) => g.kind === "topic"),
});

// A Reels-only account: the format comparison has nothing to compare, this does.
const reels = [
  reel("Why do we let the dough rest for two days?", 900),
  reel("Why is our crust so crispy?", 1100),
  reel("Is this the biggest slice in Nashville?", 1000),
  reel("Behind the scenes in our kitchen before we open", 300),
  reel("Behind the scenes on a Friday rush", 250),
  reel("Behind the scenes with the late shift", 350),
  reel("Hot slice, cold drink, good night", 400),
  reel("Saturday special is back", 500),
];

describe("what works by hook and topic", () => {
  it("compares a Reels-only account's openings and topics with its own median", () => {
    const rows = worksByAngle(sample(reels));
    const q = rows.find((r) => r.kind === "hook" && r.label === "Question")!;
    const bts = rows.find((r) => r.kind === "topic" && r.label === "Behind the scenes")!;
    expect(q).toMatchObject({ posts: 3, metric: "views", niche: null });
    expect(q.multiple).toBeGreaterThan(1);
    expect(bts.posts).toBe(3);
    expect(bts.multiple).toBeLessThan(1);
    expect(rows[0].multiple).toBeGreaterThanOrEqual(rows[rows.length - 1].multiple);
  });

  it("only compares fair samples: 6 posts on the platform, 3 with the angle, and some without it", () => {
    expect(worksByAngle(sample(reels.slice(0, 5)))).toEqual([]);
    const allQuestions = Array.from({ length: 6 }, (_, i) => reel(`Why does slice number ${i} taste better?`, 100 + i));
    expect(worksByAngle(sample(allQuestions)).filter((r) => r.label === "Question")).toEqual([]);
  });

  it("says how each one does in the niche, and lists what leads there that the account hasn't tried", () => {
    const read = niche([group("hook", "Question", 2.1, true), group("hook", "POV", 3.4, true), group("topic", "Customer reactions", 1.8, true), group("topic", "Behind the scenes", 0.9, false), group("hook", "Superlative", 1.1, false)]);
    const rows = worksByAngle(sample(reels), { niche: read });
    expect(rows.find((r) => r.label === "Question")!.niche).toEqual({ leads: true, multiple: 2.1, posts: 6, accounts: 3 });
    expect(rows.find((r) => r.label === "Behind the scenes")!.niche).toMatchObject({ leads: false });
    // Leading, unused, best first; a leading hook the account already uses and a group that doesn't lead are left out.
    expect(nicheToTry(sample(reels), read).map((t) => t.label)).toEqual(["POV", "Customer reactions"]);
    expect(nicheToTry(sample(reels), null)).toEqual([]);
  });

  it("explains an empty comparison from the account's own counts", () => {
    expect(anglesGap(sample(reels.slice(0, 4)))).toMatch(/from 6 posts/);
    const plain = Array.from({ length: 6 }, (_, i) => reel(`Slice ${i}`, 100));
    expect(anglesGap(sample(plain))).toMatch(/couldn't tell how your posts open/);
  });
});
