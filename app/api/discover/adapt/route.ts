import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { perUserLimit } from "@/lib/rateLimit";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import { APIError } from "@anthropic-ai/sdk";
import { AdaptError, adaptReel, reelFrom, savedAdaptations } from "@/lib/discoverAdaptServer";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Adapt to my business" on Discover (lib/discoverAdapt.ts):
//   GET  ?url=<reel link>                       -> { adaptations }   saved ones only, no AI, never charged
//   POST { reel, again?: boolean, have?: n }    -> { adaptations }   writes one when needed (a video idea's credits)
async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  return { user, ctx, allowed: canUseFeature(ent, "niche_intelligence") };
}

export async function GET(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!/^https:\/\//.test(url)) return NextResponse.json({ error: "Send the Reel's link." }, { status: 400 });
  return NextResponse.json({ adaptations: await savedAdaptations(w.ctx, url.slice(0, 400)) });
}

export async function POST(req: Request) {
  const w = await who();
  if (!w) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!w.allowed) return NextResponse.json({ error: "Adapting Reels is on a paid plan." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const reel = reelFrom(b?.reel);
  if (!reel) return NextResponse.json({ error: "That isn't a Reel SOCIA can adapt." }, { status: 400 });
  const again = b?.again === true;
  const have = typeof b?.have === "number" && Number.isInteger(b.have) && b.have >= 0 ? b.have : 0;
  // A repeated or "again" request that finds a saved adaptation answers from it without a call; only a new one is limited.
  const saved = await savedAdaptations(w.ctx, reel.url);
  if (saved.length && (!again || saved.length > have)) return NextResponse.json({ adaptations: saved });
  const limited = await perUserLimit(w.ctx.ownerId, "discover_adapt", 30, "Reel adaptations", w.ctx.ownerId);
  if (limited) return limited;
  try {
    return NextResponse.json({ adaptations: await adaptReel(w.ctx, reel, { again, have }) });
  } catch (e) {
    if (e instanceof AdaptError) return NextResponse.json(e.body ?? { error: e.message }, { status: e.status });
    if (e instanceof APIError) {
      const kind = aiFailureKind(e);
      console.error(`[ai] discover/adapt ${kind} status=${e.status ?? "none"}: ${e.message.replace(/\s+/g, " ").slice(0, 300)}`);
      return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
    }
    console.error("[discover/adapt]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't write the adaptation just now. Try again; nothing was used." }, { status: 500 });
  }
}
