import { describe, it, expect } from "vitest";
import { growthBriefing, goalLine, nextActions, recentLearning, whatWorks } from "./overview";
import type { AccountSample, SamplePost } from "./accountSample";
import type { StoredInsight } from "./insight";

const NOW = new Date("2026-10-29T18:00:00Z");
const p = (format: string, value: number, i: number): SamplePost => ({ platform: "youtube", id: `v${format}${i}`, date: null, format, text: "x", metric: { name: "views", value } });
const sample = (posts: SamplePost[]): AccountSample => ({
  facts: [{ platform: "youtube", handle: "@salvos", followers: 359, bio: null, postsSampled: posts.length, postsLast30: 4, postsPerWeek: 0.9, formats: [], standouts: [] }],
  posts,
});
const insight = (over: Partial<StoredInsight> = {}): StoredInsight => ({
  id: "i1", fingerprint: "f", producer: "overview", category: "content", platform: "instagram", title: "Reels are your strongest format", observation: "Reels earn 2x",
  metrics: [], posts: [], periodStart: null, periodEnd: null, explanations: [], confidence: 60, limitations: [],
  recommendation: { action: "Make two thirds of next week Reels", why: "Reels: median 200 vs 100", learning: "Whether the lead holds", href: "/tool" },
  source: { rule: "overview.format", data: [], retrievedAt: null }, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lastSeenAt: NOW.toISOString(), ...over,
});

describe("whatWorks", () => {
  it("compares formats with the account's own median, only on fair samples", () => {
    const posts = [p("Short", 300, 1), p("Short", 400, 2), p("Short", 500, 3), p("Video", 100, 1), p("Video", 80, 2), p("Video", 120, 3)];
    const rows = whatWorks(sample(posts));
    expect(rows.map((r) => [r.format, r.posts])).toEqual([["Short", 3], ["Video", 3]]);
    expect(rows[0].multiple).toBeGreaterThan(1);
    expect(whatWorks(sample(posts.slice(0, 5)))).toEqual([]);
    expect(whatWorks(sample([...posts.slice(0, 3), p("Short", 1, 4), p("Short", 1, 5), p("Short", 1, 6)]))).toEqual([]);
  });
});

describe("growthBriefing", () => {
  it("states only what it can source, and lists what's missing", () => {
    const posts = [p("Short", 300, 1), p("Short", 400, 2), p("Short", 500, 3), p("Video", 100, 1), p("Video", 80, 2), p("Video", 120, 3)];
    const s = sample(posts);
    const b = growthBriefing({ brandName: "Salvo's Pizza", niche: "Food & Restaurant", growth: { niche_path: { subcategory: "Pizza" } }, sample: s, works: whatWorks(s), insights: [], goalLine: null });
    expect(b.lines[0].text).toBe("Salvo's Pizza (Pizza) on YouTube, posting about 0.9 times a week lately.");
    expect(b.lines[1].text).toMatch(/^Shorts are doing best on YouTube: their median views per post is \d/);
    expect(b.missing).toContain("No main goal is set, so recommendations aren't weighted toward one.");
  });

  it("with nothing connected says so instead of inventing a summary", () => {
    const b = growthBriefing({ brandName: null, niche: null, growth: null, sample: { facts: [], posts: [] }, works: [], insights: [], goalLine: null });
    expect(b.lines).toEqual([]);
    expect(b.missing[0]).toMatch(/No account is connected/);
  });

  it("puts a diagnostic finding forward", () => {
    const s = sample([]);
    const b = growthBriefing({ brandName: "A", niche: null, growth: { main_goal: "views" }, sample: s, works: [], insights: [insight({ category: "diagnostic", title: "\"Dough\" is reporting zero views" })], goalLine: "Main goal: Increase views." });
    expect(b.lines.map((l) => l.text)).toContain("Needs a look: \"Dough\" is reporting zero views.");
    expect(b.lines.at(-1)?.text).toBe("Main goal: Increase views.");
  });
});

describe("goalLine", () => {
  it("reads the goal with its current reading when there is one", () => {
    expect(goalLine({ main_goal: "followers" }, null)).toBe("Main goal: Gain followers.");
    expect(goalLine(null, { label: "Followers or subscribers", current: "1,240", remaining: "760", due: "Dec 31, 2026" })).toBe("Main goal: Followers or subscribers. 1,240 now, 760 to go by Dec 31, 2026.");
    expect(goalLine(null, null)).toBeNull();
  });
});

describe("nextActions", () => {
  const base = { connectedCount: 1, goalPlatformMissing: null, planThisWeek: true, scheduledSoon: 2, trackedCompetitors: 3 };
  it("leads with diagnostics, then findings by confidence, then setup gaps, three at most", () => {
    const a = nextActions({ ...base, planThisWeek: false, insights: [insight({ id: "c", confidence: 70 }), insight({ id: "d", category: "diagnostic", recommendation: { action: "Check the reel is public", why: "w", learning: "l", href: null } })] });
    expect(a.map((x) => x.title)).toEqual(["Check the reel is public", "Make two thirds of next week Reels", "Make this week's plan"]);
    expect(a[0].href).toBe("/analytics");
  });
  it("asks to connect first when nothing is connected", () => {
    expect(nextActions({ ...base, connectedCount: 0, insights: [] })[0].title).toBe("Connect an account");
  });
});

describe("recentLearning", () => {
  it("lists the plan result and this week's new and ended findings", () => {
    const old = new Date(NOW.getTime() - 20 * 86_400_000).toISOString();
    const lines = recentLearning({ planOutcome: "2 of 4 posted", planAt: old, active: [insight(), insight({ id: "x", createdAt: old })], ended: [insight({ title: "Posting dropped", status: "superseded" })], now: NOW });
    expect(lines.map((l) => l.kind)).toEqual(["plan", "new", "ended"]);
  });
});
