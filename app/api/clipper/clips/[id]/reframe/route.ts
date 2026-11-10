import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { createServiceClient } from "@/lib/supabase/service";
import { anthropic, effortFor, modelFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { MAX_SAMPLES, REFRAME_SCHEMA, cleanCropPath, frameLabel, reframeSystem } from "@/lib/clipper/reframe";
import { clipWords, formatLines, transcriptLines, unpackWords } from "@/lib/clipper/pick";
import { readRanking } from "@/lib/clipper/ranking";
import { speakerPath } from "@/lib/clipper/speakers";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FRAME_CHARS = 200_000;

// POST { frames: [{ t, data }], width, height, item? } -> { path }: where the vertical
// frame should be during one of SOCIA's own clips. The browser reads the frames
// from the source; Claude decides what to keep in view; the path is saved on
// the clip. { path: null } means nothing usable came back: the crop stays put.
// `item` is one moment of a ranking: its path goes back to the render, not on the row.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.ctx.ownerId, "clipper_reframe", 120, "clip framing");
  if (limited) return limited;
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { frames?: { t?: unknown; data?: unknown }[]; width?: unknown; height?: unknown; item?: unknown } | null;
  const width = Number(body?.width), height = Number(body?.height);
  const frames = (Array.isArray(body?.frames) ? body.frames : []).slice(0, MAX_SAMPLES)
    .filter((f): f is { t: number; data: string } => Number.isFinite(f?.t) && typeof f?.data === "string" && f.data.length > 0 && f.data.length <= MAX_FRAME_CHARS);
  if (!frames.length || !(width > 0) || !(height > 0)) return NextResponse.json({ error: "No frames were sent." }, { status: 400 });
  const share = Math.min(1, (height * (9 / 16)) / width);
  if (share >= 1) return NextResponse.json({ path: null });
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    const item = typeof body?.item === "number" && Number.isInteger(body.item) ? body.item : null;
    let q = svc.from("clips").select(item == null ? "job_id, start_ms, end_ms" : "job_id, start_ms, end_ms, ranking").eq("id", id).eq("user_id", r.ctx.ownerId);
    if (r.ctx.workspace?.id) q = q.eq("workspace_id", r.ctx.workspace.id);
    const { data } = await q.maybeSingle();
    const clip = data as unknown as { job_id: string; start_ms: number | null; end_ms: number | null; ranking?: unknown } | null;
    const range = item == null ? { startMs: clip?.start_ms, endMs: clip?.end_ms } : readRanking(clip?.ranking)?.items[item] ?? { startMs: null, endMs: null };
    if (!clip || range.startMs == null || range.endMs == null) return NextResponse.json({ error: "That clip does not exist." }, { status: 404 });
    const durationSec = (range.endMs - range.startMs) / 1000;
    const { data: job } = await svc.from("clip_jobs").select("transcript").eq("id", clip.job_id).eq("user_id", r.ctx.ownerId).maybeSingle();
    // What is said, with times counted from the clip's start, like the frames.
    const startMs = range.startMs;
    const words = clipWords(unpackWords((job as { transcript?: unknown } | null)?.transcript), startMs, range.endMs)
      .map((w) => ({ ...w, startMs: w.startMs - startMs, endMs: w.endMs - startMs }));
    const content = [
      ...frames.flatMap((f) => [
        { type: "text" as const, text: frameLabel(f.t) },
        { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.data } },
      ]),
      { type: "text" as const, text: `The clip is ${durationSec.toFixed(1)} seconds long.\n\nWhat is said, in seconds:\n${formatLines(transcriptLines(words)) || "(no speech)"}` },
    ];
    const model = modelFor("clipper_frame");
    const startedAt = Date.now();
    const res = await anthropic.messages.create({
      model, max_tokens: 3000, system: reframeSystem(share),
      output_config: { format: { type: "json_schema", schema: REFRAME_SCHEMA }, ...effortFor(model, "medium") },
      messages: [{ role: "user", content }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(r.ctx.ownerId, "clipper_frame", res);
    const block = res.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "";
    let raw: unknown = null;
    try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
    // A one-camera conversation follows whoever is talking; anything else takes the shots Claude chose.
    const following = speakerPath(raw, words, durationSec, share);
    const told = raw as { camera?: unknown; people?: unknown[] } | null;
    const onePerson = told?.camera === "one_camera" && (new Set(words.map((w) => w.speaker).filter(Boolean)).size <= 1 || (told.people?.length ?? 0) <= 1);
    const path = following ?? cleanCropPath(raw, durationSec, share, onePerson);
    // Counts only: how framing is going, without any content.
    console.log("[clipper] frame", JSON.stringify({ clip: id, frames: frames.length, moves: (raw as { moves?: unknown[] } | null)?.moves?.length ?? null, kept: path?.length ?? 0, following: Boolean(following), camera: (raw as { camera?: unknown } | null)?.camera ?? null, people: (raw as { people?: unknown[] } | null)?.people?.length ?? null, ms: Date.now() - startedAt, stop: res.stop_reason, outputTokens: res.usage?.output_tokens }));
    if (path && item == null) {
      const saved = await svc.from("clips").update({ crop_path: path }).eq("id", id).eq("user_id", r.ctx.ownerId);
      if (saved.error) console.error("[clipper] frame path not saved:", saved.error.message);
    }
    return NextResponse.json({ path });
  } catch (e) {
    return aiErrorResponse("clipper/clips/[id]/reframe", e);
  }
}
