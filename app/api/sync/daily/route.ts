import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runDailySnapshots } from "@/lib/snapshotJob";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily snapshot job. The publisher already calls runDailySnapshots on every
// cron tick, so this route is optional: a dedicated pg_cron job can hit it at
// a fixed hour (see supabase/daily-snapshot-cron.sql). Same secret as the
// publisher.
async function run(req: Request) {
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");
  const bearer = clean(req.headers.get("authorization")).match(/^bearer\s+(.+)$/i)?.[1];
  const secret = clean(process.env.CRON_SECRET);
  if (!secret || bearer === undefined || clean(bearer) !== secret) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const result = await runDailySnapshots(svc, new Date(), 50000);
  return NextResponse.json(result);
}
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
