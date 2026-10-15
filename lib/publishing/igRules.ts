// Instagram limits shared by the browser (composer validation) and the server
// (container parameters, the collaborator check). Client-safe: no I/O.

/**
 * Collaborators SOCIA lets you add to one post. Meta's API reference documents
 * up to 3 (META_DOCUMENTED_COLLABORATORS); SOCIA allows 5 (Noah, 2026-10-15)
 * because every list is checked with Instagram on a test container before the
 * post can be scheduled, so a refusal shows up then, never at publish time.
 */
export const MAX_COLLABORATORS = 5;
/** What Meta's IG User Media reference documents for `collaborators` (v25.0). */
export const META_DOCUMENTED_COLLABORATORS = 3;
/** Instagram usernames: letters, numbers, periods and underscores, up to 30. */
export const IG_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
export const normalizeUsername = (u: string): string => u.trim().replace(/^@/, "").toLowerCase();
