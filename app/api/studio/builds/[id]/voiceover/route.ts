import { NextResponse } from "next/server";
import { AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { aiFailure } from "@/lib/anthropic";
import { requireFeature, requireUsage } from "@/lib/planGuard";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { accountContext, loadBuildRow } from "@/lib/studioClips/server";
import { scopeToWorkspace } from "@/lib/workspaces";
import { mergeVoiceover, ownsVoicePath, sanitizeVoiceover } from "@/lib/studioClips/voiceover";
import { makeVoiceover, voiceNeedFor } from "@/lib/voiceover/server";
import { VoiceError, voiceConfigured } from "@/lib/voiceover/elevenlabs";
import { publicMessage } from "@/lib/dbError";
import { perUserLimit } from "@/lib/rateLimit";
import { VOICE_NOTES_MAX } from "@/lib/studioClips/types";

export const runtime = "nodejs";
export const maxDuration = 180;

// A cut's voiceover (Starter and up, like music).
//   POST { auto: true }  -> SOCIA adds one on its own, once per cut, when the
//                           cut needs it (lib/studioClips/voiceover.ts needsVoiceover)
//                           -> { state: "added", ... } | { state: "has" | "tried" | "not_needed", why }
//   POST { rewrite?, voiceId?, edits? } -> write it (or again), or voice the
//                           changed lines in the chosen voice. One voiceover
//                           counted when anything is voiced; given back when
//                           nothing was or it fails.
//                           -> { state: "voiced", voiceover, urls, overrunSec, voices }
//   PATCH { on?, volume? } -> switch it on or off, set its level (nothing counted)
//   DELETE                 -> take it out of the cut

type Body = { auto?: unknown; rewrite?: unknown; voiceId?: unknown; edits?: unknown; notes?: unknown };

function voiceErr(e: VoiceError) {
  return NextResponse.json({ error: e.message, kind: e.kind, notConfigured: e.kind === "not_configured" }, { status: e.kind === "busy" ? 429 : e.kind === "not_configured" ? 503 : e.kind === "rejected" ? 400 : 502 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!voiceConfigured()) return NextResponse.json({ error: "Voiceovers aren't set up on this server yet.", notConfigured: true }, { status: 503 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const auto = body.auto === true;
  const wsId = ctx.workspace?.id ?? null;
  const edits = Array.isArray(body.edits)
    ? (body.edits as unknown[]).slice(0, 12).flatMap((x) => (x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" && typeof (x as { text?: unknown }).text === "string" ? [{ id: (x as { id: string }).id, text: (x as { text: string }).text }] : []))
    : undefined;
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });

    let why: string | undefined;
    if (auto) {
      if (row.edl.voiceover) return NextResponse.json({ state: "has" });
      if (row.edl.voiceAuto) return NextResponse.json({ state: "tried" });
      const need = await voiceNeedFor(ctx.client, row.edl, row.project_id);
      if (!need.need) return NextResponse.json({ state: "not_needed", why: need.why });
      why = need.why;
      // Tried once per cut whatever happens, so opening it again never spends another.
      const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl: { ...row.edl, voiceAuto: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
      if (error) throw error;
    }
    // Writing a script is a model call: the same hourly ceiling as other writing.
    if (!row.edl.voiceover || body.rewrite === true) {
      const limited = await perUserLimit(ctx.ownerId, "voiceover-script", 20, "voiceovers");
      if (limited) return limited;
    }

    const u = await requireUsage(ctx.client, ctx.ownerId, "voiceovers", { feature: "auto_build" });
    if (u.denied) return u.denied;
    try {
      const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx));
      const out = await makeVoiceover(ctx.client, {
        ownerId: ctx.ownerId, wsId, buildId: id, acct, auto, why,
        voiceId: typeof body.voiceId === "string" ? body.voiceId.slice(0, 64) : null,
        rewrite: body.rewrite === true, edits,
        notes: typeof body.notes === "string" ? body.notes.replace(/\u2014/g, ",").trim().slice(0, VOICE_NOTES_MAX) || null : null,
      });
      if (!out.made) await u.release();
      return NextResponse.json({ state: auto ? "added" : "voiced", ...out, usage: out.made ? u.usage : null });
    } catch (e) {
      await u.release();
      // The voice service itself isn't available: take the stamp back off so this cut gets its voice once it is.
      if (auto && e instanceof VoiceError && e.kind === "not_configured") {
        const cur = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id).catch(() => null);
        if (cur?.edl?.voiceAuto && !cur.edl.voiceover) {
          const { voiceAuto: _drop, ...rest } = cur.edl; void _drop;
          await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl: rest, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
        }
      }
      throw e;
    }
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    if (e instanceof VoiceError) return voiceErr(e);
    const kind = aiFailure("studio/builds/voiceover", e);
    return NextResponse.json({ error: kind === "failed" ? publicMessage("studio/builds/[id]/voiceover", e, "SOCIA couldn't make the voiceover. Try again.") : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => null)) as { on?: unknown; volume?: unknown } | null;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const stored = sanitizeVoiceover(row.edl.voiceover, ownsVoicePath(ctx.ownerId, row.project_id, id));
    const voiceover = mergeVoiceover(stored, body ?? {});
    if (!voiceover) return NextResponse.json({ error: "This cut has no voiceover." }, { status: 404 });
    const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl: { ...row.edl, voiceover }, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
    if (error) throw error;
    return NextResponse.json({ voiceover });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: publicMessage("studio/builds/[id]/voiceover", e, "SOCIA couldn't change the voiceover.") }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const row = await loadBuildRow(ctx.client, ctx.ownerId, wsId, id);
    if (!row?.edl) return NextResponse.json({ error: "That cut does not exist." }, { status: 404 });
    const { voiceover: _drop, ...rest } = row.edl; void _drop;
    const { error } = await scopeToWorkspace(ctx.client.from("studio_builds").update({ edl: rest, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.ownerId), wsId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: publicMessage("studio/builds/[id]/voiceover", e, "SOCIA couldn't take the voiceover out.") }, { status: 500 });
  }
}
