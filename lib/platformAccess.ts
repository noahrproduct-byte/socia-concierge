// Who may connect a platform that is offline for everyone else
// (lib/platformStatus.ts): admins, and the accounts listed in
// PLATFORM_EARLY_ACCESS_EMAILS (comma-separated), such as the SOCIA account
// Meta's App Review reviewers sign in with. The list lifts only the offline
// switch; it grants nothing else. Server only.
import { isAdminEmail } from "./admin";
import { offlineReason } from "./platformStatus";

export function hasEarlyAccess(email: string | null | undefined): boolean {
  const allow = (process.env.PLATFORM_EARLY_ACCESS_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allow.includes(email.toLowerCase()));
}

/** Why this person can't connect the platform right now, or null when they can. */
export function offlineFor(platform: string, email: string | null | undefined): string | null {
  if (isAdminEmail(email) || hasEarlyAccess(email)) return null;
  return offlineReason(platform);
}
