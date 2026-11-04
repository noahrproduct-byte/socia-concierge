import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { creditBalance, recentLedger } from "@/lib/credits/ledger";
import { MONTHLY_CREDITS, TOPUP_PACKS } from "@/lib/credits/config";
import { aiErrorResponse } from "@/lib/aiStudio/auth";

export const runtime = "nodejs";

// GET -> { balance, monthly, packs, ledger, enabled }: the owner's credits for Settings and the AI pages.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const enabled = canUseFeature(ent, "ai_clipper") || canUseFeature(ent, "ai_studio");
    const [balance, ledger] = await Promise.all([
      creditBalance(ctx.ownerId, ent.plan).catch(() => null),
      recentLedger(ctx.client, ctx.ownerId),
    ]);
    return NextResponse.json({ balance, monthly: MONTHLY_CREDITS[ent.plan], packs: TOPUP_PACKS, ledger, enabled, plan: ent.plan });
  } catch (e) {
    return aiErrorResponse("credits", e);
  }
}
