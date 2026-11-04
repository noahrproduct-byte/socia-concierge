import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cronAuth";
import { runOpenJobs } from "@/lib/aiStudio/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every minute (supabase/ai-studio-cron.sql): submits queued AI jobs within the
// providers' rate limits and polls the ones in progress, so results land even
// when nobody has the page open and a webhook was missed. CRON_SECRET.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const result = await runOpenJobs();
  console.log("[ai-poll]", JSON.stringify(result));
  return NextResponse.json(result);
}
export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
