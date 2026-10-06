import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runWeeklyPlans } from "@/lib/weeklyPlanJob";

export const runtime = "nodejs";
// A plan takes one to three minutes per owner; the run continues after the
// response is sent (next/server `after`), up to this limit.
export const maxDuration = 300;

// Monday plan job (supabase/weekly-plan-cron.sql). Answers at once and does
// the work in the background, so the caller's short timeout does not matter.
// ?force=1 runs it on any day (manual trigger); ?sync=1 waits for the result.
async function run(req: Request) {
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");
  const bearer = clean(req.headers.get("authorization")).match(/^bearer\s+(.+)$/i)?.[1];
  const secret = clean(process.env.CRON_SECRET);
  if (!secret || bearer === undefined || clean(bearer) !== secret) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const now = new Date();
  if (url.searchParams.get("sync") === "1") {
    const result = await runWeeklyPlans(svc, now, 280_000, force);
    return NextResponse.json(result);
  }
  after(async () => {
    const result = await runWeeklyPlans(svc, now, 280_000, force).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    console.log("[weekly-plan]", JSON.stringify(result));
  });
  return NextResponse.json({ started: true, force, monday: now.getUTCDay() === 1 }, { status: 202 });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
