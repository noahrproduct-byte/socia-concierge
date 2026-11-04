import { NextResponse } from "next/server";
import { contactsRequest, contactsError } from "@/lib/contacts/auth";
import { saveRules } from "@/lib/contacts/server";

export const runtime = "nodejs";

// PUT { rules: [{ keyword, tag }] } -> { rules }: replace the brand's keyword rules.
// A comment containing a keyword tags its author on the next update.
export async function PUT(req: Request) {
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  const body = (await req.json().catch(() => null)) as { rules?: unknown } | null;
  try {
    return NextResponse.json({ rules: await saveRules(r.ctx.client, r.ctx.ownerId, r.wsId, body?.rules) });
  } catch (e) {
    return contactsError("contacts/rules", e);
  }
}
