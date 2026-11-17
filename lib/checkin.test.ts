import { describe, expect, it } from "vitest";
import { checkinDue, checkinSuggestion } from "./checkin";

describe("SIO's weekly check-in", () => {
  it("asks at the end of the week, or on Monday about the week just ended", () => {
    // 2026-11-16 is a Monday.
    expect(checkinDue("2026-11-16")).toEqual({ week: "2026-11-09", phrase: "last week" });
    expect(checkinDue("2026-11-17")).toBeNull();
    expect(checkinDue("2026-11-19")).toBeNull();
    expect(checkinDue("2026-11-20")).toEqual({ week: "2026-11-16", phrase: "this week" });
    expect(checkinDue("2026-11-22")).toEqual({ week: "2026-11-16", phrase: "this week" });
  });
  it("only ever offers one step, and a higher target only after a week that met the current one", () => {
    expect(checkinSuggestion("more", 3, true)).toMatchObject({ offer: 4 });
    expect(checkinSuggestion("more", 3, true).say).toBe("You met your target of 3 posting days a week. Want to try 4 posting days a week? It would start next Monday.");
    expect(checkinSuggestion("more", 3, false).offer).toBeNull();
    expect(checkinSuggestion("more", 3, null).offer).toBeNull();
    expect(checkinSuggestion("more", 7, true).offer).toBeNull();
    expect(checkinSuggestion("too_much", 5, true)).toMatchObject({ offer: 4 });
    expect(checkinSuggestion("too_much", 1, false).offer).toBeNull();
    expect(checkinSuggestion("right", 5, true)).toEqual({ say: "Good. I'll keep your week as it is.", offer: null });
    expect(checkinSuggestion("more", null, true).offer).toBeNull();
  });
  it("never pushes or scolds", () => {
    for (const f of ["too_much", "right", "more"] as const) for (const n of [1, 3, 7]) for (const met of [true, false, null]) {
      expect(checkinSuggestion(f, n, met).say).not.toMatch(/should|must|behind|fail|only \d|grow faster/i);
    }
  });
});
