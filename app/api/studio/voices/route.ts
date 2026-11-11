import { NextResponse } from "next/server";
import { studioRequest } from "@/lib/studioClips/auth";
import { listVoices, VoiceError, voiceConfigured } from "@/lib/voiceover/elevenlabs";

export const runtime = "nodejs";

// The voices a voiceover can be read in: a few of ElevenLabs' premade voices,
// each with a short sample to hear. Nothing is counted.
//   GET -> { voices: [{ id, name, description, preview }] }
export async function GET() {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  if (!voiceConfigured()) return NextResponse.json({ voices: [], notConfigured: true });
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (e) {
    const msg = e instanceof VoiceError ? e.message : "The voice list couldn't be loaded just now.";
    return NextResponse.json({ voices: [], error: msg }, { status: 502 });
  }
}
