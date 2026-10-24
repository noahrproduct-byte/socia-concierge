import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTranscriptionProvider, transcribeUrl } from "@/lib/transcribe";
import { signUrls, storageClient } from "@/lib/studioClips/storage";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { resolveContext } from "@/lib/context";
import { getEntitlements, getUsage } from "@/lib/entitlements";
import { perUserLimit } from "@/lib/rateLimit";
import { recordTranscription } from "@/lib/aiUsage";
import { MAX_TRANSCRIBE_SECONDS, isExpectedWav, wavSeconds } from "@/lib/transcribe/limits";

export const runtime = "nodejs";
export const maxDuration = 90;

// POST { path, purpose? } — transcribe the audio of a video being analysed in
// Quick Analyze (purpose "studio") or captioned in Create post ("caption").
// The browser uploads a 16 kHz mono WAV of the sound to the private
// studio-sources bucket under <uid>/quick/; this hands a short-lived signed
// link to the transcription provider and deletes the file as soon as the
// answer is back (or the wait ends).
// Transcription is billed by audio length, so before any is sent: the
// owner's allowance for the feature it serves must have a use left, at most
// MAX_TRANSCRIBE_SECONDS of audio, and an hourly ceiling per person.
//   -> { transcript } | { transcript: null, reason: "not_configured" | "timeout" | "failed" | "limit" | "too_long" | "rate_limited" }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { path?: unknown; purpose?: unknown } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  if (!path.startsWith(`${user.id}/quick/`) || path.includes("..")) return NextResponse.json({ error: "That audio file is not yours." }, { status: 403 });
  const purpose = body?.purpose === "caption" ? "caption" : "studio";

  const storage = storageClient(supabase).storage.from(STUDIO_BUCKET);
  const remove = () => storage.remove([path]).then(() => undefined, () => undefined);
  const skip = async (reason: string) => { await remove(); return NextResponse.json({ transcript: null, reason }); };
  const provider = getTranscriptionProvider();
  if (!provider) return skip("not_configured");

  // The transcript only feeds an analysis or a caption: with that allowance
  // used up, don't pay to transcribe (the next step says why it stopped).
  const ctx = await resolveContext(supabase, user.id);
  const usage = await getUsage(ctx.client, await getEntitlements(ctx.client, ctx.ownerId)).catch(() => null);
  if (usage?.[purpose === "caption" ? "content_generation" : "content_studio"]?.remaining === 0) return skip("limit");
  if (await perUserLimit(user.id, "transcribe", 30, "transcriptions")) return skip("rate_limited");

  const slash = path.lastIndexOf("/");
  const listed = await storage.list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 }).catch(() => null);
  const bytes = Number((listed?.data?.[0]?.metadata as { size?: unknown } | undefined)?.size);
  // Length is known only for the exact WAV format the browser makes: an
  // unknown size, or a file that isn't that format, is not sent (it is billed
  // by length, and a compressed file of the same size could be hours long).
  const seconds = Number.isFinite(bytes) ? wavSeconds(bytes) : null;
  if (seconds == null || seconds > MAX_TRANSCRIBE_SECONDS) return skip("too_long");
  try {
    const url = (await signUrls(supabase, [path], 600))[path];
    if (!url) return NextResponse.json({ transcript: null, reason: "failed" });
    const head = await fetch(url, { headers: { range: "bytes=0-255" }, signal: AbortSignal.timeout(10_000) })
      .then(async (r) => (r.ok ? new Uint8Array(await r.arrayBuffer()).subarray(0, 256) : null))
      .catch(() => null);
    if (!head || !isExpectedWav(head)) return NextResponse.json({ transcript: null, reason: "failed" });
    if (seconds != null) recordTranscription(ctx.ownerId, purpose, seconds);
    const transcript = await transcribeUrl(provider, url, Date.now() + 75_000);
    return NextResponse.json(transcript ? { transcript } : { transcript: null, reason: "timeout" });
  } catch (e) {
    console.error("[quick-transcribe]", (e as Error)?.message ?? e);
    return NextResponse.json({ transcript: null, reason: "failed" });
  } finally {
    await remove();
  }
}
