import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { currentGoalValues } from "@/lib/briefingLoad";

export const runtime = "nodejs";

// Where the account stands now on each goal SOCIA can measure, so a target is
// set against a real starting number. A goal that can't be read is left out.
//   GET -> { now: { followers?: { value, platforms }, views_30d?, engagement_rate?, posts_per_week? } }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    return NextResponse.json({ now: await currentGoalValues(ctx) });
  } catch (e) {
    console.error("[goals/now]", (e as Error)?.message ?? e);
    return NextResponse.json({ now: {} });
  }
}
