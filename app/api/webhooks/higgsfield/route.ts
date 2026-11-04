import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyStandardWebhook } from "@/lib/generation/webhook";
import { parseHiggsfieldStatus } from "@/lib/generation/higgsfield";
import { applyGenerationStatus, loadGenerationByProviderId } from "@/lib/generation/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Higgsfield's webhook (Standard Webhooks signature with the account's
// signing secret, HIGGSFIELD_WEBHOOK_SECRET from the Console's Settings).
// Every generation is submitted with ?hf_webhook=<this URL> when the secret
// is set; polling still runs as the fallback. Duplicates are harmless: a
// finished job is not touched again.
export async function POST(req: Request) {
  const secret = process.env.HIGGSFIELD_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const check = verifyStandardWebhook(secret, { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") }, raw);
  if (!check.ok) return NextResponse.json({ error: `bad signature (${check.reason})` }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const requestId = typeof body.request_id === "string" ? body.request_id : null;
  if (!requestId) return NextResponse.json({ error: "no request_id" }, { status: 400 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "service role missing" }, { status: 503 });
  const job = await loadGenerationByProviderId(svc, requestId);
  if (!job) return NextResponse.json({ received: true, unknown: true });
  try {
    await applyGenerationStatus(svc, job, parseHiggsfieldStatus(body));
  } catch (e) {
    console.error("[webhooks/higgsfield]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "apply failed" }, { status: 500 }); // the provider retries
  }
  return NextResponse.json({ received: true });
}
