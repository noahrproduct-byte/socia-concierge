// Transcription limits shared by the browser (skip uploading what won't be
// transcribed) and /api/studio/transcribe (enforced). Client-safe: no I/O.

/** Longest audio SOCIA sends for transcription: Instagram's own video maximum. */
export const MAX_TRANSCRIBE_SECONDS = 15 * 60;
/** The browser uploads 16 kHz mono 16-bit WAV: 32,000 bytes a second, plus a 44-byte header. */
export const WAV_BYTES_PER_SECOND = 32_000;
export const wavSeconds = (bytes: number): number => Math.max(0, bytes - 44) / WAV_BYTES_PER_SECOND;

/**
 * The format SOCIA's browser uploads, read from the file's own WAV header:
 * "RIFF....WAVE", PCM, 16 kHz, mono, 16-bit. Anything else is refused, because
 * the length check assumes exactly that format (a compressed file of the same
 * size could hold hours of audio). Pure.
 */
export function isExpectedWav(head: Uint8Array): boolean {
  if (head.length < 36) return false;
  const text = (from: number) => String.fromCharCode(...head.subarray(from, from + 4));
  if ((text(0) !== "RIFF" && text(0) !== "RF64") || text(8) !== "WAVE") return false;
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  // Walk the chunks to "fmt " (an RF64 file puts ds64 first), as parseWav does.
  let off = 12;
  while (off + 8 <= head.length) {
    const size = dv.getUint32(off + 4, true);
    if (text(off) === "fmt ") {
      const body = off + 8;
      if (body + 16 > head.length) return false;
      return dv.getUint16(body, true) === 1 && dv.getUint16(body + 2, true) === 1 && dv.getUint32(body + 4, true) === 16_000 && dv.getUint16(body + 14, true) === 16;
    }
    off += 8 + size + (size % 2);
  }
  return false;
}

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
