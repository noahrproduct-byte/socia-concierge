import { describe, expect, it } from "vitest";
import { accountLines, postLines, profileLines, readItems, reelLines } from "./readStages";
import type { AccountSample, PlatformFacts } from "./accountSample";
import type { Understanding } from "./understanding";

const facts = (over: Partial<PlatformFacts> = {}): PlatformFacts => ({ platform: "instagram", handle: "salvospizza", followers: 12091, bio: null, postsSampled: 20, postsLast30: 9, postsPerWeek: 2.1, formats: [], standouts: [], ...over });

describe("the account read's steps", () => {
  it("names each account with the count the platform returned", () => {
    expect(accountLines([facts(), facts({ platform: "youtube", handle: "@salvos", followers: 1 }), facts({ platform: "tiktok", handle: null, followers: null })])).toEqual([
      "@salvospizza on Instagram, 12,091 followers",
      "@salvos on YouTube, 1 subscriber",
      "Your account on TikTok",
    ]);
  });
  it("says how many posts were read and how often the account posts", () => {
    const sample: AccountSample = {
      facts: [facts()],
      posts: [
        { platform: "instagram", id: "1", date: null, format: "reel", text: "Fresh dough daily", metric: null },
        { platform: "instagram", id: "2", date: null, format: "reel", text: "", metric: null },
      ],
    };
    expect(postLines(sample)).toEqual(["2 recent posts read, 1 with a caption or title.", "Instagram: 9 posts in the last 30 days, about 2.1 a week."]);
    expect(postLines({ facts: [], posts: [] })).toEqual(["No posts came back from your accounts."]);
  });
  it("shows the person's own posts, never an invented one", () => {
    expect(readItems([{ caption: "Slice night #pizza\nmore", permalink: "https://x/p/1", thumbnail_url: "https://x/t.jpg", timestamp: "2026-11-10T10:00:00Z" }, { media_type: "IMAGE", media_url: "https://x/i.jpg" }])).toEqual([
      { thumb: "https://x/t.jpg", href: "https://x/p/1", label: "Slice night", note: "Nov 10" },
      { thumb: "https://x/i.jpg", href: null, label: "A post without a caption", note: "" },
    ]);
  });
  it("says when the Reels couldn't be watched", () => {
    expect(reelLines(null)[0]).toContain("couldn't watch your Reels");
    expect(reelLines({ read_at: "", reels: 6, about: null, formats: [{ name: "Oven shots" } as never], look: null, limitations: [] })).toEqual(["6 Reels watched.", "Kinds of video seen: Oven shots."]);
  });
  it("reports only what the read concluded", () => {
    const u = { niche: { value: { category: "Food & Restaurant", subcategory: "Pizza", specific: null }, confidence: 80, evidence: [] }, audience: { value: "Families nearby.", confidence: 60, evidence: [] } } as unknown as Understanding;
    expect(profileLines(u)).toEqual(["Niche: Food & Restaurant > Pizza.", "Audience: Families nearby."]);
    expect(profileLines({ niche: null, audience: null } as unknown as Understanding)[0]).toContain("Not enough to say");
  });
});
