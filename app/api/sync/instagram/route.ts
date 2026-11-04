import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runInstagramSyncs } from "@/lib/igSyncJob";
import { isCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Background Instagram sync (lib/igSyncJob.ts): pg_cron calls this every 10
// minutes (supabase/instagram-sync-cron.sql) and it refreshes every account
// whose data is older than 30 minutes. Same secret as the publisher.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const result = await runInstagramSyncs(svc, new Date(), 45000);
  return NextResponse.json(result);
}
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
