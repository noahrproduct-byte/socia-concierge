import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { lookupUsername } from "@/lib/publishing/knownUsernames";

export const runtime = "nodejs";

// GET ?username=x — is this an Instagram account? Answered by Instagram's
// account lookup (Business Discovery) through the owner's linked Facebook
// Page: public Business and Creator accounts are found with their name,
// picture and followers; personal or private accounts are reported as such
// (Instagram doesn't show them to apps). Without a Page: { available: false }.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const username = new URL(req.url).searchParams.get("username") ?? "";
  if (!username) return NextResponse.json({ error: "username required." }, { status: 400 });
  const result = await lookupUsername(ctx.client, ctx.ownerId, username);
  return NextResponse.json(result, { headers: { "cache-control": "private, max-age=300" } });
}
