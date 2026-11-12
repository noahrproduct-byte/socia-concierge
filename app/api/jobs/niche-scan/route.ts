import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isCronRequest } from "@/lib/cronAuth";
import { closeStale, duePlaybooks, refreshBrand, runSlice, waitingJobs } from "@/lib/nicheScan/run";

export const runtime = "nodejs";
// The steps run after the response is sent (next/server after()), up to this limit.
export const maxDuration = 300;

// The niche scan's scheduled job (supabase/niche-scan-cron.sql, every two
// minutes) and its kick (lib/nicheScan/run.ts starts a scan by calling this
// with ?job=<id>). Answers at once; runs waiting scans' steps in the
// background within 240 s, closes scans that ran out of time, and starts the
// weekly refresh for brands whose playbook is older than a week.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const one = new URL(req.url).searchParams.get("job");
  after(async () => {
    const started = Date.now();
    const now = new Date();
    try {
      if (!one) {
        await closeStale(svc, now);
        for (const b of await duePlaybooks(svc, now, 2)) await refreshBrand(svc, b);
      }
      const ids = one ? [one] : await waitingJobs(svc, now, 3);
      for (const id of ids) {
        const left = 240_000 - (Date.now() - started);
        if (left < 60_000) break;
        await runSlice(svc, id, left);
      }
    } catch (e) {
      console.error("[niche-scan cron]", (e as Error)?.message ?? e);
    }
  });
  return NextResponse.json({ started: true }, { status: 202 });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
