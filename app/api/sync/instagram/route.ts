import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runPlatformSyncs } from "@/lib/igSyncJob";
import { isCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Background sync (lib/igSyncJob.ts): pg_cron calls this every 10 minutes
// (supabase/instagram-sync-cron.sql) and it refreshes every Instagram account,
// Facebook Page and TikTok account whose data is older than 30 minutes. The
// path keeps its first name so the existing schedule keeps working. Same secret
// as the publisher.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const result = await runPlatformSyncs(svc, new Date());
  return NextResponse.json(result);
}
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
