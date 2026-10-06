import { describe, it, expect } from "vitest";
import { rankPeople, mergePeople, mentionsIn, matchScore, distance, type Person } from "./people";

const person = (username: string, over: Partial<Person> = {}): Person => ({ username, name: null, avatar: null, sources: ["tagged"], count: 1, ...over });

const people: Person[] = [
  person("salvospizza_gallatin", { sources: ["your_account"], accountId: "17841466345769615", name: "Salvo's Pizza Gallatin" }),
  person("salvoshermitage", { sources: ["your_account"], accountId: "999" }),
  person("salvatore.rossi", { sources: ["commented"], count: 4 }),
  person("tasteofny", { sources: ["competitor"], name: "Taste of NY" }),
  person("nashvillefoodie", { sources: ["collaborated"], count: 2 }),
  person("pizza_lover_615", { sources: ["mentioned"] }),
];

describe("username suggestions", () => {
  it("puts prefix matches first, the stronger relationship breaking ties", () => {
    const r = rankPeople(people, "salv").map((p) => p.username);
    expect(r.slice(0, 2).sort()).toEqual(["salvoshermitage", "salvospizza_gallatin"]);
    expect(r[2]).toBe("salvatore.rossi");
  });

  it("matches the start of any part of a username, and display names", () => {
    expect(rankPeople(people, "lover").map((p) => p.username)).toEqual(["pizza_lover_615"]);
    expect(rankPeople(people, "taste").map((p) => p.username)).toEqual(["tasteofny"]);
    expect(rankPeople(people, "gallatin")[0].username).toBe("salvospizza_gallatin");
  });

  it("forgives a typo in what has been typed", () => {
    expect(rankPeople(people, "nashvile").map((p) => p.username)).toContain("nashvillefoodie");
    expect(distance("nashvile", "nashvill", 2)).toBe(1);
    expect(matchScore(person("abc"), "xyz")).toBe(0);
  });

  it("leaves out the posting account and people already chosen", () => {
    const r = rankPeople(people, "salv", { excludeAccountId: "17841466345769615", exclude: ["@SalvosHermitage"] }).map((p) => p.username);
    expect(r).toEqual(["salvatore.rossi"]);
  });

  it("suggests the closest relationships first when nothing is typed yet", () => {
    expect(rankPeople(people, "", { limit: 3 }).map((p) => p.username)).toEqual(["salvoshermitage", "salvospizza_gallatin", "nashvillefoodie"]);
  });

  it("merges sightings and reads mentions out of captions", () => {
    const merged = mergePeople([
      { username: "@TasteOfNY", name: null, avatar: null, source: "competitor" },
      { username: "tasteofny", name: "Taste of NY", avatar: "a.jpg", source: "mentioned", count: 3 },
      { username: "not valid!", name: null, avatar: null, source: "tagged" },
    ]);
    expect(merged).toEqual([{ username: "tasteofny", name: "Taste of NY", avatar: "a.jpg", sources: ["competitor", "mentioned"], count: 4, accountId: null }]);
    expect(mentionsIn("Thanks @tasteofny. and @Pizza_Lover_615! email me@x.com")).toEqual(["tasteofny", "pizza_lover_615"]);
  });
});
