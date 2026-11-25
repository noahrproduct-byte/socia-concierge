import { NextResponse } from "next/server";
import { studioRequest, requireMutate } from "@/lib/studioClips/auth";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { brandWorkspace } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { AI_UNAVAILABLE_COPY, aiFailure } from "@/lib/anthropic";
import { VOICE_NOTES_MAX } from "@/lib/studioClips/types";
import { improveVoiceover, isScriptChange } from "@/lib/voiceover/improve";

export const runtime = "nodejs";
export const maxDuration = 60;

// Auto improve a voiceover before the video is made (lib/voiceover/improve.ts):
//   POST { notes, prompt?, seconds?, answers?, voiceStyle?, change?, current? } -> { script, facts, questions, readSite, usage }
//   (change = one of SCRIPT_CHANGES, applied to `current`; without it a script is written from the notes)
// Facts come from the notes, the business facts SOCIA holds, then the business's
// website; what is still missing comes back as questions. One hooks-and-captions
// unit, given back when nothing comes back.
export async function POST(req: Request) {
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { notes?: unknown; prompt?: unknown; seconds?: unknown; answers?: unknown; voiceStyle?: unknown; change?: unknown; current?: unknown } | null;
  const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/—/g, ",").trim().slice(0, n) : "");
  const notes = text(body?.notes, VOICE_NOTES_MAX);
  if (!notes) return NextResponse.json({ error: "Write a few words about what the voiceover should be about first." }, { status: 400 });
  const change = isScriptChange(body?.change) ? body.change : null;
  const current = text(body?.current, 1500);
  if (change && change !== "again" && !current) return NextResponse.json({ error: "There's no script to change yet." }, { status: 400 });
  const seconds = typeof body?.seconds === "number" && Number.isFinite(body.seconds) ? Math.min(90, Math.max(5, body.seconds)) : 30;
  const limited = await perUserLimit(ctx.ownerId, "voiceover_improve", 20, "voiceover improvements");
  if (limited) return limited;

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_generation");
  if (u.denied) return u.denied;
  try {
    const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
    const out = await improveVoiceover({
      ownerId: ctx.ownerId, notes, videoBrief: text(body?.prompt, 1500) || null, seconds,
      brand: brandContext(profile?.brand_detail) || "", niche: profile?.niche ?? null, goal: profile?.goals ?? null,
      website: profile?.brand_detail?.website ?? null, answers: text(body?.answers, 600) || null,
      voiceStyle: text(body?.voiceStyle, 60) || null, change, current: current || null,
    });
    return NextResponse.json({ ...out, usage: u.usage });
  } catch (err) {
    await u.release();
    if (err instanceof Error && /couldn't write the voiceover/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 502 });
    const kind = aiFailure("studio/voiceover/improve", err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
