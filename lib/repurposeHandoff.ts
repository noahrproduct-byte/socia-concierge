// "Worth posting again" → Create post: a one-time mark in this tab's session
// storage that the person just asked SOCIA to repurpose this draft, so Create
// post writes a caption for each platform once. Reopening the draft later (or
// in another tab) doesn't write again; Generate caption is still there.
const key = (postId: string) => `socia:repurpose-captions:${postId}`;
const MAX_AGE_MS = 10 * 60 * 1000;

export function markRepurposeCaptions(postId: string): void {
  try { sessionStorage.setItem(key(postId), String(Date.now())); } catch { /* storage unavailable */ }
}

/** True once, for a mark made in the last few minutes; the mark is removed either way. */
export function takeRepurposeCaptions(postId: string | null | undefined): boolean {
  if (!postId) return false;
  try {
    const raw = sessionStorage.getItem(key(postId));
    if (raw == null) return false;
    sessionStorage.removeItem(key(postId));
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < MAX_AGE_MS;
  } catch {
    return false;
  }
}
