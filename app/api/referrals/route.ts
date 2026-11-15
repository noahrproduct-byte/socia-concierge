import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { referralStatus } from "@/lib/referrals/server";
import { BONUS_DAYS, MAX_ACTIVE, REWARD_WORDS } from "@/lib/referrals/core";

export const runtime = "nodejs";

// A person's invite link and what their invitations have brought so far.
//   GET -> { enabled, code, link, invited, counting, waiting, bonus: { active, until }, rules }
// The link is made on first ask. Nothing here is counted against a plan.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const s = await referralStatus(user.id);
  if (!s.code) return NextResponse.json({ enabled: false });
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return NextResponse.json({
    enabled: true, code: s.code, link: `${origin}/?ref=${s.code}`,
    invited: s.invited, counting: s.counting, waiting: s.waiting,
    bonus: { active: s.bonus.active, until: s.bonus.until },
    rules: { reward: REWARD_WORDS, days: BONUS_DAYS, max: MAX_ACTIVE },
  });
}
