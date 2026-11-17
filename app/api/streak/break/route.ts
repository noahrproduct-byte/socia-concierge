import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { setBreakWeek } from "@/lib/postingStreakLoad";

export const runtime = "nodejs";

// A planned break week for the active brand's posting streak: the week
// neither counts nor breaks the streak (lib/postingStreak.ts). Only this week
// (while it hasn't already qualified) or next week, and at most two in any
// twelve weeks. The account's owner only, since the streak earns credits.
//   POST { week: "this" | "next", on: boolean } -> { ok: true } | { error }
export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!ctx.isOwner) return NextResponse.json({ error: "Only the account's owner can plan a break week." }, { status: 403 });
  const limited = await perUserLimit(ctx.ownerId, "streak_break", 20, "break week changes");
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as { week?: unknown; on?: unknown } | null;
  if ((b?.week !== "this" && b?.week !== "next") || typeof b?.on !== "boolean") return NextResponse.json({ error: "Choose this week or next week." }, { status: 400 });
  const problem = await setBreakWeek(ctx, b.week, b.on);
  return problem ? NextResponse.json({ error: problem }, { status: 400 }) : NextResponse.json({ ok: true });
}
