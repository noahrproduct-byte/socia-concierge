import { describe, expect, it } from "vitest";
import { dayShift, isMovableDraft, moveProblem, shiftDays } from "./calendarMoves";

describe("moving drafts on the Calendar", () => {
  it("keeps the time of day on the new day", () => {
    const at = new Date(2026, 10, 3, 18, 30).toISOString();
    const moved = new Date(shiftDays(at, 2));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([5, 18, 30]);
    expect(dayShift(new Date(2026, 10, 3, 23, 0), new Date(2026, 10, 5, 1, 0))).toBe(2);
    expect(dayShift(new Date(2026, 10, 5), new Date(2026, 10, 3))).toBe(-2);
  });
  it("moves drafts only, and never into the past", () => {
    expect(isMovableDraft({ status: "draft" })).toBe(true);
    expect(isMovableDraft({ status: "draft", destinations: [{ status: "draft" }, { status: "cancelled" }] })).toBe(true);
    expect(isMovableDraft({ status: "draft", destinations: [{ status: "scheduled" }] })).toBe(false);
    expect(isMovableDraft({ status: "scheduled" })).toBe(false);
    const now = new Date(2026, 10, 3, 12);
    expect(moveProblem(new Date(2026, 10, 2), now)).not.toBeNull();
    expect(moveProblem(new Date(2026, 10, 3), now)).toBeNull();
  });
});
