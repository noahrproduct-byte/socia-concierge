import { describe, it, expect } from "vitest";
import { assembleCaption, businessLocations, cleanHashtags, hashtagMax, hashtagsIn, locationInstruction, performanceFacts, unverifiedClaims } from "./captionRules";

describe("hashtags", () => {
  it("caps a caption going everywhere at the strictest platform", () => {
    expect(hashtagMax(["instagram"])).toBe(5);
    expect(hashtagMax(["instagram", "facebook"])).toBe(3);
  });

  it("cleans, dedupes and caps", () => {
    expect(cleanHashtags(["#Brentwood Eats", "brentwoodeats", "#2026", "#pizza!", "nashvillefood", "a", "b", "c"], 4)).toEqual(["BrentwoodEats", "pizza", "nashvillefood", "a"]);
  });

  it("assembles hook, body, ask and tags, counting inline tags toward the cap", () => {
    const r = assembleCaption({ hook: "Fresh out of the oven.", body: "Our #Brentwood kitchen fires these all day.", cta: "Come grab a slice.", hashtags: ["#brentwood", "pizza", "nashvillefood", "slices", "tn", "extra"] }, 5);
    expect(r.text).toBe("Fresh out of the oven.\n\nOur #Brentwood kitchen fires these all day.\n\nCome grab a slice.\n\n#pizza #nashvillefood #slices #tn");
    expect(hashtagsIn(r.text)).toHaveLength(5);
  });
});

describe("unverified claims", () => {
  const corpus = "Sicilian slice is $5 this Saturday only. Open 11am to 9pm. Brentwood, TN. salvospizza.com";

  it("lets through what the person said", () => {
    expect(unverifiedClaims("Sicilian slices are $5 Saturday, 11am to 9pm. Order at salvospizza.com", corpus, [])).toEqual([]);
  });

  it("flags invented prices, times, links, phones and accounts", () => {
    const claims = unverifiedClaims("Only $12! 20% off until 10pm, Oct 12. Call (615) 555-0100, visit salvos.menu, thanks @randomchef and @salvosfranklin", corpus, ["salvosfranklin"]);
    expect(claims.map((c) => `${c.kind}:${c.value}`)).toEqual([
      "mention:@randomchef", "price:$12", "percent:20%", "time:10pm", "date:Oct 12", "link:salvos.menu", "phone:(615) 555-0100",
    ]);
  });

  it("does not read an email address or a decimal as a claim it can't check", () => {
    expect(unverifiedClaims("Two slices, 2.5 minutes away. Email hello@salvospizza.com", corpus, [])).toEqual([]);
  });

  it("knows 12 is not in 120", () => {
    expect(unverifiedClaims("$12 slices", "We fed 120 people", [])).toEqual([{ kind: "price", value: "$12" }]);
  });
});

describe("performance facts", () => {
  const post = (interactions: number, caption: string) => ({ caption, interactions, format: "Reel", at: null });

  it("needs a baseline before calling anything a top post", () => {
    expect(performanceFacts([post(10, "a"), post(30, "b")]).top).toEqual([]);
  });

  it("finds the posts that beat the median, their hooks and the hashtags used", () => {
    const posts = [
      post(10, "Tuesday special\n#pizza"), post(12, "New menu"), post(11, "Come by #pizza"), post(9, "Hi"),
      post(40, "The slice that sold out in an hour 🍕\nMore below\n#pizza #brentwood"), post(10, "ok"),
    ];
    const f = performanceFacts(posts);
    expect(f.baseline).toBe(10.5);
    expect(f.top[0]).toMatchObject({ hook: "The slice that sold out in an hour 🍕", format: "Reel", hashtags: ["pizza", "brentwood"] });
    expect(f.top[0].multiplier).toBeCloseTo(3.8, 1);
    expect(f.hashtags[0]).toMatchObject({ tag: "pizza", uses: 3 });
  });
});

describe("business locations", () => {
  const cur = { id: "w1", name: "Salvo's Brentwood", brandName: "Salvo's", location: "Brentwood, TN", igUsername: "salvosbrentwood" };
  const franklin = { id: "w2", name: "Salvo's Franklin", brandName: "Salvo's", location: "Franklin, TN", igUsername: "salvosfranklin" };
  const other = { id: "w3", name: "Client: Bakery", brandName: "Rise", location: "Nashville", igUsername: "risebakery" };

  it("links another location only by brand name or a collaborator account", () => {
    expect(businessLocations(cur, [cur, franklin, other], []).map((l) => `${l.location}:${l.why}`)).toEqual(["Brentwood, TN:this_workspace", "Franklin, TN:same_brand"]);
    expect(businessLocations(cur, [other], ["@RiseBakery"]).map((l) => `${l.location}:${l.why}`)).toEqual(["Brentwood, TN:this_workspace", "Nashville:collaborator"]);
  });

  it("names nothing when no location was saved", () => {
    expect(businessLocations({ ...cur, location: null }, [{ ...franklin, brandName: "Other" }], [])).toEqual([]);
  });
});

describe("location choice", () => {
  const locs = [
    { location: "Brentwood, TN", workspace: "Salvo's Brentwood", igUsername: null, why: "this_workspace" as const },
    { location: "Franklin, TN", workspace: "Salvo's Franklin", igUsername: "salvosfranklin", why: "same_brand" as const },
  ];

  it("leaves it to the post on auto, and follows an explicit choice", () => {
    expect(locationInstruction("auto", locs)).toBeNull();
    expect(locationInstruction("franklin, tn", locs)?.line).toBe("This post is about the Franklin, TN location. Name Franklin, TN and no other location.");
    expect(locationInstruction("all", locs)?.fact).toBe("For Brentwood, TN and Franklin, TN (your choice)");
    expect(locationInstruction("none", locs)?.line).toMatch(/not to name any location/);
  });

  it("ignores a location SOCIA doesn't know", () => {
    expect(locationInstruction("Nashville", locs)).toBeNull();
    expect(locationInstruction("all", [])).toBeNull();
  });
});
