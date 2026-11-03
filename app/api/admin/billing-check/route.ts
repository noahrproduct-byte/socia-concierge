import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { assessBilling, readyToSell } from "@/lib/billingCheck";
import { loadBillingFacts } from "@/lib/billingCheckLoad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Is Stripe ready to take a payment? Admins only (ADMIN_EMAILS); everyone else
// gets a 404. Reads Stripe, changes nothing, returns no secret:
//   GET -> { ready, lines: [{ id, state: ok|fix|info, label, detail }] }
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const lines = assessBilling(await loadBillingFacts(appUrl));
  return NextResponse.json({ ready: readyToSell(lines), lines }, { headers: { "cache-control": "no-store" } });
}
