import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse, publicOrigin } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { recordEvent } from "@/lib/planGuard";
import { isItemId } from "@/lib/planItems";
import { quoteStoryboard, refreshStoryboard, startStoryboard } from "@/lib/storyboardServer";
import { creditBalance } from "@/lib/credits/ledger";

export const runtime = "nodejs";
export const maxDuration = 60;

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = () => NextResponse.json({ error: "Open a saved plan first." }, { status: 400 });

// "Draw the storyboard" for one filmed plan post (lib/storyboardServer.ts), paid in the owner's credits.
//   GET  ?plan=<id>&item=<id>          -> { frames: [{ state, url, error? }] } (also moves running drawings along)
//   POST { plan, item, quote: true }   -> { shots, perShot, credits, balance } (nothing runs)
//   POST { plan, item }                -> { started, credits, frames, balance }
export async function GET(req: Request) {
  const u = new URL(req.url);
  const plan = u.searchParams.get("plan") ?? "";
  const item = u.searchParams.get("item") ?? "";
  if (!PLAN_ID.test(plan) || !isItemId(item)) return bad();
  const r = await aiRequest("content_plan");
  if (!r.ok) return r.res;
  try {
    return NextResponse.json({ frames: await refreshStoryboard(r.ctx, plan, item) });
  } catch (e) {
    return aiErrorResponse("plan/storyboard", e);
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const plan = typeof b?.plan === "string" ? b.plan : "";
  const item = typeof b?.item === "string" ? b.item : "";
  if (!PLAN_ID.test(plan) || !isItemId(item)) return bad();
  const quote = b?.quote === true;
  // Drawing spends the owner's credits, so it takes someone who may publish; the price is open to all.
  const r = await aiRequest("content_plan", { mutate: !quote });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, quote ? "storyboard_quote" : "storyboard_draw", quote ? 120 : 20, quote ? "Storyboard price checks" : "Storyboard drawings", r.ctx.ownerId);
  if (limited) return limited;
  try {
    if (quote) return NextResponse.json(await quoteStoryboard(r.ctx, r.ent, plan, item));
    const origin = publicOrigin(req);
    const niche = typeof b?.niche === "string" ? b.niche.slice(0, 60) : null;
    const { started, credits } = await startStoryboard(r.ctx, r.ent, plan, item, {
      niche,
      webhookUrl: origin && process.env.HIGGSFIELD_WEBHOOK_SECRET ? `${origin}/api/webhooks/higgsfield` : undefined,
    });
    if (started) recordEvent(r.ctx.client, r.ctx.ownerId, "ai_usage", { feature: "storyboard_draw", shots: started, credits });
    const [frames, balance] = await Promise.all([refreshStoryboard(r.ctx, plan, item), creditBalance(r.ctx.ownerId, r.ent).catch(() => null)]);
    return NextResponse.json({ started, credits, frames, balance });
  } catch (e) {
    return aiErrorResponse("plan/storyboard", e);
  }
}
