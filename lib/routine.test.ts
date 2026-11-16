import { describe, expect, it } from "vitest";
import { FIRST_QUESTIONS, LATER_QUESTIONS, ROUTINE_QUESTIONS, answered, filmTime, firstUnanswered, makesNoCameraOnly, normalizeRoutine, postDaysNote, routineLines, unanswered } from "./routine";

describe("the creator routine", () => {
  it("keeps only real answers, in week order, inside the limits", () => {
    expect(normalizeRoutine({
      post_days: 5.2, post_days_since: "2026-11-16",
      filming: [{ day: "sat", minutes: 60 }, { day: "wed", minutes: 120 }, { day: "wed", minutes: 150 }, { day: "funday", minutes: 30 }, { day: "mon", minutes: 0 }, { day: "tue", minutes: 99999 }],
      style: "batch", formats: ["tutorials", "nonsense", "talking_head"], formats_other: "  ", publish_mode: "days", publish_days: ["fri", "mon", "x"],
    })).toEqual({
      post_days: 5, post_days_since: "2026-11-16",
      filming: [{ day: "wed", minutes: 150 }, { day: "sat", minutes: 60 }],
      style: "batch", formats: ["talking_head", "tutorials"], publish_mode: "days", publish_days: ["mon", "fri"],
    });
    expect(normalizeRoutine({ post_days: 9, style: "sprint" })).toBeUndefined();
    expect(normalizeRoutine({ post_days: 0 })).toBeUndefined();
    expect(normalizeRoutine(null)).toBeUndefined();
    expect(normalizeRoutine(["mon"])).toBeUndefined();
  });
  it("says a filming time plainly", () => {
    expect(filmTime(30)).toBe("30 minutes");
    expect(filmTime(60)).toBe("1 hour");
    expect(filmTime(150)).toBe("2 hours 30 minutes");
  });
  it("tells the writers only what was answered, as rules they can follow", () => {
    const lines = routineLines({ post_days: 5, filming: [{ day: "wed", minutes: 120 }, { day: "sat", minutes: 60 }], style: "batch", formats: ["talking_head", "tutorials"], publish_mode: "days", publish_days: ["mon", "tue", "fri"] });
    expect(lines).toEqual([
      "Posting target: 5 days a week (their own choice; plan this many posts, on different days).",
      "Can film on: Wednesday (2 hours) and Saturday (1 hour). Plan filming for these days only and keep each session inside its time.",
      'How they make content: batch creator ("I prefer filming several videos in one session.").',
      "Content they make: talking-head videos and tutorials.",
      "Preferred posting days: Monday, Tuesday and Friday.",
    ]);
    expect(routineLines({ post_days: 3 })).toHaveLength(1);
    expect(routineLines(null)).toEqual([]);
    expect(routineLines({})).toEqual([]);
  });
  it("never sends someone who makes faceless content in front of a camera", () => {
    expect(makesNoCameraOnly({ formats: ["animated", "ai_generated"] })).toBe(true);
    expect(makesNoCameraOnly({ formats: ["animated", "vlogs"] })).toBe(false);
    expect(makesNoCameraOnly({})).toBe(false);
    expect(routineLines({ formats: ["animated"] })[0]).toContain("do not plan posts that need them to film themselves");
    expect(routineLines({ formats: ["other"], formats_other: "Stop-motion" })[0]).toBe("Content they make: Stop-motion.");
  });
  it("knows which question a returning person is on", () => {
    expect(firstUnanswered(undefined)).toBe("post_days");
    expect(firstUnanswered({ post_days: 4 })).toBe("filming");
    expect(firstUnanswered({ post_days: 4, filming: [{ day: "wed", minutes: 60 }], style: "daily" })).toBe("formats");
    expect(answered("formats", { formats: ["other"] })).toBe(false);
    expect(answered("formats", { formats: ["vlogs", "other"] })).toBe(false);
    expect(answered("formats", { formats: ["vlogs", "other"], formats_other: "  " })).toBe(false);
    expect(answered("formats", { formats: ["other"], formats_other: "Skits" })).toBe(true);
    expect(answered("publish", { publish_mode: "days" })).toBe(false);
    expect(answered("publish", { publish_mode: "days", publish_days: ["mon"] })).toBe(true);
    expect(answered("publish", { publish_mode: "flexible" })).toBe(true);
    expect(firstUnanswered({ post_days: 4, filming: [{ day: "wed", minutes: 60 }], style: "daily", formats: ["vlogs"], publish_mode: "recommend" })).toBe("publish");
  });
  it("splits the questions: two at onboarding, three later from the corner", () => {
    expect([...FIRST_QUESTIONS, ...LATER_QUESTIONS].sort()).toEqual([...ROUTINE_QUESTIONS].sort());
    const afterOnboarding = { post_days: 4, formats: ["vlogs" as const] };
    expect(unanswered(afterOnboarding, FIRST_QUESTIONS)).toEqual([]);
    expect(unanswered(afterOnboarding, LATER_QUESTIONS)).toEqual(["filming", "style", "publish"]);
    expect(firstUnanswered({ ...afterOnboarding, filming: [{ day: "sat", minutes: 60 }] }, LATER_QUESTIONS)).toBe("style");
    expect(firstUnanswered({ post_days: 4 }, FIRST_QUESTIONS)).toBe("formats");
  });
  it("reflects the person's own pace back without pushing them to post more", () => {
    expect(postDaysNote(null, null)).toBeNull();
    expect(postDaysNote(4, 3.2)).toBe("You've posted about 3.2 times a week lately. 4 days is a step up from that.");
    expect(postDaysNote(7, 2)).toContain("big step up, so it's fine to start lower");
    expect(postDaysNote(2, 3.5)).toBe("You've posted about 3.5 times a week lately. 2 days is within what you already do.");
    expect(postDaysNote(5, 3)).not.toMatch(/should|must|grow faster|will/);
  });
});
