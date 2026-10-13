import { describe, it, expect } from "vitest";
import { normalizeText, sameText, youtubeTitle, repurposeCandidates, MAX_CANDIDATES, type RepurposePost, type SociaPost } from "./repurpose";

const NOW = new Date("2026-10-13T15:00:00Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
let n = 0;
const ig = (over: Partial<RepurposePost> = {}): RepurposePost => {
  const id = `m${++n}`;
  return {
    ref: { kind: "instagram", id }, platform: "instagram", externalId: id,
    caption: "Pumpkin latte is back for the season, made with real pumpkin #fall", kind: "video", format: "Reel",
    thumb: null, permalink: `https://instagram.com/reel/${id}`, postedAt: daysAgo(5),
    multiplier: 2.4, sample: 20, metric: "interactions", ...over,
  };
};
const run = (posts: RepurposePost[], over: { socia?: SociaPost[]; texts?: Parameters<typeof repurposeCandidates>[0]["texts"]; connected?: Parameters<typeof repurposeCandidates>[0]["connected"] } = {}) =>
  repurposeCandidates({ posts, socia: over.socia ?? [], texts: over.texts ?? { tiktok: [], youtube: [] }, connected: over.connected ?? ["instagram", "tiktok", "youtube"], now: NOW });

describe("text matching", () => {
  it("reduces captions to their words", () => {
    expect(normalizeText("Pumpkin latte is BACK! 🎃 #fall @salvos https://x.co/a")).toBe("pumpkin latte is back");
  });

  it("matches the same words, a title that starts the caption, and nothing too short", () => {
    expect(sameText("Pumpkin latte is back for the season!! #fall", "pumpkin latte is back for the season, made with real pumpkin")).toBe(true);
    expect(sameText("Pumpkin latte is back for the season", "Our new menu: tacos every Tuesday")).toBe(false);
    expect(sameText("New drop", "New drop")).toBe(false);
  });

  it("makes a YouTube title from the first line, within 100 characters and without angle brackets", () => {
    expect(youtubeTitle("Pumpkin latte <3 is back\n\nCome by #fall")).toBe("Pumpkin latte 3 is back");
    const long = youtubeTitle(`${"word ".repeat(40)}end`);
    expect([...long].length).toBeLessThanOrEqual(100);
    expect(long.endsWith("…")).toBe(true);
    expect(youtubeTitle("#justtags")).toBe("#justtags");
    expect(youtubeTitle("")).toBe("");
  });
});

describe("repurposeCandidates", () => {
  it("offers a strong recent Reel for the connected platforms that take video, saying where SOCIA checked", () => {
    const [c] = run([ig()], { texts: { tiktok: ["Our new menu"], youtube: null } });
    expect(c.targets).toEqual(["tiktok", "youtube"]);
    expect(c.checked).toEqual(["tiktok"]); // YouTube couldn't be read: offered, not claimed
    expect(c).toMatchObject({ from: "instagram", multiplier: 2.4, sample: 20, title: "Pumpkin latte is back for the season, made with real pumpkin" });
  });

  it("needs a real lift, a real sample and the 90-day window", () => {
    expect(run([ig({ multiplier: 1.4 })])).toEqual([]);
    expect(run([ig({ sample: 4 })])).toEqual([]);
    expect(run([ig({ postedAt: daysAgo(91) })])).toEqual([]);
    expect(run([ig({ multiplier: 1.5 })])).toHaveLength(1);
  });

  it("skips platforms where the same caption already went out", () => {
    const [c] = run([ig()], { texts: { tiktok: ["pumpkin latte is back for the season, made with real pumpkin 🎃"], youtube: [] } });
    expect(c.targets).toEqual(["youtube"]);
    expect(run([ig()], { texts: { tiktok: ["Pumpkin latte is back for the season"], youtube: ["Pumpkin latte is back for the season"] } })).toEqual([]);
  });

  it("skips platforms SOCIA already sent it to or has it drafted for", () => {
    const sent: SociaPost = { id: "p1", caption: "", platforms: ["instagram", "tiktok"], externalIds: ["m-sent"] };
    const [c] = run([ig({ externalId: "m-sent" })], { socia: [sent] });
    expect(c.targets).toEqual(["youtube"]);
    const drafted: SociaPost = { id: "p2", caption: "Pumpkin latte is back for the season, made with real pumpkin", platforms: ["youtube"], externalIds: [] };
    expect(run([ig()], { socia: [drafted] })[0].targets).toEqual(["tiktok"]);
  });

  it("offers a photo only where photos can go", () => {
    expect(run([ig({ kind: "image", format: "Photo" })])).toEqual([]);
    const [c] = run([ig({ kind: "image", format: "Photo" })], { connected: ["instagram", "tiktok", "facebook"], texts: { facebook: [] } });
    expect(c.targets).toEqual(["facebook"]);
  });

  it("doesn't claim a check on a caption too short to match", () => {
    const [c] = run([ig({ caption: "Yum" })]);
    expect(c.targets).toEqual(["tiktok", "youtube"]);
    expect(c.checked).toEqual([]);
  });

  it("shows a post SOCIA sent to two platforms once, at its best result, ranked and capped", () => {
    const yt: RepurposePost = { ...ig({ multiplier: 3.1 }), ref: { kind: "post", id: "p9" }, platform: "youtube", externalId: "v9", metric: "views" };
    const igSide: RepurposePost = { ...ig({ multiplier: 1.8 }), ref: { kind: "post", id: "p9" }, externalId: "m9" };
    const socia: SociaPost[] = [{ id: "p9", caption: "", platforms: ["instagram", "youtube"], externalIds: ["m9", "v9"] }];
    const out = run([igSide, yt], { socia });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "post:p9", from: "youtube", multiplier: 3.1, metric: "views", targets: ["tiktok"] });

    const many = run(Array.from({ length: 8 }, (_, i) => ig({ multiplier: 1.6 + i / 10, caption: `Different post number ${i} with enough words` })));
    expect(many).toHaveLength(MAX_CANDIDATES);
    expect(many.map((c) => c.multiplier)).toEqual([2.3, 2.2, 2.1, 2, 1.9]);
  });

  it("returns nothing when no other platform is connected", () => {
    expect(run([ig()], { connected: ["instagram"] })).toEqual([]);
  });
});
