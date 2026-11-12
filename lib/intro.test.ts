import { describe, expect, it } from "vitest";
import { INTRO_SEEN_KEY, introDue } from "./intro";

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
