// ElevenLabs text to speech for voiceovers: one line at a time through
// POST /v1/text-to-speech/{voice_id}/with-timestamps, which returns the MP3 as
// base64 with each character's start and end time, so captions can follow the
// voice. The voices offered are ElevenLabs' own premade ones, listed from
// GET /v2/voices (their ids aren't fixed in code: the old defaults are being
// replaced, docs 2026-11). Billed per character. Server only: the key never
// leaves it, and only the reason for a failure is logged.
import { pickDefaultVoice, type VoiceChoice } from "@/lib/studioClips/voiceover";

const API = "https://api.elevenlabs.io";
export const VOICE_MODEL = () => process.env.ELEVENLABS_VOICE_MODEL?.trim() || "eleven_multilingual_v2";

export class VoiceError extends Error {
  constructor(public kind: "not_configured" | "rejected" | "busy" | "failed", message: string) { super(message); }
}

export const voiceConfigured = (): boolean => Boolean(process.env.ELEVENLABS_API_KEY?.trim());
const key = (): string => {
  const k = process.env.ELEVENLABS_API_KEY?.trim();
  if (!k) throw new VoiceError("not_configured", "Voiceovers aren't set up on this server yet.");
  return k;
};

async function fail(where: string, res: Response): Promise<never> {
  // The reason, never the key, goes to the log.
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.error(`[voiceover] ${where} failed:`, res.status, detail);
  if (res.status === 401 || res.status === 402 || res.status === 403) throw new VoiceError("not_configured", "Voiceovers aren't available in SOCIA right now. Nothing was counted.");
  if (res.status === 400 || res.status === 404 || res.status === 422) throw new VoiceError("rejected", "The voice service couldn't read that line. Change the words and try again.");
  if (res.status === 429) throw new VoiceError("busy", "The voice service is busy. Try again in a minute.");
  throw new VoiceError("failed", "The voice service couldn't make the voiceover just now.");
}

type RawVoice = { voice_id?: unknown; name?: unknown; description?: unknown; preview_url?: unknown; labels?: Record<string, unknown> | null };

let cached: { at: number; voices: VoiceChoice[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;
/** How many voices a person picks from. */
export const VOICE_CHOICES = 4;

/**
 * A few premade voices to pick from: for each editing style, the one whose
 * description fits it best, so the list covers warm, clear, upbeat and calm.
 * ELEVENLABS_VOICE_IDS (comma-separated) pins the list instead.
 */
export async function listVoices(): Promise<VoiceChoice[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.voices;
  const res = await fetch(`${API}/v2/voices?category=premade&page_size=100`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) })
    .catch((e) => { throw new VoiceError("failed", (e as Error)?.message || "ElevenLabs couldn't be reached."); });
  if (!res.ok) await fail("voices", res);
  const j = (await res.json().catch(() => null)) as { voices?: RawVoice[] } | null;
  const all: VoiceChoice[] = (j?.voices ?? []).flatMap((v) => {
    if (typeof v.voice_id !== "string" || typeof v.name !== "string") return [];
    const labels = v.labels && typeof v.labels === "object" ? Object.values(v.labels).filter((x): x is string => typeof x === "string") : [];
    const description = [typeof v.description === "string" ? v.description : "", ...labels].filter(Boolean).join(", ").slice(0, 200);
    return [{ id: v.voice_id, name: v.name.slice(0, 40), description, preview: typeof v.preview_url === "string" ? v.preview_url : null }];
  });
  const pinned = (process.env.ELEVENLABS_VOICE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let voices: VoiceChoice[];
  if (pinned.length) voices = pinned.flatMap((id) => all.filter((v) => v.id === id)).slice(0, VOICE_CHOICES);
  else {
    voices = [];
    for (const style of ["process", "demo", "energetic", "calm"] as const) {
      const v = pickDefaultVoice(all.filter((x) => !voices.some((y) => y.id === x.id)), style);
      if (v) voices.push(v);
    }
  }
  cached = { at: Date.now(), voices };
  return voices;
}

export type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

/** One line voiced: the MP3 bytes and its character timings. `previous`/`next` keep the read flowing across lines. */
export async function speakLine(args: { text: string; voiceId: string; previous?: string; next?: string; signal?: AbortSignal }): Promise<{ audio: Uint8Array; alignment: Alignment | null }> {
  const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify({
      text: args.text, model_id: VOICE_MODEL(),
      ...(args.previous ? { previous_text: args.previous } : {}), ...(args.next ? { next_text: args.next } : {}),
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
    }),
    signal: args.signal,
  }).catch((e) => { throw new VoiceError("failed", (e as Error)?.message || "ElevenLabs couldn't be reached."); });
  if (!res.ok) await fail("speech", res);
  const j = (await res.json().catch(() => null)) as { audio_base64?: unknown; alignment?: Alignment | null } | null;
  if (!j || typeof j.audio_base64 !== "string" || !j.audio_base64) throw new VoiceError("failed", "The voice service sent back no audio.");
  return { audio: new Uint8Array(Buffer.from(j.audio_base64, "base64")), alignment: j.alignment ?? null };
}
