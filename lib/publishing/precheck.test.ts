import { describe, it, expect } from "vitest";
import { contentChecks, hookLine, wordCount, ctaPhrase, CTA_RE } from "./precheck";
import { newDraft, seedDestinations, type ComposerDraft, type PickerAccount } from "./composer";
import { defaultSettings, type MediaItem, type YouTubeSettings } from "./types";

const accounts: PickerAccount[] = [
  { platform: "instagram", accountId: "ig1", label: "Salvo's Hermitage", handle: "salvoshermitage", avatar: null, status: "connected", suspended: false, scopes: null },
  { platform: "youtube", accountId: "yt1", label: "Salvo's Kitchen", handle: null, avatar: null, status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube.upload"] },
];

const image: MediaItem = { id: "img1", kind: "image", name: "cover.jpg", mime: "image/jpeg", size: 1024, width: 1280, height: 720, duration: null, path: "u/p/cover.jpg", url: "https://x/cover.jpg" };
const video: MediaItem = { id: "vid1", kind: "video", name: "clip.mp4", mime: "video/mp4", size: 1024, width: 1080, height: 1920, duration: 30, path: "u/p/clip.mp4", url: "https://x/clip.mp4" };

function draftWith(over: Partial<ComposerDraft>, enable: string[] = []): ComposerDraft {
  const d = { ...newDraft(), destinations: seedDestinations(accounts), ...over };
  d.destinations = d.destinations.map((x) => (enable.includes(x.platform) ? { ...x, enabled: true } : x));
  return d;
}

const byId = (checks: ReturnType<typeof contentChecks>, id: string) => checks.find((c) => c.id === id || c.id.startsWith(`${id}:`))!;

describe("text helpers", () => {
  it("takes the first non-empty line as the hook", () => {
    expect(hookLine("\n\n  Order the new menu today  \nSecond line")).toBe("Order the new menu today");
    expect(hookLine("")).toBe("");
    expect(wordCount("Order the new menu today")).toBe(5);
    expect(wordCount("   ")).toBe(0);
  });
  it("uses the same CTA phrases as Content Studio", () => {
    expect(CTA_RE.source).toBe("\\?|order|book|dm|tag|comment|save|share|link");
    expect(ctaPhrase("Order now")).toBe("“Order”");
    expect(ctaPhrase("Which one would you pick?")).toBe("a question");
    expect(ctaPhrase("A quiet evening")).toBeNull();
  });
});

describe("contentChecks", () => {
  it("flags an empty caption without inventing anything else", () => {
    const checks = contentChecks(draftWith({}, ["instagram"]), accounts);
    expect(byId(checks, "hook")).toMatchObject({ value: "No caption yet", tone: "warn" });
    expect(byId(checks, "cta")).toMatchObject({ value: "No CTA phrase found", tone: "note" });
    expect(byId(checks, "tags")).toMatchObject({ value: "0 hashtags · 0 mentions", tone: "note" });
    expect(checks.some((c) => c.id.startsWith("yt_"))).toBe(false);
  });

  it("measures the hook, the CTA, counts and the Instagram limit", () => {
    const checks = contentChecks(draftWith({ masterCaption: "Order the new menu today\nCome hungry #food #nyc @friend" }, ["instagram"]), accounts);
    expect(byId(checks, "hook")).toMatchObject({ label: "Hook line", value: "5 words", tone: "good" });
    expect(byId(checks, "cta")).toMatchObject({ value: "Found “Order”", tone: "good" });
    expect(byId(checks, "tags")).toMatchObject({ value: "2 hashtags · 1 mention", tone: "good" });
    expect(byId(checks, "length")).toMatchObject({ label: "Caption length", value: "55 of 2,200 characters (Instagram)", tone: "good" });
  });

  it("picks the strictest enabled limit and warns when the text exceeds it", () => {
    const long = "a".repeat(2201);
    const checks = contentChecks(draftWith({ masterCaption: long }, ["instagram", "youtube"]), accounts);
    expect(byId(checks, "length")).toMatchObject({ value: "2,201 of 2,200 characters (Instagram)", tone: "warn" });
  });

  it("reports the YouTube description in bytes when only YouTube is enabled", () => {
    const checks = contentChecks(draftWith({ masterCaption: "Héllo" }, ["youtube"]), accounts);
    expect(byId(checks, "length")).toMatchObject({ label: "Description length", value: "6 of 5,000 bytes (YouTube)", tone: "good" });
  });

  it("notes when no destination is selected instead of picking a limit", () => {
    const checks = contentChecks(draftWith({ masterCaption: "Hello there" }), accounts);
    expect(byId(checks, "length")).toMatchObject({ value: "11 characters; no destination selected yet", tone: "note" });
  });

  it("warns when hashtags exceed the platform limit", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const checks = contentChecks(draftWith({ masterCaption: `Hook\n${tags}` }, ["instagram"]), accounts);
    expect(byId(checks, "tags").tone).toBe("warn");
    expect(byId(checks, "tags").value).toContain("limit 5 hashtags");
  });

  it("checks the YouTube title, the made-for-kids answer and the thumbnail", () => {
    const base = draftWith({ masterCaption: "Best pizza in Queens\nCome by this weekend", media: [video, image] }, ["youtube"]);
    const yt = base.destinations.find((d) => d.platform === "youtube")!;

    const unset = contentChecks(base, accounts);
    expect(byId(unset, "yt_title")).toMatchObject({ value: "Required; not set", tone: "warn" });
    expect(byId(unset, "yt_kids")).toMatchObject({ value: "Not answered; YouTube requires it", tone: "warn" });
    expect(byId(unset, "yt_thumb")).toMatchObject({ value: "None chosen; YouTube picks a frame", tone: "note" });

    const settings: YouTubeSettings = { ...(defaultSettings("youtube") as YouTubeSettings), title: "best pizza in queens", madeForKids: false, thumbnailMediaId: "img1" };
    const filled = contentChecks({ ...base, destinations: base.destinations.map((d) => (d.key === yt.key ? { ...d, settings } : d)) }, accounts);
    expect(byId(filled, "yt_title")).toMatchObject({ value: "20 of 100 characters · repeats the caption's first line", tone: "note" });
    expect(byId(filled, "yt_kids")).toMatchObject({ value: "No", tone: "good" });
    expect(byId(filled, "yt_thumb")).toMatchObject({ value: "Chosen: cover.jpg", tone: "good" });

    const distinct: YouTubeSettings = { ...settings, title: "Queens pizza tour", thumbnailMediaId: "vid1" };
    const other = contentChecks({ ...base, destinations: base.destinations.map((d) => (d.key === yt.key ? { ...d, settings: distinct } : d)) }, accounts);
    expect(byId(other, "yt_title")).toMatchObject({ value: "17 of 100 characters", tone: "good" });
    // A video cannot be a thumbnail; nothing is invented.
    expect(byId(other, "yt_thumb").tone).toBe("note");
  });

  it("is deterministic and free of em dashes and exclamation marks", () => {
    const d = draftWith({ masterCaption: "Book a table?\n#dinner" }, ["instagram", "youtube"]);
    const a = contentChecks(d, accounts);
    const b = contentChecks(d, accounts);
    expect(a).toEqual(b);
    for (const c of a) expect(`${c.label} ${c.value}`).not.toMatch(/[—!]/);
  });
});
