import { describe, it, expect } from "vitest";
import { CAPABILITIES, availabilityFor, formatSpec } from "./capabilities";
import { validateDestination, validateMedia, countHashtags, countMentions, byteLength } from "./validate";
import { aggregateStatus, summarize, firstError } from "./status";
import { newDraft, seedDestinations, review, toPayload, timeFor, captionFor, suggestInstagramFormat, type PickerAccount } from "./composer";
import { defaultSettings, type MediaItem, type YouTubeSettings, type InstagramSettings } from "./types";

const MB = 1024 * 1024;
const video = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "v1", kind: "video", name: "a.mp4", mime: "video/mp4", size: 40 * MB, width: 1080, height: 1920, duration: 28, path: "u/p/a.mp4", url: "https://x/a.mp4", ...over,
});
const image = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "i1", kind: "image", name: "a.jpg", mime: "image/jpeg", size: 2 * MB, width: 1080, height: 1350, duration: null, path: "u/p/a.jpg", url: "https://x/a.jpg", ...over,
});
const future = new Date(Date.now() + 3600_000).toISOString();

describe("capabilities", () => {
  it("all four platforms are implemented; Facebook gates on its publish scope", () => {
    expect(CAPABILITIES.instagram.implemented).toBe(true);
    expect(CAPABILITIES.youtube.implemented).toBe(true);
    expect(CAPABILITIES.tiktok.implemented).toBe(true);
    expect(CAPABILITIES.facebook.implemented).toBe(true);
    // A recorded scope list without pages_manage_posts asks for a reconnect; a
    // null list (Facebook connections don't record scopes yet) is tried.
    expect(availabilityFor("facebook", { status: "connected", suspended: false, scopes: [] }).state).toBe("needs_scope");
    expect(availabilityFor("facebook", { status: "connected", suspended: false, scopes: ["pages_manage_posts"] }).state).toBe("available");
    expect(availabilityFor("facebook", { status: "connected", suspended: false, scopes: null }).state).toBe("available");
    expect(availabilityFor("tiktok", null).state).toBe("not_connected");
    expect(availabilityFor("tiktok", { status: "connected", suspended: false, scopes: ["user.info.basic"] }).state).toBe("needs_scope");
    expect(availabilityFor("tiktok", { status: "connected", suspended: false, scopes: ["user.info.basic", "video.upload"] }).state).toBe("available");
  });
  it("asks for a reconnect when the stored scopes cannot publish", () => {
    expect(availabilityFor("youtube", { status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube.readonly"] }).state).toBe("needs_scope");
    expect(availabilityFor("youtube", { status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube"] }).state).toBe("available");
    expect(availabilityFor("instagram", { status: "connected", suspended: false, scopes: ["instagram_business_basic"] }).state).toBe("needs_scope");
    expect(availabilityFor("instagram", { status: "connected", suspended: false, scopes: null }).state).toBe("available");
    expect(availabilityFor("instagram", null).state).toBe("not_connected");
    expect(availabilityFor("instagram", { status: "connected", suspended: true, scopes: null }).state).toBe("not_connected");
  });
  it("never lists collaborators as supported until verified", () => {
    expect(CAPABILITIES.instagram.features.collaborators).toBe("unverified");
  });
});

describe("media validation follows the documented limits", () => {
  const reel = formatSpec("instagram", "reel")!.media;
  const igImage = formatSpec("instagram", "image")!.media;
  it("accepts a compliant reel and blocks an oversized or too-short one", () => {
    expect(validateMedia([video()], reel, "Instagram")).toEqual([]);
    expect(validateMedia([video({ size: 301 * MB })], reel, "Instagram").map((i) => i.code)).toContain("media_size");
    expect(validateMedia([video({ duration: 2 })], reel, "Instagram").map((i) => i.code)).toContain("media_short");
  });
  it("blocks non-JPEG and bad aspect ratios for Instagram images", () => {
    expect(validateMedia([image({ mime: "image/png" })], igImage, "Instagram").map((i) => i.code)).toContain("media_mime");
    expect(validateMedia([image({ width: 1080, height: 1920 })], igImage, "Instagram").map((i) => i.code)).toContain("media_aspect");
    expect(validateMedia([image()], igImage, "Instagram")).toEqual([]);
  });
  it("warns instead of guessing when dimensions, duration, size or type were not measured", () => {
    const issues = validateMedia([video({ width: null, height: null, duration: null, size: null, mime: "" })], reel, "Instagram");
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["media_duration_unknown", "media_dimensions_unknown", "media_size_unknown", "media_mime_unknown"]));
    expect(issues.map((i) => i.code)).not.toContain("media_size");
  });
  it("enforces carousel counts", () => {
    const car = formatSpec("instagram", "carousel")!.media;
    expect(validateMedia([image()], car, "Instagram").map((i) => i.code)).toContain("media_missing");
    expect(validateMedia(Array.from({ length: 11 }, (_, i) => image({ id: `i${i}` })), car, "Instagram").map((i) => i.code)).toContain("media_count");
  });
});

describe("text rules", () => {
  it("counts hashtags and mentions and bytes", () => {
    expect(countHashtags("go #a #b_c #d")).toBe(3);
    expect(countMentions("hi @you and @me.too")).toBe(2);
    expect(byteLength("é")).toBe(2);
  });
  it("YouTube requires a title, made-for-kids, and rejects < >", () => {
    const s: YouTubeSettings = { ...defaultSettings("youtube"), title: "", madeForKids: null };
    const r = validateDestination({ platform: "youtube", media: [video()], masterCaption: "desc", settings: s, scheduledAt: null, requireFutureTime: false });
    expect(r.level).toBe("blocked");
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["title_missing", "made_for_kids_unset"]));
    const bad = { ...s, title: "a <b>", madeForKids: false };
    expect(validateDestination({ platform: "youtube", media: [video()], masterCaption: "d", settings: bad, scheduledAt: null, requireFutureTime: false }).issues.map((i) => i.code)).toContain("title_chars");
    const ok = { ...s, title: "Good title", madeForKids: false };
    expect(validateDestination({ platform: "youtube", media: [video()], masterCaption: "d", settings: ok, scheduledAt: null, requireFutureTime: false }).level).toBe("ready");
  });
  it("Instagram blocks more than 5 hashtags and a past time", () => {
    const s: InstagramSettings = { ...defaultSettings("instagram"), format: "reel" };
    const five = Array.from({ length: 5 }, (_, i) => `#t${i}`).join(" ");
    expect(validateDestination({ platform: "instagram", media: [video()], masterCaption: five, settings: s, scheduledAt: future, requireFutureTime: true }).issues.map((i) => i.code)).not.toContain("hashtags_many");
    const many = Array.from({ length: 6 }, (_, i) => `#t${i}`).join(" ");
    expect(validateDestination({ platform: "instagram", media: [video()], masterCaption: many, settings: s, scheduledAt: future, requireFutureTime: true }).issues.map((i) => i.code)).toContain("hashtags_many");
    expect(validateDestination({ platform: "instagram", media: [video()], masterCaption: "ok", settings: s, scheduledAt: "2020-01-01T00:00:00Z", requireFutureTime: true }).issues.map((i) => i.code)).toContain("time_past");
  });
  it("validates a Facebook Page post now that publishing is implemented", () => {
    const r = validateDestination({ platform: "facebook", media: [image()], masterCaption: "x", settings: defaultSettings("facebook"), scheduledAt: null, requireFutureTime: false });
    expect(r.level).toBe("ready");
  });
});

describe("status aggregation", () => {
  const d = (status: string) => ({ status: status as never, errorMessage: null, platform: "instagram" as const });
  it("one platform failing never marks the others", () => {
    expect(aggregateStatus([d("published"), d("failed")])).toBe("failed");
    expect(summarize([d("published"), d("failed")]).line).toBe("1 of 2 failed");
    expect(summarize([d("published"), d("published")]).line).toBe("Published to 2");
  });
  it("in-flight wins, then published, then failed, then scheduled", () => {
    expect(aggregateStatus([d("scheduled"), d("uploading")])).toBe("publishing");
    expect(aggregateStatus([d("scheduled"), d("draft")])).toBe("scheduled");
    expect(aggregateStatus([d("draft")])).toBe("draft");
    expect(aggregateStatus([d("cancelled")])).toBe("cancelled");
    expect(aggregateStatus([])).toBe("draft");
  });
  it("surfaces the first failure verbatim", () => {
    expect(firstError([{ status: "failed", errorMessage: "The video exceeds the supported file limit.", platform: "youtube" }])).toBe("youtube: The video exceeds the supported file limit.");
  });
});

describe("composer draft", () => {
  const accounts: PickerAccount[] = [
    { platform: "instagram", accountId: "1", label: "@salvo", handle: "salvo", avatar: null, status: "connected", suspended: false, scopes: null },
    { platform: "youtube", accountId: "UC1", label: "Discipline Theory", handle: null, avatar: null, status: "connected", suspended: false, scopes: ["https://www.googleapis.com/auth/youtube"] },
    { platform: "facebook", accountId: "p1", label: "Page", handle: null, avatar: null, status: "connected", suspended: false, scopes: null },
  ];
  it("seeds every account disabled and reviews only enabled ones", () => {
    const draft = newDraft();
    draft.destinations = seedDestinations(accounts);
    expect(draft.destinations.every((d) => !d.enabled)).toBe(true);
    expect(review(draft, accounts).total).toBe(0);
  });
  it("tells the truth about a partially ready set", () => {
    const draft = newDraft();
    draft.destinations = seedDestinations(accounts);
    draft.media = [video()];
    draft.masterCaption = "The goal was never money.";
    draft.schedule = { mode: "later", at: future, sameForAll: true };
    draft.destinations[0].enabled = true;
    draft.destinations[1].enabled = true;
    const r = review(draft, accounts);
    expect(r.total).toBe(2);
    expect(r.readyCount).toBe(1);
    expect(r.canSubmit).toBe(false);
    expect(r.rows[1].readiness.issues.map((i) => i.code)).toContain("title_missing");
  });
  it("honours per-platform times and caption overrides only when customizing", () => {
    const draft = newDraft();
    draft.destinations = seedDestinations(accounts);
    draft.masterCaption = "master";
    draft.schedule = { mode: "later", at: future, sameForAll: false };
    draft.destinations[0].scheduledAt = "2030-01-01T18:15:00Z";
    (draft.destinations[0].settings as InstagramSettings).caption = "ig only";
    expect(timeFor(draft, draft.destinations[0])).toBe("2030-01-01T18:15:00Z");
    expect(timeFor(draft, draft.destinations[1])).toBe(future);
    expect(captionFor(draft, draft.destinations[0])).toBe("master");
    draft.customizePerPlatform = true;
    expect(captionFor(draft, draft.destinations[0])).toBe("ig only");
  });
  it("serialises only enabled destinations and drops overrides when not customizing", () => {
    const draft = newDraft();
    draft.destinations = seedDestinations(accounts);
    draft.destinations[0].enabled = true;
    (draft.destinations[0].settings as InstagramSettings).caption = "hidden";
    const p = toPayload(draft, "draft");
    expect(p.destinations).toHaveLength(1);
    expect((p.destinations[0].settings as InstagramSettings).caption).toBeNull();
  });
  it("suggests a format from the media", () => {
    expect(suggestInstagramFormat([video()])).toBe("reel");
    expect(suggestInstagramFormat([image()])).toBe("image");
    expect(suggestInstagramFormat([image(), image({ id: "i2" })])).toBe("carousel");
  });
});
