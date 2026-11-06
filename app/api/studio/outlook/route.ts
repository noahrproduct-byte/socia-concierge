import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { loadOutlook } from "@/lib/outlookLoad";

export const runtime = "nodejs";

// The Content Rater's performance outlook for the active brand (lib/outlook.ts).
//   GET -> { connected, handle, insightsOk, model }: the brand's own settled
//          Reels (date, views, caption traits), their baseline, patterns and
//          the replay that decides whether an index may be shown.
// Calculated from stored numbers; no model is called.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json(await loadOutlook(ctx));
}
