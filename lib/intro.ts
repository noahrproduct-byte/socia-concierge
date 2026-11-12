// The first-run intro film (components/intro). It plays once per person:
// on the homepage for a first-time visitor, or after sign-in for an account
// made after it shipped. An account remembers it in Supabase auth user
// metadata, so a second device never replays it; a visitor's browser
// remembers it in a cookie, which the server reads so a returning visitor
// never sees a black first frame. No table: it is one timestamp.

/** Accounts created from this moment on see the intro once. */
export const INTRO_SINCE = "2026-11-12T00:00:00Z";

/** The user-metadata key that records when the intro was finished or skipped. */
export const INTRO_SEEN_KEY = "socia_intro_seen_at";

type IntroUser = { created_at?: string | null; user_metadata?: Record<string, unknown> | null };

/** True when this person has not seen the intro and their account is new enough to get it. */
export function introDue(user: IntroUser | null | undefined): boolean {
  if (!user) return false;
  if (user.user_metadata?.[INTRO_SEEN_KEY]) return false;
  const made = Date.parse(user.created_at ?? "");
  return Number.isFinite(made) && made >= Date.parse(INTRO_SINCE);
}

/** Set in the browser when the film is finished or skipped. Read by the server, so it never renders the film again there. */
export const INTRO_COOKIE = "socia_intro_seen";

/** Search engines, link previews and page-speed tools get the page itself, never the film over it. */
const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|pagespeed|headlesschrome|vercel-screenshot/i;

/** True when a signed-out visitor should see the film on the homepage: not seen in this browser, and a person, not a crawler. */
export function visitorIntroDue(input: { signedIn: boolean; seenCookie: string | undefined; userAgent: string | null }): boolean {
  if (input.signedIn || input.seenCookie) return false;
  return !CRAWLER.test(input.userAgent ?? "");
}
