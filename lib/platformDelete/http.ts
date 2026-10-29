// The HTTP shape of a deletion, shared by the two routes. Server only.
import { NextResponse } from "next/server";
import type { DeleteOutcome } from "./types";

/** 200 { deletedAt, gone } | 409 { error, capability } | 502 { error, code }. */
export function outcomeResponse(outcome: DeleteOutcome, extra: Record<string, unknown> = {}): NextResponse {
  if (outcome.ok) return NextResponse.json({ deletedAt: outcome.deletedAt, gone: outcome.gone, ...extra });
  if ("capability" in outcome) return NextResponse.json({ error: outcome.capability.canDelete ? "This post cannot be deleted from here." : outcome.capability.reason, capability: outcome.capability }, { status: 409 });
  return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: 502 });
}
