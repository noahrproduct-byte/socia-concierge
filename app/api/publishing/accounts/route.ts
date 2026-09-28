import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadPickerAccountsDetailed } from "@/lib/publishing/db";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";

// The destination picker's account list: every account connected to the
// active Brand Workspace (Instagram, Facebook, YouTube) with the scopes its
// token holds, suspended ones flagged. Read as the workspace owner, so a team
// member picks from the owner's accounts; no token is in the answer.
// `complete` is false when a connection table could not be read; the list is
// then a lower bound and the picker says so instead of showing "none".
// The composer derives availability from this with availabilityFor(); the
// server re-derives it on every POST /api/posts, so this list is never the gate.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { accounts, complete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId);
  return NextResponse.json({ accounts, complete });
}
