import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { lessons, sanitizeEntry } from "@/lib/raterLog";
import { loadOutcomes, ownsPost, saveEntry } from "@/lib/raterLogLoad";

export const runtime = "nodejs";

// The Content Rater's memory for the active brand (lib/raterLog.ts).
//   GET  -> { outcomes, lessons }: what SOCIA recommended for each rated
//           video, what was applied, and how the post did once published
//   POST { entry } -> { ok }: record a rated video when it is saved to the
//           Calendar. Only for a post on this brand's own Calendar.

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? resolveContext(supabase, user.id) : null;
}

export async function GET() {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const outcomes = await loadOutcomes(ctx).catch(() => []);
  return NextResponse.json({ outcomes, lessons: lessons(outcomes) });
}

export async function POST(req: Request) {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { entry?: unknown } | null;
  const entry = sanitizeEntry(body?.entry);
  if (!entry) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  // The entry is stamped by the server, and only for a post this brand owns.
  if (!(await ownsPost(ctx, entry.postId))) return NextResponse.json({ error: "That post isn't on this brand's Calendar." }, { status: 404 });
  const ok = await saveEntry(ctx, { ...entry, at: new Date().toISOString() });
  return NextResponse.json({ ok });
}
