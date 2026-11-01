import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isCronRequest } from "@/lib/cronAuth";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 60;

// Raw footage used to expire after a plan's retention days and be purged
// here. Since 2026-11 it is kept until the person deletes it (or its project,
// or their account), within the plan's storage, so it can be posted again or
// used in a new video. This nightly job (supabase/studio-purge-cron.sql) now
// only clears the expiry dates clips were given before that, so nothing
// uploaded earlier is deleted. Service role; CRON_SECRET.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const { data, error } = await svc
    .from("studio_clips")
    .update({ expires_at: null })
    .not("expires_at", "is", null)
    .is("purged_at", null)
    .select("id");
  if (error) return dbErrorResponse("studio-purge", error);
  const result = { kept: (data ?? []).length };
  console.log("[studio-purge]", JSON.stringify(result));
  return NextResponse.json(result);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
