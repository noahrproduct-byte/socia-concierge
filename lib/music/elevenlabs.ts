// ElevenLabs Music (POST /v1/music): one original instrumental per request,
// returned as MP3 bytes. Cleared for commercial use on ElevenLabs' paid plans;
// its terms forbid prompts naming artists or songs, and SOCIA's prompts never
// do (lib/music/taste.ts trackPrompt). Server only: the key never leaves it.

const URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";

export class MusicError extends Error {
  constructor(public kind: "not_configured" | "rejected" | "busy" | "failed", message: string) { super(message); }
}

export const musicConfigured = (): boolean => Boolean(process.env.ELEVENLABS_API_KEY?.trim());

export async function composeTrack(args: { prompt: string; lengthMs: number; signal?: AbortSignal }): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new MusicError("not_configured", "Music isn't set up on this server yet.");
  const res = await fetch(URL, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ prompt: args.prompt, music_length_ms: args.lengthMs, force_instrumental: true, model_id: process.env.ELEVENLABS_MUSIC_MODEL?.trim() || "music_v2_5" }),
    signal: args.signal,
  }).catch((e) => { throw new MusicError("failed", (e as Error)?.message || "ElevenLabs couldn't be reached."); });
  if (res.ok) return res.arrayBuffer();
  // The reason, never the key, goes to the log.
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.error("[music] compose failed:", res.status, detail);
  if (res.status === 401 || res.status === 403) throw new MusicError("not_configured", "SOCIA's music account isn't accepting requests. Try again later.");
  if (res.status === 422 || res.status === 400) throw new MusicError("rejected", "The music service couldn't make that track. Try another one.");
  if (res.status === 429) throw new MusicError("busy", "The music service is busy. Try again in a minute.");
  throw new MusicError("failed", "The music service couldn't make that track just now.");
}
