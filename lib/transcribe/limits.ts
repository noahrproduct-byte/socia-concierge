// Transcription limits shared by the browser (skip uploading what won't be
// transcribed) and /api/studio/transcribe (enforced). Client-safe: no I/O.

/** Longest audio SOCIA sends for transcription: Instagram's own video maximum. */
export const MAX_TRANSCRIBE_SECONDS = 15 * 60;
/** The browser uploads 16 kHz mono 16-bit WAV: 32,000 bytes a second, plus a 44-byte header. */
export const WAV_BYTES_PER_SECOND = 32_000;
export const wavSeconds = (bytes: number): number => Math.max(0, bytes - 44) / WAV_BYTES_PER_SECOND;

/** Why a transcription didn't happen, as the browser says it. Pure. */
export function transcriptSkippedNote(reason: string | undefined, fallback: string): string {
  switch (reason) {
    case "not_configured": return "Speech transcription isn't set up";
    case "too_long": return `The video is longer than ${MAX_TRANSCRIBE_SECONDS / 60} minutes, so it wasn't transcribed`;
    case "limit": return "This month's allowance is used up, so it wasn't transcribed";
    case "rate_limited": return "Too many transcriptions in the last hour, so it wasn't transcribed";
    default: return fallback;
  }
}
