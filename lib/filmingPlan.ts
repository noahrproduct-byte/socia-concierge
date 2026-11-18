// Filming sessions (Noah's SIO brief, 2026-11-16): the posts of the current
// Content Plan laid out across the days the person said they can film
// (lib/routine.ts), so the videos are made before they are due.
//
// - Filming day and publishing day are separate: a post is filmed in a
//   session before the day it goes out. Someone who films as they go
//   (flexible or daily) may film on the day itself.
// - A batch creator's posts are gathered into as few sessions as will hold
//   them; someone who films through the week gets each post in the latest
//   session before it is due.
// - A session holds what its time allows. The time a video takes is a stated
//   allowance (FILM_MINUTES), shown to the person as that, not a measurement.
// - A post no session can take is listed as unplaced with the reason. Nothing
//   is moved, and nothing on the Calendar is touched.
// - Posts made without a camera (animated, or made by the person's Claude)
//   are left out, and counted so the screen can say so.
//
// Pure and browser-safe.
import { addDays } from "./postingStreak";
import { weekdayIndex } from "./scheduling";
import { WEEKDAYS, type CreationStyle, type Routine, type Weekday } from "./routine";

/** Minutes allowed for filming one post. A planning allowance, said on screen as one. */
export const FILM_MINUTES = { video: 20, still: 10 } as const;

export type FilmPost = {
  id?: string;
  day: string;
  title?: string;
  concept?: string;
  hook?: string;
  format?: string;
  animated?: boolean;
  maker?: "you" | "claude";
  decision?: { status?: string } | null;
};

export type FilmItem = { key: string; title: string; hook: string; format: string; publish: string; minutes: number };
export type FilmSession = { date: string; minutes: number; used: number; items: FilmItem[] };
export type Unplaced = { item: FilmItem; why: "no_session" | "no_time" };
export type FilmingPlan = { sessions: FilmSession[]; unplaced: Unplaced[]; left_out: { animated: number; claude: number }; total: number };

const isStill = (format: string) => /carousel|photo|static|image|story/i.test(format);
const dayOfDate = (date: string): Weekday => WEEKDAYS[(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7].id;
/** Someone who films as they go may film a post on the day it goes out. */
const sameDayOk = (style: CreationStyle | undefined) => style === "flexible" || style === "daily";

/** The date a plan post goes out, in the plan's week. Null when its day isn't a weekday. */
export function publishDate(day: string, planMonday: string): string | null {
  const wd = weekdayIndex(day);
  return wd == null ? null : addDays(planMonday, (wd + 6) % 7);
}

/**
 * The plan's posts laid out over the person's filming days, from today to the
 * end of the plan's week.
 */
export function filmingPlan(input: { routine: Routine | null | undefined; posts: FilmPost[]; planMonday: string; today: string }): FilmingPlan {
  const slots = new Map((input.routine?.filming ?? []).map((s) => [s.day, s.minutes] as const));
  const style = input.routine?.style;
  const left_out = { animated: 0, claude: 0 };
  const items: FilmItem[] = [];
  input.posts.forEach((p, i) => {
    if (p.decision?.status === "rejected") return;
    const publish = publishDate(p.day, input.planMonday);
    if (!publish || publish < input.today) return;
    if (p.animated) { left_out.animated++; return; }
    if (p.maker === "claude") { left_out.claude++; return; }
    const format = (p.format ?? "").trim() || "Post";
    items.push({ key: p.id ?? `p${i}`, title: (p.title || p.concept || "Untitled post").trim().slice(0, 90), hook: (p.hook ?? "").trim().slice(0, 160), format, publish, minutes: isStill(format) ? FILM_MINUTES.still : FILM_MINUTES.video });
  });
  items.sort((a, b) => a.publish.localeCompare(b.publish));

  // Every filming day from today to the end of the plan's week.
  const sessions: FilmSession[] = [];
  const end = addDays(input.planMonday, 6);
  for (let d = input.today; d <= end; d = addDays(d, 1)) {
    const minutes = slots.get(dayOfDate(d));
    if (minutes) sessions.push({ date: d, minutes, used: 0, items: [] });
  }

  const unplaced: Unplaced[] = [];
  for (const it of items) {
    const before = sessions.filter((s) => (sameDayOk(style) ? s.date <= it.publish : s.date < it.publish));
    // Nobody films the day after: with no session before it, the same day is the only one left.
    const usable = before.length ? before : sessions.filter((s) => s.date === it.publish);
    if (!usable.length) { unplaced.push({ item: it, why: "no_session" }); continue; }
    // Batch: the earliest session with room, so the week's videos are made together. Otherwise the latest, close to the day it goes out.
    const order = sameDayOk(style) ? [...usable].reverse() : usable;
    const s = order.find((x) => x.used + it.minutes <= x.minutes);
    if (!s) { unplaced.push({ item: it, why: "no_time" }); continue; }
    s.items.push(it);
    s.used += it.minutes;
  }
  // In a session, the same kind of post together, so the camera and the set-up change as little as possible.
  for (const s of sessions) s.items.sort((a, b) => a.format.localeCompare(b.format) || a.publish.localeCompare(b.publish));
  return { sessions: sessions.filter((s) => s.items.length), unplaced, left_out, total: items.length };
}

/** The session being filmed today, or the next one. */
export function nextSession(plan: FilmingPlan, today: string): { session: FilmSession; isToday: boolean } | null {
  const s = plan.sessions.find((x) => x.date >= today);
  return s ? { session: s, isToday: s.date === today } : null;
}

const long = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What SIO says about filming: today's session, the next one, or what couldn't be placed. */
export function filmingLine(plan: FilmingPlan, today: string): string | null {
  const next = nextSession(plan, today);
  if (next?.isToday) return "Your filming session is ready.";
  if (next) return `Your next filming session is ${long(next.session.date)}: ${n(next.session.items.length, "post", "posts")} to film.`;
  if (plan.unplaced.length) return `${n(plan.unplaced.length, "post has", "posts have")} no filming session before ${plan.unplaced.length === 1 ? "it goes" : "they go"} out.`;
  return null;
}

/** Why a post isn't in a session, in words. */
export function unplacedWhy(u: Unplaced): string {
  return u.why === "no_session"
    ? `No filming day before it goes out on ${long(u.item.publish)}.`
    : `Your filming time before ${long(u.item.publish)} is already full.`;
}

/** The same allowance, said to the Content Plan writer so a week's filmed posts fit the filming time (lib/prompt.ts). */
export const FILMING_ALLOWANCE_LINE = `Plan each filmed video at about ${FILM_MINUTES.video} minutes of filming and each photo or carousel at about ${FILM_MINUTES.still}; the week's filmed posts must fit inside the filming time listed in the routine, and a post that doesn't fit is better left out than rushed.`;

