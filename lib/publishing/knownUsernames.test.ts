import { describe, it, expect } from "vitest";
import { lookupFromDiscovery } from "./knownUsernames";
import { lookupLine, mergePeople, rankPeople } from "./people";

describe("Instagram username lookup", () => {
  it("maps Business Discovery's answers to what the composer shows", () => {
    const found = lookupFromDiscovery({ ok: true, account: { username: "TasteOfNY", name: "Taste of NY", biography: null, profilePicture: "https://cdn/p.jpg", followers: 12_340, mediaCount: 90, media: [] } });
    expect(found).toEqual({ available: true, status: "found", account: { username: "tasteofny", name: "Taste of NY", avatar: "https://cdn/p.jpg", followers: 12_340 } });
    expect(lookupLine(found)).toBe("Found on Instagram · Taste of NY · 12.3k followers");
    expect(lookupFromDiscovery({ ok: false, reason: "not_found" })).toEqual({ available: true, status: "not_found" });
    expect(lookupLine(lookupFromDiscovery({ ok: false, reason: "not_business" }))).toMatch(/Personal or private account/);
    expect(lookupFromDiscovery({ ok: false, reason: "not_connected" })).toMatchObject({ available: false });
    expect(lookupFromDiscovery({ ok: false, reason: "no_permission" })).toMatchObject({ available: false });
    expect(lookupFromDiscovery({ ok: false, reason: "failed" })).toEqual({ available: true, status: "failed" });
    expect(lookupLine({ available: true, status: "failed" })).toBeNull();
    expect(lookupLine({ available: false, reason: "x" })).toBeNull();
  });

  it("formats follower counts readably", () => {
    const line = (followers: number | null) => lookupLine({ available: true, status: "found", account: { username: "a", name: null, avatar: null, followers } });
    expect(line(842)).toBe("Found on Instagram · 842 followers");
    expect(line(254_000)).toBe("Found on Instagram · 254k followers");
    expect(line(null)).toBe("Found on Instagram");
  });

  it("ranks usernames added before in SOCIA above tags, mentions, competitors and commenters", () => {
    const people = mergePeople([
      { username: "pizzafan", name: null, avatar: null, source: "commented", count: 9 },
      { username: "pizzapartner", name: null, avatar: null, source: "used", count: 1 },
      { username: "pizzarival", name: null, avatar: null, source: "competitor" },
    ]);
    expect(rankPeople(people, "pizza").map((p) => p.username)).toEqual(["pizzapartner", "pizzarival", "pizzafan"]);
  });
});
