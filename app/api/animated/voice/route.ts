import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { recordVoice } from "@/lib/aiUsage";
import { listVoices, speakLine, VoiceError, voiceConfigured } from "@/lib/voiceover/elevenlabs";
import { VOICE_MAX_CHARS, voiceScript, wordStarts } from "@/lib/animated/voice";
import { END_ICONS } from "@/lib/animated/board";

export const runtime = "nodejs";
export const maxDuration = 120;

// The voiceover for an animated storyboard video: ElevenLabs reads the
// captions, then the ending card, and the answer carries when each caption
// word is spoken so the captions and the stage follow the voice. The audio is
// returned to the browser that asked (the video is rendered there); nothing is
// stored. Counts one voiceover on the plan, given back when it fails.
//   POST { phrases: string[], end: { title: [string, string], rows: [{ a, b }] }, voiceId? }
//     -> { audio (base64 MP3), words, end, text, voice: { id, name } }

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");

function voiceErr(e: VoiceError) {
  return NextResponse.json({ error: e.message, kind: e.kind, notConfigured: e.kind === "not_configured" }, { status: e.kind === "busy" ? 429 : e.kind === "not_configured" ? 503 : e.kind === "rejected" ? 400 : 502 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  if (!voiceConfigured()) return NextResponse.json({ error: "Voiceovers aren't set up on this server yet.", notConfigured: true }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json({ error: "That request is too long." }, { status: 413 });
  let b: { phrases?: unknown; end?: { title?: unknown; rows?: unknown } | null; voiceId?: unknown } | null = null;
  try { b = JSON.parse(raw); } catch { b = null; }
  const phrases = (Array.isArray(b?.phrases) ? b!.phrases : []).slice(0, 14).map((p) => ({ text: clean(p, 90), em: "" })).filter((p) => p.text);
  if (phrases.length < 3) return NextResponse.json({ error: "This video has no captions to read." }, { status: 400 });
  const title = Array.isArray(b?.end?.title) ? b!.end!.title : [];
  const rows = (Array.isArray(b?.end?.rows) ? (b!.end!.rows as { a?: unknown; b?: unknown }[]) : []).slice(0, 1).map((r) => ({ icon: END_ICONS[0], a: clean(r?.a, 40), b: clean(r?.b, 40) }));
  const script = voiceScript({ phrases, end: { eyebrow: "", title: [clean(title[0], 22), clean(title[1], 22)], rows } });
  if (script.text.length > VOICE_MAX_CHARS) return NextResponse.json({ error: "That is too much to read in one video." }, { status: 400 });

  const limited = await perUserLimit(ctx.ownerId, "animated_voice", 20, "voiceovers");
  if (limited) return limited;
  const u = await requireUsage(ctx.client, ctx.ownerId, "voiceovers", { feature: "auto_build" });
  if (u.denied) return u.denied;
  try {
    const voices = await listVoices();
    if (!voices.length) throw new VoiceError("not_configured", "No voices are available in SOCIA right now. Nothing was counted.");
    const voice = voices.find((v) => v.id === b?.voiceId) ?? voices[0];
    const { audio, alignment } = await speakLine({ text: script.text, voiceId: voice.id, signal: AbortSignal.timeout(90_000) });
    // The characters were sent, so they are counted even if the timing below can't be read.
    recordVoice(ctx.ownerId, script.text.length);
    const timed = wordStarts(script.text, script.captions, alignment);
    if (!timed) {
      await u.release();
      console.error("[animated/voice] the timings didn't match the captions");
      return NextResponse.json({ error: "The voice came back without its timing, so the captions couldn't follow it. Try again." }, { status: 502 });
    }
    return NextResponse.json({ audio: Buffer.from(audio).toString("base64"), words: timed.words, end: timed.end, text: script.captions, voice: { id: voice.id, name: voice.name }, usage: u.usage });
  } catch (e) {
    await u.release();
    if (e instanceof VoiceError) return voiceErr(e);
    console.error("[animated/voice]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't make the voiceover. Try again." }, { status: 500 });
  }
}
