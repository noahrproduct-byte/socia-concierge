// The gate every Contacts route goes through: signed in, the workspace owner or
// an admin (contacts hold emails, so Members don't see them), and the owner's
// plan includes Contacts. Server only.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { dbErrorResponse } from "@/lib/dbError";
import { isMissingTable, MIGRATION_HINT } from "./server";

export type ContactsRequest = { ok: true; ctx: Ctx; wsId: string | null } | { ok: false; res: NextResponse };

export async function contactsRequest(): Promise<ContactsRequest> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return { ok: false, res: NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 }) };
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "contacts");
  if (denied) return { ok: false, res: denied };
  return { ok: true, ctx, wsId: ctx.workspace?.id ?? null };
}

/** A database error as a response, with the migration hint when the tables aren't there yet. */
export function contactsError(where: string, e: unknown): NextResponse {
  if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
  return dbErrorResponse(where, e as { message?: string; code?: string });
}
