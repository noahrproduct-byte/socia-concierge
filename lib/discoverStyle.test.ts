import { describe, it, expect } from "vitest";
import { fitOf, FIT_TTL_MS, accountStyle, mainPlatform, missKind, sameStyle, sanitizeMemory, styleKey, styleStale, styleWord, triedRecently, STYLE_TTL_MS, TRY_TTL_MS } from "./discoverStyle";

const AT = "2026-11-14T12:00:00.000Z";

describe("an account's style", () => {
  it("is the style most of its covers share", () => {
    expect(accountStyle(["animated", "animated", "animated", "talking"], AT)).toEqual({ style: "animated", share: 0.75, n: 4, at: AT });
  });
  it("is mixed when no style holds half the covers, and unknown with none read", () => {
    expect(accountStyle(["animated", "talking", "screen", "filmed"], AT)!.style).toBe("mixed");
    expect(accountStyle([null, null], AT)).toBeNull();
    expect(accountStyle(["skit", null, null], AT)).toMatchObject({ style: "skit", n: 1 });
  });
  it("reads as words, and only matches a real style", () => {
    expect(styleWord(accountStyle(["animated"], AT))).toBe("Animated");
    expect(styleWord(accountStyle(["animated", "talking"], AT))).toBe("Animated");
    expect(styleWord(null)).toBeNull();
    const mixed = accountStyle(["animated", "talking", "screen"], AT);
    expect(sameStyle(mixed, mixed)).toBe(false);
    expect(sameStyle(accountStyle(["screen"], AT), accountStyle(["screen", "screen"], AT))).toBe(true);
  });
});

describe("the saved memory", () => {
  it("keeps only valid entries under clean keys", () => {
    const m = sanitizeMemory({
      own: { style: "animated", share: 1, n: 4, at: AT },
      accounts: { "instagram:TheRefundApp": { style: "screen", share: 0.5, n: 4, at: AT }, "bad key": { style: "screen", share: 1, n: 1, at: AT }, "instagram:x": { style: "painting", share: 1, n: 1, at: AT } },
    });
    expect(m.own?.style).toBe("animated");
    expect(Object.keys(m.accounts)).toEqual(["instagram:therefundapp"]);
    expect(sanitizeMemory(null)).toEqual({ own: null, accounts: {}, tried: {}, fit: {} });
  });
  it("is looked at again after a week", () => {
    const s = accountStyle(["animated"], AT)!;
    expect(styleStale(s, new Date(AT))).toBe(false);
    expect(styleStale(s, new Date(Date.parse(AT) + STYLE_TTL_MS + 1))).toBe(true);
    expect(styleStale(null, new Date(AT))).toBe(true);
    expect(styleKey("instagram", "@Socia.App")).toBe("instagram:socia.app");
  });
});

describe("the main platform", () => {
  it("is where the brand posts most, Instagram on a tie, none without posts", () => {
    expect(mainPlatform({ instagram: 12, youtube: 3 })).toBe("instagram");
    expect(mainPlatform({ instagram: 2, youtube: 9 })).toBe("youtube");
    expect(mainPlatform({ instagram: 4, youtube: 4 })).toBe("instagram");
    expect(mainPlatform({ instagram: 0, youtube: null })).toBeNull();
  });
});

describe("tried record", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("keeps valid tries, drops bad keys, dates and reasons", () => {
    const m = sanitizeMemory({ tried: {
      "instagram:BoulderBot": { at: "2026-11-14T10:00:00Z", miss: "not_business" },
      own: { at: "2026-11-14T10:00:00Z" },
      "instagram:x": { at: "nope" },
      "evil key": { at: "2026-11-14T10:00:00Z" },
      "instagram:y": { at: "2026-11-14T10:00:00Z", miss: "<script>" },
    } });
    expect(m.tried).toEqual({
      "instagram:boulderbot": { at: "2026-11-14T10:00:00Z", miss: "not_business" },
      own: { at: "2026-11-14T10:00:00Z" },
      "instagram:y": { at: "2026-11-14T10:00:00Z" },
    });
  });
  it("waits a day after any try", () => {
    const m = sanitizeMemory({ tried: { "instagram:a": { at: new Date(now.getTime() - TRY_TTL_MS + 60_000).toISOString() }, "instagram:b": { at: new Date(now.getTime() - TRY_TTL_MS - 60_000).toISOString() } } });
    expect(triedRecently(m, "instagram:a", now)).toBe(true);
    expect(triedRecently(m, "instagram:b", now)).toBe(false);
    expect(triedRecently(m, "instagram:c", now)).toBe(false);
  });
  it("names a miss", () => {
    expect(missKind("not_found")).toBe("not_found");
    expect(missKind("not_business")).toBe("not_business");
    expect(missKind("no_permission")).toBe("unavailable");
    expect(missKind(undefined)).toBe("unavailable");
  });
});

describe("niche fit", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  it("keeps valid verdicts and drops bad ones", () => {
    const m = sanitizeMemory({ fit: {
      "instagram:ClarkGary": { ok: false, at: "2026-11-15T10:00:00Z" },
      "instagram:kristina": { ok: true, at: "2026-11-15T10:00:00Z" },
      "instagram:x": { ok: "yes", at: "2026-11-15T10:00:00Z" },
      "bad key": { ok: true, at: "2026-11-15T10:00:00Z" },
    } });
    expect(m.fit).toEqual({
      "instagram:clarkgary": { ok: false, at: "2026-11-15T10:00:00Z" },
      "instagram:kristina": { ok: true, at: "2026-11-15T10:00:00Z" },
    });
  });
  it("reads a verdict for a month, then asks again", () => {
    const m = sanitizeMemory({ fit: {
      "instagram:a": { ok: false, at: new Date(now.getTime() - FIT_TTL_MS + 60_000).toISOString() },
      "instagram:b": { ok: true, at: new Date(now.getTime() - FIT_TTL_MS - 60_000).toISOString() },
    } });
    expect(fitOf(m, "instagram:a", now)).toBe(false);
    expect(fitOf(m, "instagram:b", now)).toBeNull();
    expect(fitOf(m, "instagram:c", now)).toBeNull();
  });
});
