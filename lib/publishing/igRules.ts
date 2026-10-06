// Instagram limits shared by the browser (composer validation) and the server
// (container parameters, the collaborator check). Client-safe: no I/O.

/** Instagram's documented maximum for `collaborators` on one post. */
export const MAX_COLLABORATORS = 3;
/** Instagram usernames: letters, numbers, periods and underscores, up to 30. */
export const IG_USERNAME_RE = /^[a-zA-Z0-9._]{1,30}$/;
export const normalizeUsername = (u: string): string => u.trim().replace(/^@/, "").toLowerCase();
