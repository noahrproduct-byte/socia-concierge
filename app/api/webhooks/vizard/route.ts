import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { pollClipJob, type ClipJobRow } from "@/lib/clipper/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Vizard's workspace webhook: register
//   https://sociaos.com/api/webhooks/vizard?key=<VIZARD_WEBHOOK_SECRET>
// in the Vizard workspace. Vizard does not sign deliveries, so the secret in
// the URL is the check. The body is only a nudge: the job is re-read from
// Vizard's query endpoint, never trusted from the payload.
const COLS = "id, user_id, workspace_id, source_kind, source_url, source_path, source_minutes, options, provider, provider_job_id, status, credits_reserved, credits_charged, error, created_at, updated_at, last_polled_at, finished_at";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request) {
  const secret = process.env.VIZARD_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!same(key, secret)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = body?.projectId ?? (body?.data as Record<string, unknown> | undefined)?.projectId;
  if (projectId == null) return NextResponse.json({ error: "no projectId" }, { status: 400 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "service role missing" }, { status: 503 });
  const { data } = await svc.from("clip_jobs").select(COLS).eq("provider", "vizard").eq("provider_job_id", String(projectId)).maybeSingle();
  const job = data as ClipJobRow | null;
  if (!job) return NextResponse.json({ received: true, unknown: true });
  if (job.status === "processing") await pollClipJob(svc, { ...job, last_polled_at: null }).catch((e) => console.error("[webhooks/vizard]", (e as Error)?.message ?? e));
  return NextResponse.json({ received: true });
}
