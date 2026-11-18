import { beforeEach, describe, expect, it, vi } from "vitest";

const yt = vi.hoisted(() => ({ on: true, search: vi.fn(), avg: vi.fn(), byId: vi.fn() }));
vi.mock("@/lib/youtube", () => ({
  ytConfigured: () => yt.on,
  researchVideos: yt.search,
  channelAverages: yt.avg,
  videoById: yt.byId,
  youtubeVideoId: (u: string) => /youtu\.be\/([\w-]+)/.exec(u)?.[1] ?? null,
}));
const niche = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/trendSignalsLoad", () => ({ loadCachedNicheRead: niche.read }));

import { gatherResearch } from "./gather";
import { planSources, type ResearchIntent } from "./intent";

const intent = (o: Partial<ResearchIntent> = {}): ResearchIntent => ({ kind: "create_content", goal: "win customers", topic: "founder pitch saas", format: "talking head", platform: "instagram", audience: "", outcome: "", queries: ["founder saas pitch"], ...o });
const run = (i: ResearchIntent, question = "pitch my app") => gatherResearch({ client: {}, ownerId: "u", scopeId: null, question, intent: i, plan: planSources(i, { linkInQuestion: /https?:/.test(question) }), now: new Date("2026-11-17T12:00:00Z") });

beforeEach(() => {
  yt.on = true;
  yt.search.mockReset().mockResolvedValue([
    { videoId: "a", title: "Founder pitches his SaaS in 30s", publishedAt: "2026-09-01T00:00:00Z", thumb: "t", views: 120000, likes: 4000, comments: 90, durationSec: 31, channelId: "c1", channelTitle: "Indie Hackers", url: "https://youtube.com/shorts/a" },
  ]);
  yt.avg.mockReset().mockResolvedValue(new Map([["c1", 20000]]));
  yt.byId.mockReset();
  niche.read.mockReset().mockResolvedValue(null);
});

describe("gatherResearch", () => {
  it("finds real YouTube examples with the channel's usual to compare against", async () => {
    const r = await run(intent());
    expect(r.examples).toHaveLength(1);
    expect(r.examples[0]).toMatchObject({ ref: "R1", views: 120000, vsUsual: 6, usualBasis: "this channel's average views per video" });
    expect(r.evidence).toContain("[R1]");
    expect(r.notes.join(" ")).toContain('Searched YouTube for "founder saas pitch"');
    expect(yt.search).toHaveBeenCalledWith("founder saas pitch", { short: true, days: 365 });
  });

  it("reuses the same search within hours instead of spending quota again", async () => {
    await run(intent({ queries: ["same query"] }));
    await run(intent({ queries: ["same query"] }));
    expect(yt.search).toHaveBeenCalledTimes(1);
  });

  it("says plainly when public search isn't set up, and tells the model none were found", async () => {
    yt.on = false;
    const r = await run(intent({ queries: ["other query"] }));
    expect(r.examples).toEqual([]);
    expect(r.notes[0]).toMatch(/isn't set up/);
    expect(r.evidence).toContain("None were found");
    expect(yt.search).not.toHaveBeenCalled();
  });

  it("an Instagram link is not pretended to be read", async () => {
    const r = await run(intent({ kind: "reference_style", queries: [] }), "recreate this https://www.instagram.com/reel/XYZ/");
    expect(r.reference).toMatchObject({ platform: "instagram", readable: false });
    expect(r.notes.join(" ")).toMatch(/can't open Instagram videos/);
  });

  it("a YouTube link is read from its public details, and says it wasn't watched", async () => {
    yt.byId.mockResolvedValue({ videoId: "v1", title: "My edit", channelTitle: "Ed", views: 900, durationSec: 40, description: null, tags: [] });
    const r = await run(intent({ kind: "reference_style", queries: [] }), "like this https://youtu.be/v1");
    expect(r.reference).toMatchObject({ readable: true, title: "My edit" });
    expect(r.evidence).toContain("did not watch the video");
  });

  it("an account question runs no outside research at all", async () => {
    const i = intent({ kind: "own_performance", queries: [] });
    const r = await gatherResearch({ client: {}, ownerId: "u", scopeId: null, question: "why did my views drop", intent: i, plan: planSources(i) });
    expect(r.examples).toEqual([]);
    expect(r.notes).toEqual([]);
    expect(yt.search).not.toHaveBeenCalled();
    expect(niche.read).not.toHaveBeenCalled();
  });
});
