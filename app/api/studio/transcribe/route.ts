import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTranscriptionProvider, transcribeUrl } from "@/lib/transcribe";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST { path } — transcribe the audio of a video being analysed in Quick
// Analyze. The browser uploads a 16 kHz mono WAV of the sound to the private
// studio-sources bucket under <uid>/quick/; this hands a short-lived signed
// link to the transcription provider and deletes the file as soon as the
// answer is back (or the wait ends).
//   -> { transcript } | { transcript: null, reason: "not_configured" | "timeout" | "failed" }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path.startsWith(`${user.id}/quick/`) || path.includes("..")) return NextResponse.json({ error: "That audio file is not yours." }, { status: 403 });

  const remove = () => storageClient(supabase).storage.from(STUDIO_BUCKET).remove([path]).then(() => undefined, () => undefined);
  const provider = getTranscriptionProvider();
  if (!provider) { await remove(); return NextResponse.json({ transcript: null, reason: "not_configured" }); }
  try {
    const url = (await signUrls(supabase, [path], 600))[path];
    if (!url) return NextResponse.json({ transcript: null, reason: "failed" });
    const transcript = await transcribeUrl(provider, url, Date.now() + 75_000);
    return NextResponse.json(transcript ? { transcript } : { transcript: null, reason: "timeout" });
  } catch (e) {
    console.error("[quick-transcribe]", (e as Error)?.message ?? e);
    return NextResponse.json({ transcript: null, reason: "failed" });
  } finally {
    await remove();
  }
}
