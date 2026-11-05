import { describe, expect, it } from "vitest";
import { nicheCheckPrompt, parseNicheVerdict, type NicheCheckItem } from "./nicheCheck";
import { NICHE_CHECKED, nicheVetted, scoreAccount, scoreContent, type DiscoveryProfile } from "./discovery";

const items: NicheCheckItem[] = [
  { id: "C1", kind: "channel", name: "Magnus Midtbø", text: "Climbing videos from a former pro climber." },
  { id: "C2", kind: "channel", name: "Papa Meat", text: null },
  { id: "V1", kind: "video", name: "CGTN", text: "Watch: Panda gets tree-climbing lesson from human" },
  { id: "V2", kind: "video", name: "The Gravity Lab", text: "Top 8 Beginner Trad Climbing Mistakes - FIXED" },
];

describe("niche check", () => {
  it("lists every candidate with its id, kind, name and text", () => {
    const p = nicheCheckPrompt("Niche: Climbing > Bouldering app.", items);
    expect(p).toContain("# The brand\nNiche: Climbing > Bouldering app.");
    expect(p).toContain("C1 | channel | Magnus Midtbø | Climbing videos from a former pro climber.");
    expect(p).toContain("C2 | channel | Papa Meat");
    expect(p).toContain("V1 | video | CGTN | Watch: Panda gets tree-climbing lesson from human");
  });

  it("keeps only listed ids the model returned, and nothing when the answer is not usable", () => {
    expect([...parseNicheVerdict('{"keep":["C1","V2","V9","C1"]}', items)]).toEqual(["C1", "V2"]);
    expect(parseNicheVerdict("```json\n{\"keep\":[\"V2\"]}\n```", items).has("V2")).toBe(true);
    expect(parseNicheVerdict("I think all of them", items).size).toBe(0);
    expect(parseNicheVerdict('{"keep":"C1"}', items).size).toBe(0);
  });
});

describe("stored YouTube search results count only once checked", () => {
  it("lets other sources through and holds unchecked YouTube rows back", () => {
    expect(nicheVetted({ data_source: "web_research", relevance_reasons: ["Same niche"] })).toBe(true);
    expect(nicheVetted({ data_source: "youtube_api", relevance_reasons: ["Found in your niche", "Much larger audience"] })).toBe(false);
    expect(nicheVetted({ data_source: "youtube_api", relevance_reasons: null })).toBe(false);
    expect(nicheVetted({ data_source: "youtube_api", relevance_reasons: ["Verified public metrics", NICHE_CHECKED] })).toBe(true);
    // A row read without those columns is not a YouTube search row as far as this can tell.
    expect(nicheVetted({ platform: "instagram" })).toBe(true);
  });

  it("marks a candidate that passed the check, and only that one", () => {
    const profile = { niche: "Sports", subNiche: "Climbing", specific: null, location: null, goal: "followers", ownFollowers: 46, ownFormats: [] } as unknown as DiscoveryProfile;
    const base = { platform: "youtube" as const, platformAccountId: "x", handle: "x", displayName: "Crux Lab", profileImage: null, profileUrl: null, followers: 9000, location: null, category: null, dataSource: "youtube_api" as const };
    expect(scoreAccount({ ...base, nicheChecked: true }, profile).relevanceReasons).toContain(NICHE_CHECKED);
    expect(scoreAccount(base, profile).relevanceReasons).not.toContain(NICHE_CHECKED);
    const video = { platform: "youtube" as const, contentUrl: "https://youtube.com/shorts/a", accountHandle: null, accountName: "Crux Lab", accountImage: null, thumbnailUrl: null, title: "Three footwork drills", publishedAt: null, contentType: "short", views: 100, likes: 1, comments: 0, multiplier: null, dataSource: "youtube_api" as const, why: null };
    expect(nicheVetted({ data_source: "youtube_api", relevance_reasons: scoreContent({ ...video, nicheChecked: true }, profile).relevanceReasons })).toBe(true);
    expect(nicheVetted({ data_source: "youtube_api", relevance_reasons: scoreContent(video, profile).relevanceReasons })).toBe(false);
  });
});
