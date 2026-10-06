import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { knownPeople } from "@/lib/publishing/peopleServer";
import { rememberUsername, scopeKey } from "@/lib/publishing/knownUsernames";
import type { LookupAccount } from "@/lib/publishing/people";

export const runtime = "nodejs";

// GET  — the Instagram accounts SOCIA already knows for the active workspace
//        (own accounts, usernames added before, past collaborators and tags,
//        caption mentions, tracked competitors, commenters), for the
//        composer's username suggestions. The browser ranks them as the
//        person types (lib/publishing/people.ts).
// POST { username, found? } — remember a username the moment it is added.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  try {
    const people = await knownPeople(ctx.client, { ownerId: ctx.ownerId, workspaceId: ctx.workspace?.id ?? null, isOwner: ctx.isOwner });
    return NextResponse.json({ people }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, people: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { username?: unknown; found?: LookupAccount | null } | null;
  if (typeof body?.username !== "string") return NextResponse.json({ error: "username required." }, { status: 400 });
  const f = body.found;
  const found: LookupAccount | null = f && typeof f.username === "string"
    ? { username: f.username, name: typeof f.name === "string" ? f.name.slice(0, 120) : null, avatar: typeof f.avatar === "string" && /^https:\/\//.test(f.avatar) ? f.avatar : null, followers: typeof f.followers === "number" ? Math.round(f.followers) : null }
    : null;
  const stored = await rememberUsername(ctx.client, ctx.ownerId, scopeKey(ctx.workspace?.id), body.username, found);
  return NextResponse.json({ stored });
}
