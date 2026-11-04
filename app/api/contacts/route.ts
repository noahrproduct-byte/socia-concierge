import { NextResponse } from "next/server";
import { perUserLimit } from "@/lib/rateLimit";
import { contactsRequest, contactsError } from "@/lib/contacts/auth";
import { listContacts, readRules, readSignupPage, syncContacts } from "@/lib/contacts/server";
import { cleanTag } from "@/lib/contacts/contacts";

export const runtime = "nodejs";
export const maxDuration = 60;

// Contacts for the Brand Workspace being viewed (owner and admins, Starter and up).
//   GET  ?tag= -> { contacts, rules, page }
//   POST       -> read the comments on the latest Instagram posts and record who wrote them

export async function GET(req: Request) {
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  const tag = cleanTag(new URL(req.url).searchParams.get("tag"));
  try {
    const [contacts, rules, page] = await Promise.all([
      listContacts(r.ctx.client, r.ctx.ownerId, r.wsId, { tag }),
      readRules(r.ctx.client, r.ctx.ownerId, r.wsId),
      readSignupPage(r.ctx.client, r.ctx.ownerId, r.wsId),
    ]);
    return NextResponse.json({ contacts, rules, page });
  } catch (e) {
    return contactsError("contacts", e);
  }
}

export async function POST() {
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  // Each sync reads up to 12 posts' comments on the brand's token: an hourly ceiling.
  const limited = await perUserLimit(r.ctx.ownerId, "contacts_sync", 12, "contact updates");
  if (limited) return limited;
  try {
    const result = await syncContacts(r.ctx.client, r.ctx.ownerId, r.wsId);
    const contacts = await listContacts(r.ctx.client, r.ctx.ownerId, r.wsId);
    return NextResponse.json({ ...result, contacts });
  } catch (e) {
    return contactsError("contacts/sync", e);
  }
}
