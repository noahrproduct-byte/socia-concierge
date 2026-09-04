import { describe, it, expect } from "vitest";
import { buildAudience, suggestedHour, audienceWindowsText } from "./audience";

// Local-time posts: `new Date("YYYY-MM-DDTHH:mm:ss")` parses as local, which is
// how the browser sees them. 2026-09-01 is a Tuesday; 2026-08-31 a Monday.
const at = (localIso: string, e: number) => ({ t: new Date(localIso).toISOString(), e });

describe("audience timing", () => {
  it("says nothing before five posts", () => {
    const aud = buildAudience([at("2026-09-01T21:00:00", 100)]);
    expect(aud.enough).toBe(false);
    expect(aud.peak).toBeNull();
    expect(suggestedHour(aud, 0)).toBe(12);
    expect(audienceWindowsText([at("2026-09-01T21:00:00", 100)])).toBe("");
  });

  it("lets a BEST day name its hour; every other day takes the overall peak", () => {
    const posts = [
      at("2026-09-01T21:00:00", 2000), // Tue 9 PM, the real peak
      at("2026-09-08T21:00:00", 700), // Tue
      at("2026-09-15T11:00:00", 200), // Tue
      at("2026-08-31T05:00:00", 8), // Mon 5 AM, two tiny posts
      at("2026-09-07T05:00:00", 8), // Mon 5 AM
    ];
    const aud = buildAudience(posts);
    expect(aud.enough).toBe(true);
    expect(aud.peak).toEqual({ day: 1, hour: 21 });
    expect(aud.bestDays).toEqual([1]);
    expect(suggestedHour(aud, 1)).toBe(21);
    // Monday has two posts, but eight reactions each don't earn it a 5 AM slot.
    expect(suggestedHour(aud, 0)).toBe(21);
    expect(suggestedHour(aud, 6)).toBe(21);
    const text = audienceWindowsText(posts);
    expect(text).toContain("Tue 9 PM (peak)");
    expect(text).toContain("Best days: Tue");
    expect(text).toContain("From 5 of the account's own posts");
  });
});
