import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { readOnboarding } from "@/lib/growthStore";
import { runInitialization } from "@/lib/briefingLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

// The end of onboarding: read the connected accounts, record goal starting
// points, and return each outcome plus the first briefing.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const { row } = await readOnboarding(ctx);
  try {
    const out = await runInitialization(ctx, { nicheRead: row?.answers?.ig_read === true });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Couldn't read your accounts just now. Try again in a minute." }, { status: 502 });
  }
}
