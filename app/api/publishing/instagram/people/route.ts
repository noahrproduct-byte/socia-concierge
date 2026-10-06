import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { knownPeople } from "@/lib/publishing/peopleServer";

export const runtime = "nodejs";

// GET — the Instagram accounts SOCIA already knows for the active workspace
// (own accounts, past collaborators and tags, caption mentions, tracked
// competitors, commenters), for the composer's username suggestions. The
// browser ranks them as the person types (lib/publishing/people.ts).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    const people = await knownPeople(ctx.client, { ownerId: ctx.ownerId, workspaceId: ctx.workspace?.id ?? null, isOwner: ctx.isOwner });
    return NextResponse.json({ people }, { headers: { "cache-control": "private, max-age=60" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, people: [] }, { status: 500 });
  }
}
