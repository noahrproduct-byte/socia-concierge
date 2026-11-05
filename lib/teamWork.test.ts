import { describe, expect, it } from "vitest";
import { activityLines, dueLabel, isYmd, nextDateFor, personLabel, readyRoleFor, shortName, sortTasks, taskForPost, type Person } from "./teamWork";

// Thursday, 5 November 2026, local time.
const THU = new Date(2026, 10, 5, 15, 0, 0);

describe("nextDateFor", () => {
  it("finds the next date on that weekday, today included", () => {
    expect(nextDateFor("Thursday", THU)).toBe("2026-11-05");
    expect(nextDateFor("Friday", THU)).toBe("2026-11-06");
    expect(nextDateFor("Wednesday", THU)).toBe("2026-11-11");
    expect(nextDateFor("Monday", THU)).toBe("2026-11-09");
    expect(nextDateFor("Sun", THU)).toBe("2026-11-08");
  });
  it("gives nothing for a day it can't read", () => {
    expect(nextDateFor("Someday", THU)).toBeNull();
    expect(nextDateFor(null, THU)).toBeNull();
  });
});

describe("dueLabel", () => {
  it("says today, tomorrow, a date, or that it was due", () => {
    expect(dueLabel("2026-11-05", THU)).toEqual({ text: "Film by today", late: false });
    expect(dueLabel("2026-11-06", THU)).toEqual({ text: "Film by tomorrow", late: false });
    expect(dueLabel("2026-11-10", THU)?.text).toBe("Film by Tue, Nov 10");
    expect(dueLabel("2026-11-03", THU)).toEqual({ text: "Was due Tue, Nov 3", late: true });
    expect(dueLabel(null, THU)).toBeNull();
    expect(dueLabel("next week", THU)).toBeNull();
  });
  it("accepts only real dates", () => {
    expect(isYmd("2026-11-06")).toBe(true);
    expect(isYmd("2026-13-40")).toBe(false);
    expect(isYmd("06/11/2026")).toBe(false);
  });
});

describe("people", () => {
  it("names people by email, You, or their role", () => {
    expect(personLabel({ email: "umar@example.com", role: "member" }, false)).toBe("umar@example.com");
    expect(personLabel({ email: "noah@example.com", role: "owner" }, true)).toBe("You");
    expect(personLabel({ email: null, role: "owner" }, false)).toBe("The owner");
    expect(shortName("umar@example.com")).toBe("umar");
    expect(shortName("The owner")).toBe("The owner");
  });
  it("lets a Member mark drafts ready only when there are no approvals", () => {
    expect(readyRoleFor("member", false)).toBe("mark");
    expect(readyRoleFor("member", true)).toBe("review");
    expect(readyRoleFor("admin", false)).toBe("review");
    expect(readyRoleFor("owner", false)).toBe("review");
  });
});

describe("tasks", () => {
  const t = (over: Partial<{ planId: string; day: string | null; assigneeId: string; status: "open" | "done"; dueOn: string | null; createdAt: string }>) => ({
    planId: "p1", day: "Thursday", assigneeId: "m", status: "open" as const, dueOn: null, createdAt: "2026-11-01T00:00:00Z", ...over,
  });

  it("finishes the viewer's own open task for the same plan and day", () => {
    const mine = t({});
    const tasks = [t({ assigneeId: "someone-else" }), t({ status: "done" }), mine];
    expect(taskForPost(tasks, { planId: "p1", planDay: "thursday" }, "m")).toBe(mine);
  });
  it("finishes nothing for a post that isn't from the plan, or another day", () => {
    expect(taskForPost([t({})], { planId: null, planDay: "Thursday" }, "m")).toBeNull();
    expect(taskForPost([t({})], { planId: "p1", planDay: "Friday" }, "m")).toBeNull();
    expect(taskForPost([t({})], { planId: "p2", planDay: "Thursday" }, "m")).toBeNull();
  });
  it("puts open tasks first, soonest due first", () => {
    const sorted = sortTasks([
      t({ status: "done", dueOn: "2026-11-01" }),
      t({ dueOn: null }),
      t({ dueOn: "2026-11-08" }),
      t({ dueOn: "2026-11-06" }),
    ]);
    expect(sorted.map((x) => `${x.status}:${x.dueOn}`)).toEqual(["open:2026-11-06", "open:2026-11-08", "open:null", "done:2026-11-01"]);
  });
});

describe("activityLines", () => {
  const people = new Map<string, Person>([
    ["o", { userId: "o", role: "owner", label: "You", isYou: true }],
    ["m", { userId: "m", role: "member", label: "umar@example.com", isYou: false }],
  ]);
  it("writes each event as a sentence, newest first", () => {
    const lines = activityLines([
      { kind: "added", at: "2026-11-04T10:00:00Z", actorId: "m", title: "Walk in through the door", href: "/create?post=1" },
      { kind: "assigned", at: "2026-11-03T10:00:00Z", actorId: "o", otherId: "m", title: "Walk in through the door" },
      { kind: "ready", at: "2026-11-05T10:00:00Z", actorId: "m", title: "Walk in through the door" },
      { kind: "assigned", at: "2026-11-02T10:00:00Z", actorId: "o", otherId: "o", title: "Pastry close-up" },
    ], people);
    expect(lines.map((l) => l.text)).toEqual([
      "umar@example.com marked ready for review “Walk in through the door”",
      "umar@example.com added “Walk in through the door”",
      "You gave umar@example.com “Walk in through the door”",
      "You gave yourself “Pastry close-up”",
    ]);
    expect(lines[1].href).toBe("/create?post=1");
  });
  it("names someone who left the workspace honestly", () => {
    expect(activityLines([{ kind: "finished", at: "2026-11-04T10:00:00Z", actorId: "gone", title: "X" }], people)[0].text).toBe("Someone who left finished “X”");
  });
});
