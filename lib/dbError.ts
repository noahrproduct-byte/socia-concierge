// A database error goes to the server log, never to the browser: Postgres
// messages name tables, columns, constraints and policies.

import { NextResponse } from "next/server";

export function dbErrorResponse(where: string, error: { message?: string; code?: string } | null | undefined, status = 500): NextResponse {
  console.error(`[${where}]`, error?.code ?? "", error?.message ?? error);
  return NextResponse.json({ error: "SOCIA couldn't save or load that just now. Try again." }, { status });
}
