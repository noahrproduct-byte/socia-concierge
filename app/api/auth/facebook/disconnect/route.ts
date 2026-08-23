import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Removes the stored Facebook connection (tokens included). Touches nothing else.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  await supabase.from("facebook_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
