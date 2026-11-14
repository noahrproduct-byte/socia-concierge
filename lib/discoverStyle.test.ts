import { describe, it, expect } from "vitest";
import { accountStyle, mainPlatform, sameStyle, sanitizeMemory, styleKey, styleStale, styleWord, STYLE_TTL_MS } from "./discoverStyle";

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
    expect(sanitizeMemory(null)).toEqual({ own: null, accounts: {} });
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
