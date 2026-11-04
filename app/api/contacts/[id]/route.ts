import { NextResponse } from "next/server";
import { contactsRequest, contactsError } from "@/lib/contacts/auth";
import { contactEvents, deleteContact, updateContact } from "@/lib/contacts/server";

export const runtime = "nodejs";

// One contact: GET its history, PATCH { tags?, notes? }, DELETE it and its history.

const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "That contact doesn't exist." }, { status: 404 });
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  try {
    return NextResponse.json({ events: await contactEvents(r.ctx.client, r.ctx.ownerId, r.wsId, id) });
  } catch (e) {
    return contactsError("contacts/events", e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "That contact doesn't exist." }, { status: 404 });
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  const body = (await req.json().catch(() => null)) as { tags?: unknown; notes?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  try {
    const contact = await updateContact(r.ctx.client, r.ctx.ownerId, r.wsId, id, { tags: body.tags, notes: body.notes });
    if (!contact) return NextResponse.json({ error: "That contact doesn't exist." }, { status: 404 });
    return NextResponse.json({ contact });
  } catch (e) {
    return contactsError("contacts/update", e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ error: "That contact doesn't exist." }, { status: 404 });
  const r = await contactsRequest();
  if (!r.ok) return r.res;
  try {
    if (!(await deleteContact(r.ctx.client, r.ctx.ownerId, r.wsId, id))) return NextResponse.json({ error: "That contact doesn't exist." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return contactsError("contacts/delete", e);
  }
}
