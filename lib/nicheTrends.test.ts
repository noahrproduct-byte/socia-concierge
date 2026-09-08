import { describe, it, expect } from "vitest";
import { rankNiche, workingNow, momentum, pickOpportunity, baselineText, type NichePost } from "./nicheTrends";

const NOW = new Date("2026-09-07T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

const post = (o: Partial<NichePost> & { url: string }): NichePost => ({
  platform: "youtube", accountName: "A", accountHandle: "a", title: null, thumb: "t", views: 1000, likes: 10, comments: 1,
  publishedAt: ago(5), multiplier: 2, relevanceScore: 50, tags: [], format: "Short", why: null, dataSource: "youtube_api", ...o,
});

describe("rankNiche", () => {
  it("never lets raw views decide the order", () => {
    const giant = post({ url: "g", views: 20_000_000, multiplier: 1.1, relevanceScore: 40 });
    const peer = post({ url: "p", views: 8_000, multiplier: 6, relevanceScore: 70 });
    expect(rankNiche([giant, peer], { now: NOW, days: 90 }).map((p) => p.url)).toEqual(["p", "g"]);
  });
  it("puts posts without any verifiable evidence last", () => {
    const bare = post({ url: "b", views: null, multiplier: null, thumb: null, relevanceScore: 95, publishedAt: ago(1) });
    const real = post({ url: "r", relevanceScore: 30 });
    expect(rankNiche([bare, real], { now: NOW, days: 90 })[0].url).toBe("r");
  });
  it("drops undated posts from a dated window and keeps them for all time", () => {
    const undated = post({ url: "u", publishedAt: null });
    expect(rankNiche([undated], { now: NOW, days: 30 })).toHaveLength(0);
    expect(rankNiche([undated], { now: NOW, days: null })).toHaveLength(1);
  });
});

describe("workingNow", () => {
  const set = (n: number, tagEvery = 2) => Array.from({ length: n }, (_, i) =>
    post({ url: `p${i}`, multiplier: 10 - i * 0.5, tags: i % tagEvery === 0 ? ["Comparison"] : ["Tutorial"] }));
  it("refuses below ten posts with a baseline", () => {
    const r = workingNow(set(9));
    expect(r.insufficient).toBe(true);
    expect(r.rows).toEqual([]);
  });
  it("counts a pattern across the top posts and measures lift against the rest", () => {
    const r = workingNow(set(14));
    expect(r.insufficient).toBe(false);
    const cmp = r.rows.find((x) => x.tag === "Comparison")!;
    expect(cmp.seenIn).toBe(5);
    expect(cmp.of).toBe(10);
    expect(cmp.lift).not.toBeNull();
  });
  it("ignores style tags", () => {
    const xs = set(12).map((p) => ({ ...p, tags: [...p.tags, "Emoji in title"] }));
    expect(workingNow(xs).rows.some((r) => r.tag === "Emoji in title")).toBe(false);
  });
});

describe("momentum", () => {
  it("needs a real sample in both halves", () => {
    const xs = [post({ url: "a", publishedAt: ago(3), tags: ["POV"] }), post({ url: "b", publishedAt: ago(60), tags: ["POV"] })];
    expect(momentum(xs, { now: NOW }).insufficient).toBe(true);
  });
  it("calls a pattern emerging when it appears only recently, declining when it vanished", () => {
    const recent = Array.from({ length: 6 }, (_, i) => post({ url: `r${i}`, publishedAt: ago(2 + i), tags: i < 3 ? ["POV"] : ["Tutorial"] }));
    const earlier = Array.from({ length: 6 }, (_, i) => post({ url: `e${i}`, publishedAt: ago(50 + i), tags: i < 3 ? ["Comparison"] : ["Tutorial"] }));
    const m = momentum([...recent, ...earlier], { now: NOW });
    expect(m.insufficient).toBe(false);
    expect(m.up.find((r) => r.tag === "POV")?.status).toBe("Emerging");
    expect(m.down.find((r) => r.tag === "Comparison")?.status).toBe("Declining");
    expect(m.up.some((r) => r.tag === "Tutorial")).toBe(false);
  });
});

describe("pickOpportunity", () => {
  const working = { insufficient: false, baselineCount: 12, topCount: 10, minTop: 10, rows: [{ tag: "Catering / large orders", seenIn: 4, of: 10, lift: 1.8, withCount: 4, withoutCount: 8, example: post({ url: "x" }) }] };
  const quiet = { insufficient: true, recentCount: 0, earlierCount: 0, minPerHalf: 5, halfDays: 45, up: [], down: [] };
  it("needs at least two kinds of evidence", () => {
    expect(pickOpportunity({ working, momentum: quiet, competitor: null, own: [], goalKeywords: [] })).toBeNull();
  });
  it("combines niche performance with the user's own record", () => {
    const own = Array.from({ length: 6 }, () => ({ tags: ["Tutorial"], multiplier: 1 }));
    const o = pickOpportunity({ working, momentum: quiet, competitor: null, own, goalKeywords: [] });
    expect(o?.tag).toBe("Catering / large orders");
    expect(o?.why.map((w) => w.source)).toEqual(expect.arrayContaining(["niche", "you"]));
  });
  it("credits a competitor only when the pattern is a real share of their posts", () => {
    const o = pickOpportunity({ working, momentum: quiet, competitor: { name: "Patio", rows: [{ tag: "Catering / large orders", count: 4, total: 10 }] }, own: [], goalKeywords: [] });
    expect(o?.competitorName).toBe("Patio");
    const weak = pickOpportunity({ working, momentum: quiet, competitor: { name: "Patio", rows: [{ tag: "Catering / large orders", count: 1, total: 10 }] }, own: [], goalKeywords: [] });
    expect(weak).toBeNull();
  });
});

describe("baselineText", () => {
  it("recovers the creator median from the stored multiple", () => {
    const t = baselineText(post({ url: "b", views: 84200, multiplier: 12.3 }))!;
    expect(t.post).toBe("84,200 views");
    expect(t.median).toBe("6,846 views");
    expect(t.mult).toBe("12.3× baseline");
  });
});
