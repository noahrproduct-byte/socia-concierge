// Shared by the server (lib/commentDrafts.ts) and the Comments inbox. Client-safe.

/** comment_drafts.error when SOCIA suggests not replying at all (spam, bots,
 *  unrelated promotion): no reply text is stored, so nothing can be sent by
 *  accident; the person can still write one. */
export const SUGGEST_SKIP = "suggest_skip";
