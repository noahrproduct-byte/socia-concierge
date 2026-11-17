import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

// Is SOCIA up? For an uptime monitor: 200 when the app answers and can read
// its database, 503 when it can't. It says nothing else (no versions, no
// counts, no reasons), needs no sign-in, and reads no rows. The answer is
// kept for a few seconds per server instance, so a flood of checks costs one
// database call, not one each.
const KEEP_MS = 10_000;
const DB_TIMEOUT_MS = 4_000;
let last: { at: number; ok: boolean } | null = null;

async function databaseAnswers(): Promise<boolean> {
  const svc = createServiceClient();
  if (!svc) return false;
  try {
    const { error } = await svc.from("profiles").select("user_id", { head: true }).limit(0).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const now = Date.now();
  if (!last || now - last.at > KEEP_MS) last = { at: now, ok: await databaseAnswers() };
  return NextResponse.json({ ok: last.ok }, { status: last.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
export const HEAD = GET;
