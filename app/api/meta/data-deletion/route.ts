import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { metaSecrets, readSignedRequest, verifySignedRequest } from "@/lib/metaSignedRequest";
import { deleteMetaUserData } from "@/lib/metaDeletion";

export const runtime = "nodejs";

// Meta Data Deletion Request Callback.
// Meta POSTs form data with `signed_request` when a person removes SOCIA from
// their Facebook or Instagram settings and asks for their data to be deleted.
// The response shape is fixed by Meta: a status URL and a confirmation code.
// The deletion runs synchronously here, so the status page reports it done.

function appUrl(req: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin);
}

export async function POST(req: Request) {
  const signed = await readSignedRequest(req);
  if (!signed) return NextResponse.json({ error: "signed_request missing" }, { status: 400 });
  const v = verifySignedRequest(signed, metaSecrets());
  if (!v.ok) return NextResponse.json({ error: `Invalid signed request (${v.reason})` }, { status: 400 });

  const userId = typeof v.payload.user_id === "string" ? v.payload.user_id : String(v.payload.user_id ?? "");
  if (!userId) return NextResponse.json({ error: "user_id missing" }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Deletion service not configured" }, { status: 500 });

  // via 0 = signed by the Instagram app secret, 1 = the Facebook app secret.
  const source = v.via === 0 ? "instagram" : v.via === 1 ? "facebook" : "unknown";
  const result = await deleteMetaUserData(service, userId, source);

  return NextResponse.json({
    url: `${appUrl(req)}/data-deletion?code=${result.confirmationCode}`,
    confirmation_code: result.confirmationCode,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "Meta data deletion request callback. POST signed_request." });
}
