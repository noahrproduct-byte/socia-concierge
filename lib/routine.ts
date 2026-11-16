// The Creator Routine (Noah's SIO brief, 2026-11-16): how a person actually
// makes content. How many days a week they want to post, which days they can
// film and for how long, how they like to work, what they make, and when they
// want it out. SIO asks these at onboarding; they are saved with the brand
// (brand_detail.growth.routine) and told to every writer through growthLines,
// so a plan is built around the person's real week, never around an assumed
// one. Everything here is the person's own answer: nothing is inferred, and
// an unanswered question stays unanswered. Pure and browser-safe.

export const WEEKDAYS = [
  { id: "mon", label: "Mon", name: "Monday" },
  { id: "tue", label: "Tue", name: "Tuesday" },
  { id: "wed", label: "Wed", name: "Wednesday" },
  { id: "thu", label: "Thu", name: "Thursday" },
  { id: "fri", label: "Fri", name: "Friday" },
  { id: "sat", label: "Sat", name: "Saturday" },
  { id: "sun", label: "Sun", name: "Sunday" },
] as const;
export type Weekday = (typeof WEEKDAYS)[number]["id"];

/** Posting days a week a person can choose. */
export const POST_DAYS = [2, 3, 4, 5, 6, 7] as const;
export const MIN_POST_DAYS = 1;
export const MAX_POST_DAYS = 7;

/** Filming time offered for a day, in minutes; any whole number of minutes up to MAX_FILM_MINUTES can be typed. */
export const FILM_TIMES = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
] as const;
export const MAX_FILM_MINUTES = 12 * 60;

export const CREATION_STYLES = [
  { id: "batch", label: "Batch creator", hint: "I prefer filming several videos in one session." },
  { id: "flexible", label: "Flexible creator", hint: "I create content whenever I have time." },
  { id: "daily", label: "Daily creator", hint: "I prefer filming throughout the week." },
  { id: "ai_assisted", label: "AI-assisted creator", hint: "I want SOCIA to help produce as much content as possible." },
] as const;
export type CreationStyle = (typeof CREATION_STYLES)[number]["id"];

export const CONTENT_FORMATS = [
  { id: "talking_head", label: "Talking-head videos" },
  { id: "tutorials", label: "Tutorials" },
  { id: "product_demos", label: "Product demonstrations" },
  { id: "podcasts", label: "Podcasts" },
  { id: "vlogs", label: "Vlogs" },
  { id: "educational", label: "Educational videos" },
  { id: "fitness", label: "Fitness content" },
  { id: "lifestyle", label: "Lifestyle content" },
  { id: "animated", label: "Animated videos" },
  { id: "ai_generated", label: "AI-generated videos" },
  { id: "other", label: "Other" },
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number]["id"];
/** Formats that need nobody on camera. Someone who picks only these is not told to film themselves. */
export const NO_CAMERA_FORMATS: ContentFormat[] = ["animated", "ai_generated"];

export const PUBLISH_MODES = [
  { id: "days", label: "I'll choose the days" },
  { id: "recommend", label: "Let SOCIA recommend days", hint: "From when your own posts have done best, once there is enough to go on." },
  { id: "flexible", label: "Keep it flexible" },
] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number]["id"];

export type FilmingSlot = { day: Weekday; minutes: number };

export type Routine = {
  /** Distinct days a week the person wants to post. */
  post_days?: number;
  /** The date (YYYY-MM-DD) the posting target was last set, so a later change never rewrites earlier weeks. */
  post_days_since?: string;
  /** The days they can film, each with the time they have. */
  filming?: FilmingSlot[];
  style?: CreationStyle;
  formats?: ContentFormat[];
  /** What "Other" means, in their words. */
  formats_other?: string;
  publish_mode?: PublishMode;
  /** Chosen publishing days (publish_mode "days"). */
  publish_days?: Weekday[];
};

const isDay = (v: unknown): v is Weekday => WEEKDAYS.some((d) => d.id === v);
const dayOrder = (d: Weekday) => WEEKDAYS.findIndex((x) => x.id === d);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** A routine from untrusted input: only known choices, in week order, within the limits. Unknown or empty fields are left out. */
export function normalizeRoutine(input: unknown): Routine | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const i = input as Record<string, unknown>;
  const out: Routine = {};
  const n = typeof i.post_days === "number" ? Math.round(i.post_days) : NaN;
  if (n >= MIN_POST_DAYS && n <= MAX_POST_DAYS) out.post_days = n;
  if (isDate(i.post_days_since)) out.post_days_since = i.post_days_since;
  if (Array.isArray(i.filming)) {
    const seen = new Map<Weekday, number>();
    for (const s of i.filming) {
      const r = (s ?? {}) as Record<string, unknown>;
      const m = typeof r.minutes === "number" ? Math.round(r.minutes) : NaN;
      if (isDay(r.day) && m > 0 && m <= MAX_FILM_MINUTES) seen.set(r.day, m);
    }
    out.filming = [...seen].map(([day, minutes]) => ({ day, minutes })).sort((a, b) => dayOrder(a.day) - dayOrder(b.day));
  }
  if (CREATION_STYLES.some((s) => s.id === i.style)) out.style = i.style as CreationStyle;
  if (Array.isArray(i.formats)) out.formats = CONTENT_FORMATS.map((f) => f.id).filter((id) => (i.formats as unknown[]).includes(id));
  if (typeof i.formats_other === "string" && i.formats_other.trim()) out.formats_other = i.formats_other.replace(/\s+/g, " ").trim().slice(0, 80);
  if (PUBLISH_MODES.some((m) => m.id === i.publish_mode)) out.publish_mode = i.publish_mode as PublishMode;
  if (Array.isArray(i.publish_days)) out.publish_days = WEEKDAYS.map((d) => d.id).filter((id) => (i.publish_days as unknown[]).includes(id));
  return Object.keys(out).length ? out : undefined;
}

/** "2 hours", "45 minutes", "1 hour 30 minutes". */
export function filmTime(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h ? `${h} ${h === 1 ? "hour" : "hours"}` : "", m ? `${m} minutes` : ""].filter(Boolean).join(" ") || "0 minutes";
}

const dayName = (d: Weekday) => WEEKDAYS.find((x) => x.id === d)!.name;
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

/** True when every format the person picked needs nobody on camera. */
export const makesNoCameraOnly = (r: Routine | null | undefined): boolean =>
  Boolean(r?.formats?.length) && r!.formats!.every((f) => NO_CAMERA_FORMATS.includes(f));

/**
 * The routine as lines for the writers (the plan, the strategy, Ask SOCIA):
 * only what the person answered, each a rule the writer can follow.
 */
export function routineLines(r: Routine | null | undefined): string[] {
  if (!r) return [];
  const lines: string[] = [];
  if (r.post_days) lines.push(`Posting target: ${r.post_days} ${r.post_days === 1 ? "day" : "days"} a week (their own choice; plan this many posts, on different days).`);
  if (r.filming?.length) lines.push(`Can film on: ${list(r.filming.map((s) => `${dayName(s.day)} (${filmTime(s.minutes)})`))}. Plan filming for these days only and keep each session inside its time.`);
  const style = CREATION_STYLES.find((s) => s.id === r.style);
  if (style) lines.push(`How they make content: ${style.label.toLowerCase()} ("${style.hint}").`);
  if (r.formats?.length) {
    const names = r.formats.map((f) => (f === "other" && r.formats_other ? r.formats_other : CONTENT_FORMATS.find((x) => x.id === f)!.label.toLowerCase()));
    lines.push(`Content they make: ${list(names)}.${makesNoCameraOnly(r) ? " None of it is filmed on camera: do not plan posts that need them to film themselves." : ""}`);
  }
  if (r.publish_mode === "days" && r.publish_days?.length) lines.push(`Preferred posting days: ${list(r.publish_days.map(dayName))}.`);
  else if (r.publish_mode === "recommend") lines.push("Posting days: they asked SOCIA to recommend them from their own results.");
  else if (r.publish_mode === "flexible") lines.push("Posting days: flexible, no fixed days.");
  return lines;
}

/** The questions SIO asks about the routine, in order. */
export const ROUTINE_QUESTIONS = ["post_days", "filming", "style", "formats", "publish"] as const;
export type RoutineQuestion = (typeof ROUTINE_QUESTIONS)[number];

/** Whether a question has an answer that can be saved. */
export function answered(q: RoutineQuestion, r: Routine | null | undefined): boolean {
  if (!r) return false;
  if (q === "post_days") return Boolean(r.post_days);
  if (q === "filming") return Boolean(r.filming?.length);
  if (q === "style") return Boolean(r.style);
  // "Other" only counts once the person has said what it is.
  if (q === "formats") return Boolean(r.formats?.length) && !(r.formats!.includes("other") && !r.formats_other?.trim());
  return r.publish_mode === "days" ? Boolean(r.publish_days?.length) : Boolean(r.publish_mode);
}

/** The first question without an answer: where a returning person picks up. The last one when all are answered. */
export const firstUnanswered = (r: Routine | null | undefined): RoutineQuestion =>
  ROUTINE_QUESTIONS.find((q) => !answered(q, r)) ?? ROUTINE_QUESTIONS[ROUTINE_QUESTIONS.length - 1];

/**
 * What SIO says back about a posting target, from the person's own recent
 * pace when SOCIA could read it. Never a push to post more: a target above
 * the recent pace is named as a step up, nothing else.
 */
export function postDaysNote(target: number | null, recentPerWeek: number | null): string | null {
  if (recentPerWeek == null) return null;
  const recent = Number(recentPerWeek.toFixed(1));
  const base = `You've posted about ${recent} ${recent === 1 ? "time" : "times"} a week lately.`;
  if (target == null) return base;
  if (target > Math.ceil(recentPerWeek) + 1) return `${base} ${target} days is a big step up, so it's fine to start lower and raise it later.`;
  if (target > recentPerWeek) return `${base} ${target} days is a step up from that.`;
  return `${base} ${target} ${target === 1 ? "day" : "days"} is within what you already do.`;
}
