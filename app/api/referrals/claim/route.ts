import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { perUserLimit } from "@/lib/rateLimit";
import { claimReferral } from "@/lib/referrals/server";

export const runtime = "nodejs";

// A new account says which invite link brought it here.
//   POST { code } -> { ok } | { ok: false, reason }
// Counts once per account, only in its first days, never for its own code
// (lib/referrals/server.ts). A wrong or late code is not an error to show
// anyone: the page that calls this just forgets the code.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const limited = await perUserLimit(user.id, "referral_claim", 10, "invite links");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const r = await claimReferral(user.id, user.created_at, body?.code);
  return NextResponse.json(r);
}
