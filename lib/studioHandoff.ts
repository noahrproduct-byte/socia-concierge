// Quick Analyze → Create Post: what the person chose for a video in Content
// Studio (goal, opening line, ending ask, on-screen text), SOCIA's reading
// of it, and the transcript it already made, kept in this tab's session
// storage under the draft's id so Generate Caption can use them without
// transcribing the video again. Nothing here is stored on the server; a
// draft opened in another tab or browser simply has no handoff.
export type StudioHandoff = {
  observed: string;
  goal: string;
  hook: string;
  cta: string;
  onscreen: string[];
  transcript: string | null;
  audio: string | null;
  savedAt: string;
};

const key = (postId: string) => `socia:studio-handoff:${postId}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveStudioHandoff(postId: string, h: Omit<StudioHandoff, "savedAt">): void {
  try { sessionStorage.setItem(key(postId), JSON.stringify({ ...h, savedAt: new Date().toISOString() })); } catch { /* storage unavailable */ }
}

export function readStudioHandoff(postId: string | null | undefined): StudioHandoff | null {
  if (!postId) return null;
  try {
    const raw = sessionStorage.getItem(key(postId));
    if (!raw) return null;
    const h = JSON.parse(raw) as StudioHandoff;
    if (!h?.savedAt || Date.now() - new Date(h.savedAt).getTime() > MAX_AGE_MS) return null;
    return { ...h, onscreen: Array.isArray(h.onscreen) ? h.onscreen : [] };
  } catch {
    return null;
  }
}
