import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { metaSecrets, readSignedRequest, verifySignedRequest } from "@/lib/metaSignedRequest";
import { deleteMetaUserData } from "@/lib/metaDeletion";

export const runtime = "nodejs";

// Meta Deauthorize Callback. Fired when a person removes SOCIA's access in
// their Facebook or Instagram settings. The tokens for that account are gone
// from Meta's side already; this removes SOCIA's stored copy and the data
// synced with it, the same as the deletion callback.

export async function POST(req: Request) {
  const signed = await readSignedRequest(req);
  if (!signed) return NextResponse.json({ error: "signed_request missing" }, { status: 400 });
  const v = verifySignedRequest(signed, metaSecrets());
  if (!v.ok) return NextResponse.json({ error: `Invalid signed request (${v.reason})` }, { status: 400 });
  const userId = typeof v.payload.user_id === "string" ? v.payload.user_id : String(v.payload.user_id ?? "");
  if (!userId) return NextResponse.json({ error: "user_id missing" }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Deletion service not configured" }, { status: 500 });
  const source = v.via === 0 ? "instagram" : v.via === 1 ? "facebook" : "unknown";
  const result = await deleteMetaUserData(service, userId, source);
  return NextResponse.json({ ok: true, confirmation_code: result.confirmationCode });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "Meta deauthorize callback. POST signed_request." });
}
