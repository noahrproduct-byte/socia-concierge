import { NextResponse } from "next/server";
import { contactsRequest, contactsError } from "@/lib/contacts/auth";
import { saveSignupPage, SignupPageError } from "@/lib/contacts/server";

export const runtime = "nodejs";

// PUT { slug, title, intro?, button?, askHandle?, tag?, active? } -> { page }:
// create or change the brand's sign-up page (sociaos.com/l/<slug>).
export async function PUT(req: Request) {
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  try {
    return NextResponse.json({ page: await saveSignupPage(r.ctx.client, r.ctx.ownerId, r.wsId, body) });
  } catch (e) {
    if (e instanceof SignupPageError) return NextResponse.json({ error: e.message }, { status: 400 });
    return contactsError("contacts/page", e);
  }
}
