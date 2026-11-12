import { describe, expect, it } from "vitest";
import { INTRO_SEEN_KEY, introDue, visitorIntroDue } from "./intro";

describe("introDue", () => {
  it("plays for a new account that has not seen it", () => {
    expect(introDue({ created_at: "2026-11-13T09:00:00Z", user_metadata: {} })).toBe(true);
  });
  it("never replays once finished or skipped", () => {
    expect(introDue({ created_at: "2026-11-13T09:00:00Z", user_metadata: { [INTRO_SEEN_KEY]: "2026-11-13T09:01:00Z" } })).toBe(false);
  });
  it("skips accounts made before the intro shipped", () => {
    expect(introDue({ created_at: "2026-10-01T09:00:00Z", user_metadata: {} })).toBe(false);
  });
  it("skips when signed out or the date is unreadable", () => {
    expect(introDue(null)).toBe(false);
    expect(introDue({ created_at: "", user_metadata: {} })).toBe(false);
  });
});

describe("visitorIntroDue", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
  it("plays for a first-time visitor", () => {
    expect(visitorIntroDue({ signedIn: false, seenCookie: undefined, userAgent: chrome })).toBe(true);
  });
  it("never replays in a browser that has seen it", () => {
    expect(visitorIntroDue({ signedIn: false, seenCookie: "1", userAgent: chrome })).toBe(false);
  });
  it("leaves signed-in people to the app's own check", () => {
    expect(visitorIntroDue({ signedIn: true, seenCookie: undefined, userAgent: chrome })).toBe(false);
  });
  it("never covers the page for crawlers and previews", () => {
    expect(visitorIntroDue({ signedIn: false, seenCookie: undefined, userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" })).toBe(false);
    expect(visitorIntroDue({ signedIn: false, seenCookie: undefined, userAgent: "facebookexternalhit/1.1" })).toBe(false);
  });
});
