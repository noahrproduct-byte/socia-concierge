import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { filmingFor } from "@/lib/filmingLoad";

export const runtime = "nodejs";

// The active brand's filming sessions: the posts of its latest Content Plan
// laid out over the days the person said they can film (lib/filmingPlan.ts).
// Reads only; nothing on the plan or the Calendar is changed.
//   GET -> FilmingView (lib/filmingLoad.ts)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    return NextResponse.json(await filmingFor(ctx));
  } catch (e) {
    console.error("[filming]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't lay out your filming just now." }, { status: 500 });
  }
}
