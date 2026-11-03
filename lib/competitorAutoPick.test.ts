import { describe, expect, it } from "vitest";
import { choosePicks, chooseUnverifiedPicks, fmtRate, pickReason, MIN_FOLLOWERS, PICKS_PER_RUN, UNVERIFIED_PICKS } from "./competitorAutoPick";
import type { ScoredAccount, Classification } from "./discovery";
import type { IgCompetitor } from "./igCompetitorData";

const cand = (handle: string, classification: Classification, relevanceScore: number, note: string | null = null): ScoredAccount => ({
  platform: "instagram", platformAccountId: handle, handle, displayName: handle, profileImage: null, profileUrl: null,
  followers: null, location: null, category: null, dataSource: "web_research", note,
  classification, relevanceScore, relevanceReasons: ["Same niche"],
});
const ig = (handle: string, followers: number | null, engagementRate: number | null = null, found = true): IgCompetitor => ({
  handle, found, followers, engagementRate,
});
const map = (...xs: IgCompetitor[]) => new Map(xs.map((x) => [x.handle, x]));

describe("choosePicks", () => {
  it("keeps only accounts Instagram confirmed, with enough followers", () => {
    const picks = choosePicks(
      [cand("real", "direct_competitor", 80), cand("missing", "direct_competitor", 90), cand("tiny", "direct_competitor", 95), cand("private", "direct_competitor", 99)],
      map(ig("real", 5000), ig("tiny", MIN_FOLLOWERS - 1), ig("private", null, null, false)),
      5,
    );
    expect(picks.map((p) => p.handle)).toEqual(["real"]);
  });

  it("puts close rivals before inspiration, then relevance, then engagement", () => {
    const picks = choosePicks(
      [cand("inspo", "content_inspiration", 99), cand("local", "local_competitor", 50), cand("direct_a", "direct_competitor", 60), cand("direct_b", "direct_competitor", 60)],
      map(ig("inspo", 9000), ig("local", 900), ig("direct_a", 2000, 1.2), ig("direct_b", 2000, 4.5)),
      5,
    );
    expect(picks.map((p) => p.handle)).toEqual(["direct_b", "direct_a", "local", "inspo"]);
  });

  it("never fills more than the free slots or the per-run cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(`a${i}`, "direct_competitor", 50 + i));
    const verified = map(...many.map((c) => ig(c.handle!, 1000)));
    expect(choosePicks(many, verified, 2)).toHaveLength(2);
    expect(choosePicks(many, verified, 30)).toHaveLength(PICKS_PER_RUN);
    expect(choosePicks(many, verified, 0)).toHaveLength(0);
  });
});

describe("pickReason", () => {
  it("says why discovery found it and what Instagram reported", () => {
    expect(pickReason(cand("x", "local_competitor", 70, "Pizzeria two miles away."), ig("x", 12400, 3.21)))
      .toBe("Pizzeria two miles away. 12k followers, 3.2% engagement");
  });

  it("leaves out numbers Instagram did not return", () => {
    expect(pickReason(cand("x", "local_competitor", 70), ig("x", 950, null))).toBe("Same niche. 950 followers");
  });
});

describe("chooseUnverifiedPicks", () => {
  it("adds only web-research finds, fewer of them, each marked as unchecked", () => {
    const yt = { ...cand("tube", "direct_competitor", 99), platform: "youtube" as const, dataSource: "youtube_api" as const };
    const picks = chooseUnverifiedPicks(
      [yt, cand("inspo", "content_inspiration", 95), cand("rival", "direct_competitor", 40, "Same street."), cand("b", "local_competitor", 50), cand("c", "niche_leader", 60)],
      10,
    );
    expect(picks.map((p) => p.handle)).toEqual(["rival", "b", "c"]);
    expect(picks).toHaveLength(UNVERIFIED_PICKS);
    expect(picks[0].reason).toBe("Same street. Found by web research; Instagram has not confirmed its numbers yet");
  });

  it("respects the free slots", () => {
    expect(chooseUnverifiedPicks([cand("a", "direct_competitor", 1), cand("b", "direct_competitor", 2)], 1)).toHaveLength(1);
    expect(chooseUnverifiedPicks([cand("a", "direct_competitor", 1)], 0)).toHaveLength(0);
  });
});

describe("reason text", () => {
  it("never shows a tiny rate as 0.0%", () => {
    expect(fmtRate(0.04)).toBe("under 0.1%");
    expect(fmtRate(0)).toBe("0.0%");
    expect(fmtRate(2.34)).toBe("2.3%");
  });

  it("cuts a long reason at a word and keeps the numbers", () => {
    const long = "Same-niche peer: " + "sells an AI social media agent that writes and publishes posts ".repeat(5);
    const r = pickReason(cand("x", "direct_competitor", 70, long), ig("x", 663000, 0.02));
    expect(r.endsWith("663k followers, under 0.1% engagement")).toBe(true);
    expect(r).toMatch(/\w… 663k/);
  });
});

describe("fmtRate, compact", () => {
  it("says <0.1% where space is tight", () => {
    expect(fmtRate(0.04, true)).toBe("<0.1%");
    expect(fmtRate(1.25, true)).toBe("1.3%");
  });
});
