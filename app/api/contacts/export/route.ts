import { NextResponse } from "next/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { contactsRequest, contactsError } from "@/lib/contacts/auth";
import { listContacts } from "@/lib/contacts/server";
import { cleanTag, contactsCsv } from "@/lib/contacts/contacts";

export const runtime = "nodejs";

// GET ?tag= -> the contacts as a CSV file (all of them, or one tag's).
export async function GET(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  const tag = cleanTag(new URL(req.url).searchParams.get("tag"));
  try {
    const rows = await listContacts(r.ctx.client, r.ctx.ownerId, r.wsId, { tag, limit: 10000 });
    const name = `contacts${tag ? `-${tag.replace(/\s+/g, "-")}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(contactsCsv(rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return contactsError("contacts/export", e);
  }
}
