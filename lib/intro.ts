// The first-run intro film (components/intro). It plays once per person,
// for accounts made after it shipped, and is remembered on the account
// (Supabase auth user metadata), so a second device never replays it. No
// table: it is one timestamp about the person's own session.

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
