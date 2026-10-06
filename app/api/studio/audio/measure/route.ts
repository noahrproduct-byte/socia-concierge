import { NextResponse } from "next/server";
import { studioRequest, requireMutate, isMissingTable } from "@/lib/studioClips/auth";
import { storeMeasurement } from "@/lib/audio/server";
import type { AudioFeatures } from "@/lib/audio/features";

export const runtime = "nodejs";

// POST { mediaId, features } | { mediaId, error } — the browser measured (or
// could not measure) one post's sound. Numbers only; the file never arrives.
export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const forbidden = requireMutate(r.ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { mediaId?: string; features?: AudioFeatures; error?: string } | null;
  if (!body?.mediaId || (!body.features && !body.error)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    if (body.features) {
      const f = body.features;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const clean: AudioFeatures = {
        durationSec: num(f.durationSec) ?? 0, audibleRatio: Math.max(0, Math.min(1, num(f.audibleRatio) ?? 0)),
        energyDb: num(f.energyDb), peakDb: num(f.peakDb), bpm: num(f.bpm), bpmConfidence: Math.max(0, Math.min(1, num(f.bpmConfidence) ?? 0)),
        flatness: num(f.flatness), musicScore: Math.max(0, Math.min(1, num(f.musicScore) ?? 0)), musicLikely: Boolean(f.musicLikely),
      };
      await storeMeasurement(r.ctx.client, r.ctx.ownerId, body.mediaId, { features: clean });
    } else {
      await storeMeasurement(r.ctx.client, r.ctx.ownerId, body.mediaId, { error: String(body.error) });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "Run supabase/studio-audio.sql first.", migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
