// The clips as the pacing and beat rules read them, from what the editor
// holds (lib/studioClips/types.ts BuildSource): words and length; the
// measured silences stay on the server. Pure.
import type { ClipForEdl } from "./edl";
import type { BuildSource } from "./types";

export function clipsForEdl(sources: Record<string, BuildSource> | BuildSource[]): ClipForEdl[] {
  const list = Array.isArray(sources) ? sources : Object.values(sources);
  return list.map((s) => ({ id: s.clipId, position: s.position, durationSec: s.durationSec, words: s.words?.length ? s.words : null, silences: null, medianLuma: null, warmth: null, brightness: null, contrastLevel: null, rmsDb: null, audioLevel: null, hasSpeech: Boolean(s.words?.length) }));
}
