import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { requireUsage } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { AI_UNAVAILABLE_COPY, aiFailure } from "@/lib/anthropic";
import { isPlanChange, sanitizeDirection, sanitizePlan, type WsPlan, type WsRef, type WsResearch } from "@/lib/videoWorkspace";
import { planVideo, researchIdea } from "@/lib/videoWorkspaceServer";

export const runtime = "nodejs";
export const maxDuration = 120;

// Help me make a video (components/plan/VideoWorkspace.tsx), in stages:
//   POST { step: "research", idea }                                   -> { refs, directions, note, usage }
//   POST { step: "plan", idea, direction, refs, change?, current? }   -> { plan, usage }
// Each stage counts one content idea, given back when it fails. The same
// research asked again within a few hours comes back from cache, free.

const IDEA_MAX = 800;
const CACHE_MS = 3 * 3600_000;
const cache = new Map<string, { at: number; v: WsResearch }>();

function sanitizeRef(v: unknown): WsRef | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.url !== "string" || !/^https:\/\//.test(o.url)) return null;
  const s = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
  return {
    key: s(o.key, 400) || o.url, url: o.url.slice(0, 400), platform: o.platform === "youtube" ? "youtube" : "instagram", creator: s(o.creator, 80), thumb: null,
    views: typeof o.views === "number" ? o.views : null, multiplier: typeof o.multiplier === "number" ? o.multiplier : null, basis: s(o.basis, 30), format: s(o.format, 30),
    caption: s(o.caption, 300) || null, why: s(o.why, 300), adapt: Array.isArray(o.adapt) ? o.adapt.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 160)).slice(0, 3) : [],
  };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const idea = typeof body?.idea === "string" ? body.idea.replace(/—/g, ",").trim().slice(0, IDEA_MAX) : "";
  if (idea.length < 6) return NextResponse.json({ error: "Say a little about the video you want to make first." }, { status: 400 });
  const step = body?.step === "plan" ? "plan" : "research";
  const wsId = ctx.workspace?.id ?? null;

  const cacheKey = `${ctx.ownerId}|${wsId ?? ""}|${idea.toLowerCase()}`;
  if (step === "research") {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ ...hit.v, cached: true });
  }
  const limited = await perUserLimit(ctx.ownerId, "video_workspace", 30, "video research and plans");
  if (limited) return limited;

  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const account = [
    `The business: ${profile?.brand_name ?? "unnamed"}${profile?.niche ? `, ${profile.niche}` : ""}.`,
    profile?.goals ? `What it wants from its posts: ${profile.goals}` : "",
    brandContext(profile?.brand_detail) || "",
  ].filter(Boolean).join("\n");

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_ideas");
  if (u.denied) return u.denied;
  try {
    if (step === "research") {
      const v = await researchIdea({ client: ctx.client, viewerId: user.id, ownerId: ctx.ownerId, idea, account });
      cache.set(cacheKey, { at: Date.now(), v });
      return NextResponse.json({ ...v, usage: u.usage });
    }
    const refs = (Array.isArray(body?.refs) ? body!.refs : []).map(sanitizeRef).filter((r): r is WsRef => r != null).slice(0, 6);
    const direction = sanitizeDirection(body?.direction, 0, new Set(refs.map((r) => r.key)));
    if (!direction) { await u.release(); return NextResponse.json({ error: "Choose a direction first." }, { status: 400 }); }
    const change = isPlanChange(body?.change) ? body!.change : null;
    const current: WsPlan | null = change ? sanitizePlan(body?.current) : null;
    if (change && !current) { await u.release(); return NextResponse.json({ error: "There's no plan to change yet." }, { status: 400 }); }
    const plan = await planVideo({ client: ctx.client, ownerId: ctx.ownerId, wsId, tz: profile?.brand_detail?.timezone ?? null, idea, account, direction, refs, change, current });
    return NextResponse.json({ plan, usage: u.usage });
  } catch (err) {
    await u.release();
    if (err instanceof Error && /^SOCIA couldn't/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 502 });
    const kind = aiFailure("plan/video", err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
