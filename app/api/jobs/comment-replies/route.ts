import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runAutoReplies } from "@/lib/commentAuto";
import { isCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
// The run continues after the response is sent (next/server `after`), up to
// this limit; it stops starting new brands at 240 s.
export const maxDuration = 300;

// Automatic comment replies (supabase/comment-auto-cron.sql, every 30 minutes):
// for the brands that turned them on, read new comments, draft replies and send
// the short friendly ones (lib/commentAuto.ts). ?sync=1 waits for the result.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const now = new Date();
  if (new URL(req.url).searchParams.get("sync") === "1") return NextResponse.json(await runAutoReplies(svc, now, 240_000));
  after(async () => {
    const result = await runAutoReplies(svc, now, 240_000).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    console.log("[comment-auto]", JSON.stringify(result));
  });
  return NextResponse.json({ started: true }, { status: 202 });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
