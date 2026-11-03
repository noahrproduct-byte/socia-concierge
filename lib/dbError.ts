// A database error goes to the server log, never to the browser: Postgres
// messages name tables, columns, constraints and policies.

import { NextResponse } from "next/server";

export function dbErrorResponse(where: string, error: { message?: string; code?: string } | null | undefined, status = 500): NextResponse {
  console.error(`[${where}]`, error?.code ?? "", error?.message ?? error);
  return NextResponse.json({ error: "SOCIA couldn't save or load that just now. Try again." }, { status });
}

const GENERIC = "SOCIA couldn't save or load that just now. Try again.";

/**
 * The message a caught error may show the person: SOCIA's own sentences
 * (thrown as plain Errors with copy written for people) pass through; database
 * and storage errors and JavaScript runtime errors, which name tables,
 * columns, policies or code, are logged and replaced with `fallback`.
 */
export function publicMessage(where: string, e: unknown, fallback = GENERIC): string {
  const internal =
    !(e instanceof Error) ||
    !e.message ||
    ("code" in e && ("details" in e || "hint" in e)) ||
    "__isStorageError" in e ||
    e instanceof TypeError ||
    e instanceof ReferenceError ||
    e instanceof SyntaxError ||
    e instanceof RangeError;
  if (!internal) return e.message;
  console.error(`[${where}]`, (e as { code?: string })?.code ?? "", (e as Error)?.message ?? e);
  return fallback;
}

/** A 500 for a caught error, with only a message the person may see. */
export function errorResponse(where: string, e: unknown, status = 500): NextResponse {
  return NextResponse.json({ error: publicMessage(where, e) }, { status });
}
