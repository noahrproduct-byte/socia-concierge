import { describe, it, expect } from "vitest";
import { FEED_BADGE, feedPage, feedScore, mentions, mergeFeed, nicheWords, withRelated, type FeedReel, type FeedSource } from "./discoverFeed";
import { poolFromRows, trendingFor } from "./discoverTrending";
import { ADAPTATIONS_PER_REEL, ADAPTED_KEPT, adaptTask, adaptationText, cleanAdaptation, profileKey, reelFacts, sanitizeAdaptStore, storeWith } from "./discoverAdapt";
import { businessFrom, reelFrom } from "./discoverAdaptServer";

const NOW = new Date("2026-11-24T12:00:00Z");
let n = 0;
const reel = (source: FeedSource, handle: string, extra: Partial<FeedReel> = {}): FeedReel => ({
  url: `https://www.instagram.com/reel/AAA${n++}xyz/`, platform: "instagram", accountName: handle, accountHandle: handle, accountAvatar: null,
  title: `Line ${n}`, thumb: null, publishedAt: "2026-11-20T00:00:00Z", views: 40000, likes: 1000, comments: 50, multiplier: 3, basis: "views", format: "Reel",
  id: "R1", proven: true, line: null, structures: [], topics: [], source, ...extra,
} as FeedReel);

describe("Recommended for you", () => {
  it("ranks competitors' Reels first when they did as well, and keeps each Reel once with its best source", () => {
    const a = reel("niche", "pizzaplace");
    const same = { ...a, source: "competitor" as const };
    const out = mergeFeed([[reel("similar", "far")], [a], [same], [reel("competitor", "rival")]], NOW);
    expect(out.filter((r) => r.url === a.url)).toHaveLength(1);
    expect(out.find((r) => r.url === a.url)!.source).toBe("competitor");
    expect(out[out.length - 1].source).toBe("similar");
  });
  it("shows at most two per account and never the same video twice", () => {
    const list = [reel("competitor", "one"), reel("competitor", "one"), reel("competitor", "one"), reel("competitor", "two", { title: "Same" }), reel("competitor", "two", { title: "Same" })];
    const out = mergeFeed([list], NOW);
    expect(out.filter((r) => r.accountHandle === "one")).toHaveLength(2);
    expect(out.filter((r) => r.accountHandle === "two")).toHaveLength(1);
  });
  it("weighs how far a Reel went past its usual and how recent it is", () => {
    expect(feedScore(reel("niche", "a", { multiplier: 20 }), NOW)).toBeGreaterThan(feedScore(reel("niche", "b", { multiplier: 1.2 }), NOW));
    expect(feedScore(reel("niche", "a", { publishedAt: "2026-11-23T00:00:00Z" }), NOW)).toBeGreaterThan(feedScore(reel("niche", "a", { publishedAt: "2026-10-26T00:00:00Z" }), NOW));
  });
  it("tops up with related businesses when it runs short, by the words of the niche", () => {
    expect(nicheWords("Pizza restaurant & local business")).toEqual(["pizza", "restaurant"]);
    expect(mentions(reel("trending", "joes_pizza_nyc"), ["pizza"])).toBe(true);
    expect(mentions(reel("trending", "fashionhouse", { title: "Three outfits" }), ["pizza"])).toBe(false);
    const pool = [reel("trending", "joes_pizza_nyc"), reel("trending", "fashionhouse", { title: "Three outfits" })];
    const out = withRelated([reel("competitor", "rival")], pool, "Pizza restaurant", NOW);
    expect(out.map((r) => [r.accountHandle, r.source])).toEqual([["rival", "competitor"], ["joes_pizza_nyc", "related"]]);
    expect(FEED_BADGE.related).toBe("Related business");
  });
  it("pages twelve at a time", () => {
    const list = Array.from({ length: 30 }, (_, i) => i);
    expect(feedPage(list, 0)).toEqual({ reels: list.slice(0, 12), next: 12 });
    expect(feedPage(list, 24)).toEqual({ reels: list.slice(24), next: null });
  });
});

describe("Trending", () => {
  const media = (views: number, i: number) => ({ permalink: `https://www.instagram.com/reel/T${i}abcd/`, caption: `Reel ${i}`, thumbnail: null, likes: 10, comments: 1, timestamp: "2026-11-20T00:00:00Z", mediaType: "VIDEO", views });
  it("keeps only viral Reels, the latest read of each account, two per account", () => {
    const rows = [
      { handle: "Fashion", display_name: "Fashion", profile_picture: null, followers: 1000, media: [media(90000, 1), media(80000, 2), media(70000, 3), media(500, 4), media(400, 5), media(300, 6)], fetched_at: "2026-11-23T00:00:00Z" },
      { handle: "fashion", display_name: "Old read", profile_picture: null, followers: 1000, media: [], fetched_at: "2026-11-01T00:00:00Z" },
      { handle: "quiet", display_name: "Quiet", profile_picture: null, followers: 1000, media: [media(900, 7), media(800, 8), media(700, 9)], fetched_at: "2026-11-23T00:00:00Z" },
    ];
    const pool = poolFromRows(rows, NOW);
    expect(pool.every((r) => r.source === "trending" && (r.views ?? 0) >= 15000)).toBe(true);
    expect(pool).toHaveLength(2);
    expect(pool[0].accountName).toBe("Fashion");
  });
  it("never shows the brand's own account or a Reel already recommended", () => {
    const pool = [reel("trending", "mine"), reel("trending", "other"), reel("trending", "third")];
    const mine = { keys: new Set(["mine"]), ids: new Set<string>(), handles: ["mine"] };
    const skip = new Set([pool[2].url]);
    expect(trendingFor(pool, { mine, skip }).map((r) => r.accountHandle)).toEqual(["other"]);
  });
});

describe("Adapt to my business", () => {
  const raw = { concept: "Three pizzas — three moods", hook: "Your mood picks your pizza", keeps: "Fast cuts between three options", steps: ["Set the phone on a stand", "Film each pizza for two seconds"], shots: ["Top down, close"], editing: "Cut on the beat", onScreenText: ["Tired"], cta: "Which one are you?", durationSec: 400, why: "Variety and a question" };
  it("makes the answer safe: no em dashes, a sensible length, needs a concept and steps", () => {
    const a = cleanAdaptation(raw, NOW)!;
    expect(a.concept).toBe("Three pizzas, three moods");
    expect(a.durationSec).toBe(60);
    expect(cleanAdaptation({ ...raw, steps: ["one"] }, NOW)).toBeNull();
  });
  it("tells the model only what SOCIA knows of the original", () => {
    const facts = reelFacts(reel("trending", "fashion", { title: "Three outfits, one mood each", multiplier: 12, structures: ["Listicle hook"] }), false);
    expect(facts).toContain("Caption (first line): Three outfits, one mood each");
    expect(facts).toContain("About 12 times that account's usual views");
    expect(facts).toContain("No cover image is available.");
    const task = adaptTask(facts, ["Niche: Pizza"], [cleanAdaptation(raw, NOW)!]);
    expect(task).toContain("write a clearly different one");
  });
  it("is cached per business profile, at most three per Reel, forty Reels kept", () => {
    const a = cleanAdaptation(raw, NOW)!;
    expect(profileKey(["Niche: Pizza"])).not.toBe(profileKey(["Niche: Tacos"]));
    let s = {};
    for (let i = 0; i < ADAPTED_KEPT + 5; i++) s = storeWith(s, `key${i}abc`, "p1", [a, a, a, a], new Date(NOW.getTime() + i * 1000));
    const clean = sanitizeAdaptStore(s);
    expect(Object.keys(clean)).toHaveLength(ADAPTED_KEPT);
    expect(Object.values(clean)[0].versions).toHaveLength(ADAPTATIONS_PER_REEL);
    expect(clean.key0abc).toBeUndefined();
  });
  it("reads the business and the Reel the page sends, bounded", () => {
    expect(businessFrom({ description: "Neapolitan pizza in Nashville", location: "Nashville" } as never, "Pizza restaurant", "Salvo's")).toEqual(expect.arrayContaining(["What the account is: Neapolitan pizza in Nashville", "Niche: Pizza restaurant", "Location: Nashville"]));
    expect(reelFrom({ url: "https://evil.example/x" })).toBeNull();
    const r = reelFrom({ url: "https://www.instagram.com/reel/ABCD123/", accountHandle: "fashion", views: 90000, title: "x".repeat(900), structures: ["a", 2] })!;
    expect(r.title!.length).toBe(300);
    expect(r.structures).toEqual(["a"]);
  });
  it("writes a brief that names the original and every step", () => {
    const text = adaptationText(cleanAdaptation(raw, NOW)!, { accountName: "Fashion", accountHandle: "fashion", format: "Reel", url: "https://www.instagram.com/reel/ABCD/" });
    expect(text).toContain("1. Set the phone on a stand");
    expect(text).toContain("Adapted from a Reel by @fashion");
  });
});
