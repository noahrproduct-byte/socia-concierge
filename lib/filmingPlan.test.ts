import { describe, expect, it } from "vitest";
import { FILM_MINUTES, filmingLine, filmingPlan, nextSession, publishDate, unplacedWhy, type FilmPost } from "./filmingPlan";
import type { Routine } from "./routine";

// The plan's week starts Monday 2026-11-23; "today" is the Friday before unless a test says otherwise.
const MON = "2026-11-23";
const post = (day: string, extra: Partial<FilmPost> = {}): FilmPost => ({ day, title: `${day} post`, hook: "Watch this", format: "Reel", ...extra });
const week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => post(d));
const batch: Routine = { post_days: 5, style: "batch", filming: [{ day: "sat", minutes: 120 }] };
const run = (routine: Routine | null, posts = week, today = "2026-11-20") => filmingPlan({ routine, posts, planMonday: MON, today });

describe("filming sessions", () => {
  it("puts a batch creator's week into the session before it, filming day and posting days apart", () => {
    const p = run(batch);
    // Saturday Nov 21 is before the plan's week: the week's five posts are filmed then.
    expect(p.sessions.map((s) => [s.date, s.items.length, s.used])).toEqual([["2026-11-21", 5, 5 * FILM_MINUTES.video]]);
    expect(p.unplaced).toEqual([]);
    expect(publishDate("Wednesday", MON)).toBe("2026-11-25");
    expect(publishDate("Monday (animated)", MON)).toBe("2026-11-23");
    expect(publishDate("someday", MON)).toBeNull();
  });
  it("never plans more than a session's time holds, and says which posts didn't fit", () => {
    const p = run({ ...batch, filming: [{ day: "sat", minutes: 45 }] });
    expect(p.sessions[0].items).toHaveLength(2);
    expect(p.unplaced.map((u) => u.why)).toEqual(["no_time", "no_time", "no_time"]);
    expect(unplacedWhy(p.unplaced[0])).toBe("Your filming time before Wednesday, Nov 25 is already full.");
  });
  it("doesn't schedule a post before it can be filmed", () => {
    // Films on Wednesday only, and it is already Monday of the plan's week.
    const p = run({ style: "batch", filming: [{ day: "wed", minutes: 120 }] }, week, MON);
    expect(p.unplaced.map((u) => [u.item.title, u.why])).toEqual([["Monday post", "no_session"], ["Tuesday post", "no_session"]]);
    expect(unplacedWhy(p.unplaced[0])).toBe("No filming day before it goes out on Monday, Nov 23.");
    // Wednesday's own post has no earlier session, so it is filmed that day; Thursday and Friday join it.
    expect(p.sessions).toHaveLength(1);
    expect(p.sessions[0].date).toBe("2026-11-25");
    expect(p.sessions[0].items.map((i) => i.title)).toEqual(["Wednesday post", "Thursday post", "Friday post"]);
  });
  it("gives someone who films through the week the latest session before each post", () => {
    const daily: Routine = { style: "daily", filming: [{ day: "mon", minutes: 30 }, { day: "wed", minutes: 30 }, { day: "fri", minutes: 30 }] };
    const p = run(daily, week, MON);
    expect(p.sessions.map((s) => [s.date, s.items.map((i) => i.title.split(" ")[0])])).toEqual([
      ["2026-11-23", ["Monday"]],
      ["2026-11-25", ["Wednesday"]],
      ["2026-11-27", ["Friday"]],
    ]);
    // Tuesday's falls back to Monday's session only if it has room: 30 minutes holds one video.
    expect(p.unplaced.map((u) => u.item.title)).toEqual(["Tuesday post", "Thursday post"]);
  });
  it("leaves out what needs no camera, and what was turned down or is already past", () => {
    const posts = [post("Monday", { animated: true }), post("Tuesday", { maker: "claude" }), post("Wednesday", { decision: { status: "rejected" } }), post("Thursday"), post("Friday", { format: "Carousel" })];
    const p = run(batch, posts);
    expect(p.left_out).toEqual({ animated: 1, claude: 1 });
    expect(p.total).toBe(2);
    expect(p.sessions[0].items.map((i) => [i.title, i.minutes])).toEqual([["Friday post", FILM_MINUTES.still], ["Thursday post", FILM_MINUTES.video]]);
    // On Thursday of the plan's week, Monday to Wednesday are behind us.
    expect(run(batch, week, "2026-11-26").total).toBe(2);
  });
  it("has nothing to lay out without filming days", () => {
    expect(run(null).sessions).toEqual([]);
    expect(run(null).unplaced).toHaveLength(5);
    expect(run({ post_days: 5 }).unplaced.every((u) => u.why === "no_session")).toBe(true);
  });
  it("says what SIO says: today's session, the next one, or what couldn't be placed", () => {
    const p = run(batch);
    expect(filmingLine(p, "2026-11-21")).toBe("Your filming session is ready.");
    expect(filmingLine(p, "2026-11-20")).toBe("Your next filming session is Saturday, Nov 21: 5 posts to film.");
    expect(nextSession(p, "2026-11-22")).toBeNull();
    expect(filmingLine(run(null), "2026-11-20")).toBe("5 posts have no filming session before they go out.");
    expect(filmingLine(run(batch, []), "2026-11-20")).toBeNull();
  });
});
