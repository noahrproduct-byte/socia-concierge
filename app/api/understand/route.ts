import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, brandWorkspace, can, forbiddenCopy } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { runUnderstanding, type UnderstandResult } from "@/lib/intel/understandLoad";
import type { ReadEvent } from "@/lib/intel/readStages";

export const runtime = "nodejs";
export const maxDuration = 120;

// What SOCIA inferred about this brand from its connected accounts (GET), and
// running that analysis again (POST, one account audit).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  return NextResponse.json({ understanding: profile?.brand_detail?.growth?.understanding ?? null });
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  // Onboarding watches the read happen: each real step is sent as it starts and
  // ends, then the same answer the plain call gives (as the last line).
  if (new URL(req.url).searchParams.get("stream") === "1") {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (e: ReadEvent) => {
          try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* the page went away */ }
        };
        try {
          const a = await answer(await runUnderstanding(ctx, send));
          send({ type: "result", status: a.status, body: await a.json().catch(() => null) });
        } catch (e) {
          console.error("[understand] stream:", (e as Error)?.message ?? e);
          send({ type: "result", status: 502, body: { error: "SOCIA couldn't read your accounts just now. Try again in a minute." } });
        } finally {
          try { controller.close(); } catch { /* closed */ }
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  }
  return answer(await runUnderstanding(ctx));
}

/** The read's outcome as this route's answer. */
function answer(r: UnderstandResult): Response {
  if (r.status === "denied") return r.response;
  if (r.status === "failed") return NextResponse.json({ error: r.reason }, { status: 502 });
  if (r.status === "no_accounts") return NextResponse.json({ status: r.status, understanding: null });
  if (r.status === "too_little") return NextResponse.json({ status: r.status, posts: r.posts, understanding: r.understanding });
  return NextResponse.json({ status: "done", understanding: r.understanding });
}
