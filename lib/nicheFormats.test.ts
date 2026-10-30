import { describe, it, expect } from "vitest";
import { buildFormats, examplesFrom, formatBasis, formatBrief, type RawFormat } from "./nicheFormats";

const now = new Date("2026-10-29T12:00:00Z");
const day = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const yt = (i: number, account: string, mult: number | null, extra: Record<string, unknown> = {}) => ({
  content_url: `https://youtube.com/watch?v=vid${String(i).padStart(4, "0")}`, platform: "youtube", data_source: "youtube_api",
  account_name: account, title: `Pizza video ${i}`, thumbnail_url: null, views: 1000 * i, likes: 10, comments: 2, published_at: day(i), multiplier: mult, ...extra,
});

describe("examplesFrom", () => {
  it("keeps only posts with published numbers, from the last six months, never the brand's own", () => {
    const ex = examplesFrom({
      now,
      content: [
        yt(1, "Pizza Lab", 2.4),
        { ...yt(2, "Web Find", null), data_source: "web_research", views: null },
        yt(3, "Old Channel", 1.1, { published_at: day(400) }),
        yt(4, "Salvo's Pizza", 3),
      ],
      instagram: [],
      durations: new Map([["vid0001", 34]]),
      isOwn: (h) => h === "Salvo's Pizza",
    });
    expect(ex.map((e) => e.account)).toEqual(["Pizza Lab"]);
    expect(ex[0].durationSec).toBe(34);
    expect(ex[0].id).toBe(0);
  });

  it("gives an Instagram post a baseline only when its account has five posts with numbers", () => {
    const media = (n: number) => Array.from({ length: n }, (_, i) => ({ permalink: `https://instagram.com/p/${n}x${i}`, caption: `Cap ${i}`, thumbnail: null, likes: 100 + i * 10, comments: 5, timestamp: day(i + 1) }));
    const ex = examplesFrom({ now, content: [], instagram: [{ handle: "five", found: true, media: media(5) }, { handle: "two", found: true, media: media(2) }] });
    expect(ex.filter((e) => e.account === "@five").every((e) => e.multiplier != null)).toBe(true);
    expect(ex.filter((e) => e.account === "@two").every((e) => e.multiplier == null)).toBe(true);
  });
});

describe("buildFormats", () => {
  const ex = examplesFrom({ now, instagram: [], content: [yt(1, "A", 2.5), yt(2, "B", 1.8), yt(3, "A", 1.4), yt(4, "C", 0.6), yt(5, "A", 0.9), yt(6, "A", 0.8), yt(7, "A", 1.2)] });
  const raw = (over: Partial<RawFormat>): RawFormat => ({ name: "One-take build", summary: "A dish start to finish.", steps: ["Dough", "Bake"], hooks: ["Watch this"], filming: ["One angle"], length: "30 to 45 s", adaptations: ["Film the Friday special"], example_ids: [], ...over });

  it("keeps a format with three examples from two accounts and recomputes its numbers from them", () => {
    const { formats, unassigned } = buildFormats([raw({ example_ids: [0, 1, 2, 999] })], ex);
    expect(formats).toHaveLength(1);
    const f = formats[0];
    expect(f.stats).toMatchObject({ examples: 3, accounts: 2, withBaseline: 3, aboveBaseline: 3, medianMultiplier: 1.8 });
    expect(f.leads).toBe(true);
    expect(f.examples[0].multiplier).toBe(2.5);
    expect(unassigned).toBe(4);
  });

  it("drops a format from one account, or with too few examples, and never counts an example twice", () => {
    const { formats } = buildFormats([
      raw({ name: "Solo", example_ids: [4, 5, 6] }), // all account A
      raw({ name: "Thin", example_ids: [0, 3] }),
      raw({ name: "First", example_ids: [0, 1, 3] }),
      raw({ name: "Second", example_ids: [0, 1, 2] }), // 0 and 1 already used
    ], ex);
    expect(formats.map((f) => f.name)).toEqual(["First"]);
  });

  it("doesn't call a format leading without baselines, and says so in its basis", () => {
    const noBase = examplesFrom({ now, instagram: [], content: [yt(1, "A", null), yt(2, "B", null), yt(3, "C", null)] });
    const { formats } = buildFormats([raw({ example_ids: [0, 1, 2] })], noBase);
    expect(formats[0].leads).toBe(false);
    expect(formatBasis(formats[0])).toMatch(/None has a creator baseline/);
    expect(formatBrief(formats[0])).toMatch(/don't copy the video/);
  });
});
