// ElevenLabs music for one video: POST /v1/music with a text description, a
// length (music_length_ms, 3 s to 10 min) and force_instrumental, which answers
// with the audio file itself (elevenlabs.io/docs/api-reference/music/compose,
// read 2026-11-25). Billed by length, $0.15 a minute (elevenlabs.io/pricing/api,
// recorded by lib/aiUsage.ts recordMusic). Music made through the API is
// cleared for social media use on paid ElevenLabs plans (docs, capabilities/music).
// music_v2_5 is the model the docs recommend (music_v1, the default, is
// retired January 31, 2027); ELEVENLABS_MUSIC_MODEL overrides it, and a model
// the account can't use falls back to music_v1 once. Server only: the key
// never leaves it, and only the reason for a failure is logged.

const API = "https://api.elevenlabs.io";
export const MUSIC_MODEL = () => process.env.ELEVENLABS_MUSIC_MODEL?.trim() || "music_v2_5";
const FALLBACK_MODEL = "music_v1";

export class MusicError extends Error {
  constructor(public kind: "not_configured" | "rejected" | "busy" | "failed", message: string) { super(message); }
}

export const musicConfigured = (): boolean => Boolean(process.env.ELEVENLABS_API_KEY?.trim());

async function fail(res: Response): Promise<never> {
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.error("[music] compose failed:", res.status, detail);
  if (res.status === 401 || res.status === 402 || res.status === 403) throw new MusicError("not_configured", "AI music isn't available in SOCIA right now. No credits were used.");
  if (res.status === 400 || res.status === 422) throw new MusicError("rejected", "The music service couldn't use that description. Describe a mood or a style, not a song or an artist.");
  if (res.status === 429) throw new MusicError("busy", "The music service is busy. Try again in a minute. No credits were used.");
  throw new MusicError("failed", "The music service couldn't make the music just now. No credits were used.");
}

/** One piece of instrumental music: the MP3 bytes and the model that made it. */
export async function composeMusic(args: { prompt: string; seconds: number; signal?: AbortSignal }): Promise<{ audio: Uint8Array; model: string }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new MusicError("not_configured", "AI music isn't set up on this server yet.");
  const lengthMs = Math.round(Math.min(600, Math.max(3, args.seconds)) * 1000);
  const call = (model: string) => fetch(`${API}/v1/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ prompt: args.prompt, music_length_ms: lengthMs, model_id: model, force_instrumental: true }),
    signal: args.signal ?? AbortSignal.timeout(240_000),
  }).catch((e) => { throw new MusicError("failed", (e as Error)?.name === "TimeoutError" ? "The music took too long to make. Try again. No credits were used." : "The music service couldn't be reached. No credits were used."); });

  let model = MUSIC_MODEL();
  let res = await call(model);
  // A model this account can't use (or one retired): the documented default, once.
  if (!res.ok && res.status === 422 && model !== FALLBACK_MODEL) {
    const detail = await res.clone().text().catch(() => "");
    if (/model/i.test(detail)) { model = FALLBACK_MODEL; res = await call(model); }
  }
  if (!res.ok) await fail(res);
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength < 1000) throw new MusicError("failed", "The music service sent back an empty file. Try again. No credits were used.");
  return { audio, model };
}
