import { describe, it, expect, beforeEach } from "vitest";
import { cleanHandle, directionChanges, directionFromReference, parseReelLink, readCached, sanitizeSource, servedVideoOf, sourceOfReel, writeCached } from "./referenceSource";

describe("Reel links", () => {
  it("reads the code, and the account when the link carries it", () => {
    expect(parseReelLink("https://www.instagram.com/reel/DAbc123xyz/?igsh=abc")).toEqual({ link: "https://www.instagram.com/reel/DAbc123xyz/", code: "DAbc123xyz", handle: null });
    expect(parseReelLink("https://instagram.com/salvospizza/reel/DAbc123xyz")).toMatchObject({ code: "DAbc123xyz", handle: "salvospizza" });
    expect(parseReelLink("https://www.instagram.com/p/CxYz12345/")?.code).toBe("CxYz12345");
    expect(parseReelLink("https://evil.example/reel/DAbc123xyz/")).toBeNull();
    expect(parseReelLink("http://www.instagram.com/reel/DAbc123xyz/")).toBeNull();
    expect(parseReelLink("not a link")).toBeNull();
  });
  it("cleans an account name", () => {
    expect(cleanHandle(" @Salvos.Pizza ")).toBe("salvos.pizza");
    expect(cleanHandle("no spaces allowed")).toBeNull();
  });
});

describe("the Reel handed over from Discover", () => {
  const r = { url: "https://www.instagram.com/reel/DAbc123xyz/", accountHandle: "@Fashion", accountName: "Fashion House", thumb: "https://scontent.cdninstagram.com/x.jpg", title: "Three outfits", line: null, format: "Reel", views: 90000, multiplier: 12, fitStructure: "Three-option reveal" };
  it("keeps what the platform published, and the judged structure", () => {
    expect(sourceOfReel(r)).toEqual({ link: r.url, code: "DAbc123xyz", handle: "fashion", account: "Fashion House", thumb: r.thumb, caption: "Three outfits", format: "Reel", views: 90000, multiplier: 12, structure: "Three-option reveal" });
  });
  it("offers SOCIA's video link only when the page was given one", () => {
    expect(servedVideoOf({ refToken: "t", video: "https://scontent.cdninstagram.com/v.mp4" })).toBe("/api/studio/reference/media?url=https%3A%2F%2Fscontent.cdninstagram.com%2Fv.mp4&token=t");
    expect(servedVideoOf({ refToken: null, video: "https://x" })).toBeNull();
  });
  it("is made safe when read back", () => {
    expect(sanitizeSource({ link: "javascript:alert(1)" })).toBeNull();
    expect(sanitizeSource({ link: "https://www.instagram.com/reel/DAbc123xyz/", handle: "Bad Handle!", views: -4, caption: "x".repeat(900) })).toMatchObject({ code: "DAbc123xyz", handle: null, views: null });
  });
});

describe("creative direction from the reference", () => {
  it("follows only what the read measured", () => {
    const words = Array.from({ length: 30 }, () => ({ text: "w", startMs: 0, endMs: 1 }));
    expect(directionFromReference({ durationSec: 15, cuts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], words, audio: { hasAudio: true, audibleRatio: 0.9 } })).toEqual({ pace: "fast", transitions: "punchy", captions: "word", lead: "person" });
    expect(directionFromReference({ durationSec: 30, cuts: [10, 20], words: null, audio: { hasAudio: true, audibleRatio: 0.5 } })).toEqual({ pace: "calm", transitions: "cuts", music: "calm" });
    expect(directionFromReference({ durationSec: 20, cuts: null, words: null, audio: null })).toEqual({});
    expect(directionChanges({ pace: "fast", captions: "word" })).toEqual(["fast pace", "word-by-word captions"]);
  });
});

describe("what a read found, kept per Reel", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } };
  });
  it("is reused within 30 days so the speech isn't transcribed twice", () => {
    const now = new Date("2026-11-25T00:00:00Z");
    writeCached("DAbc123xyz", { durationSec: 21, cuts: [3, 7], words: [{ text: "hi", startMs: 0, endMs: 200 }], audio: null }, now);
    expect(readCached("DAbc123xyz", new Date("2026-12-01T00:00:00Z"))?.words).toHaveLength(1);
    expect(readCached("DAbc123xyz", new Date("2027-01-30T00:00:00Z"))).toBeNull();
    expect(readCached(null)).toBeNull();
  });
  it("never throws when storage is off", () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: { getItem: () => { throw new Error("off"); }, setItem: () => { throw new Error("off"); } } };
    expect(readCached("DAbc123xyz")).toBeNull();
    expect(() => writeCached("DAbc123xyz", { durationSec: 1, cuts: null, words: null, audio: null })).not.toThrow();
  });
});
