// Email confirmation at sign-up and log-in, in plain words. Supabase sends
// the confirmation email and refuses a log-in until the address is confirmed
// (when "Confirm email" is on for the project); these helpers only turn its
// answers into what SOCIA says and decide where a confirmation link may land.
// Pure and browser-safe.
import { safeNext } from "./safeNext";

/** Seconds Supabase makes one address wait between confirmation emails. */
export const RESEND_WAIT = 60;

/** Link kinds /auth/confirm accepts (Supabase's email link types). */
export const CONFIRM_TYPES = ["email", "signup", "magiclink", "recovery", "invite", "email_change"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];
export const isConfirmType = (v: string | null): v is ConfirmType => (CONFIRM_TYPES as readonly string[]).includes(v ?? "");

type AuthErr = { code?: string | null; message?: string | null; status?: number | null } | null | undefined;

/** The log-in was refused because the address hasn't been confirmed yet. */
export const isUnconfirmed = (e: AuthErr): boolean => e?.code === "email_not_confirmed" || /email not confirmed/i.test(e?.message ?? "");

/** What to say when an auth email couldn't be sent, or null when the error isn't about sending. */
export function sendProblem(e: AuthErr): string | null {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "over_email_send_rate_limit" || e?.status === 429 || /rate limit|only request this after/i.test(msg)) return "We just sent one. Wait a minute, then ask again.";
  if (code === "email_address_not_authorized") return "We couldn't send email to that address right now. Try again later or sign up with Google.";
  if (code === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(msg)) return "That email address doesn't look right. Check it and try again.";
  return null;
}

/**
 * Sign-up for an address that already has a confirmed account answers with a
 * user that has no identities (Supabase hides whether the address exists), and
 * sends nothing.
 */
export const alreadyRegistered = (user: { identities?: unknown[] | null } | null | undefined): boolean =>
  Boolean(user) && Array.isArray(user!.identities) && user!.identities!.length === 0;

/** Digits in the code Supabase emails (its default is 6; a project can set up to 10). */
export const CODE_MIN = 6;
export const CODE_MAX = 10;

/** What was typed or pasted, as the code: digits only (spaces, dashes and a pasted "123 456" are fine). */
export const cleanCode = (raw: string): string => raw.replace(/\D/g, "").slice(0, CODE_MAX);
export const codeReady = (code: string): boolean => code.length >= CODE_MIN && code.length <= CODE_MAX;

/** What to say when a code was refused, or when it couldn't be checked. */
export function codeProblem(e: AuthErr): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "over_request_rate_limit" || e?.status === 429) return "Too many tries. Wait a minute, then try again.";
  if (code === "otp_expired" || /expired/i.test(msg)) return "That code has expired. Send a new one and use the newest email.";
  return "That code isn't right. Check the newest email, or send a new code.";
}

/** What the log-in page says for ?error=…, or null. */
export function linkProblem(code: string | null | undefined): string | null {
  if (code === "link") return "That link has expired or was already used. Log in, or ask for a new link.";
  if (code === "auth") return "That link couldn't sign you in on this device. If you just confirmed your email, log in with your password. Otherwise ask for a new link.";
  return null;
}

/**
 * Where a confirmed link goes next. Only a path on this site; the auth routes
 * themselves are never a destination. `next` may arrive as a full address on
 * this site (the email template's redirect), which is cut down to its path.
 */
export function confirmNext(raw: string | null | undefined, origin: string, type: ConfirmType): string {
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard";
  let path = raw ?? "";
  if (path.startsWith(`${origin}/`)) path = path.slice(origin.length);
  const next = safeNext(path, fallback);
  return next.startsWith("/auth/") ? fallback : next;
}
