import { describe, expect, it } from "vitest";
import { cleanKeyword, cleanSlug, cleanTag, cleanTags, contactsCsv, excerpt, normalizeEmail, normalizeHandle, tagsFromText, type Contact } from "./contacts";

describe("cleaning what comes in", () => {
  it("keeps real Instagram usernames, lowercase and without @", () => {
    expect(normalizeHandle("@Beta.Twin_")).toBe("beta.twin_");
    expect(normalizeHandle("has space")).toBeNull();
    expect(normalizeHandle("x".repeat(31))).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });

  it("keeps emails that look like emails", () => {
    expect(normalizeEmail("  Noah@Example.COM ")).toBe("noah@example.com");
    expect(normalizeEmail("noah@example")).toBeNull();
    expect(normalizeEmail("not an email")).toBeNull();
  });

  it("makes tags plain, lowercase and unique, at most 12", () => {
    expect(cleanTag("  Wants   Early Access! ")).toBe("wants early access");
    expect(cleanTag("!!!")).toBeNull();
    expect(cleanTags(["VIP", "vip", "", "Local"])).toEqual(["vip", "local"]);
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
  });

  it("makes keywords and page addresses safe", () => {
    expect(cleanKeyword("#Beta ")).toBe("beta");
    expect(cleanSlug("Beta Twin!!")).toBe("beta-twin");
    expect(cleanSlug("ab")).toBeNull();
  });
});

describe("keyword tags", () => {
  const rules = [{ keyword: "beta", tag: "wants early access" }, { keyword: "how much", tag: "asked about price" }];

  it("tags a comment that contains the keyword as a word, any case, with or without #", () => {
    expect(tagsFromText("BETA please!", rules)).toEqual(["wants early access"]);
    expect(tagsFromText("drop the #beta link", rules)).toEqual(["wants early access"]);
    expect(tagsFromText("How much is it?", rules)).toEqual(["asked about price"]);
  });

  it("doesn't match inside another word", () => {
    expect(tagsFromText("alphabetagamma", rules)).toEqual([]);
  });
});

describe("export", () => {
  const c = (over: Partial<Contact> = {}): Contact => ({
    id: "1", platform: "instagram", handle: "climber", name: "Sam", email: "sam@example.com", consentAt: "2026-11-02T10:00:00Z",
    tags: ["waitlist", "local"], notes: "Met at the gym, says \"hi\"", commentCount: 3,
    firstSeen: "2026-10-01T00:00:00Z", lastSeen: "2026-11-02T00:00:00Z", sources: ["comment", "signup"], ...over,
  });

  it("writes a CSV a spreadsheet opens as it is", () => {
    const csv = contactsCsv([c()]);
    expect(csv.split("\r\n")[0]).toBe("Instagram,Name,Email,Consent given,Tags,Comments,First seen,Last seen,Notes");
    expect(csv).toContain('@climber,Sam,sam@example.com,2026-11-02,waitlist; local,3,2026-10-01,2026-11-02,"Met at the gym, says ""hi"""');
  });

  it("never lets a cell run as a formula", () => {
    expect(contactsCsv([c({ notes: "=HYPERLINK(\"x\")" })])).toContain("'=HYPERLINK");
  });

  it("shortens long comments at a word", () => {
    const e = excerpt(`${"word ".repeat(60)}end`);
    expect(e.length).toBeLessThanOrEqual(200);
    expect(e.endsWith("…")).toBe(true);
  });
});
