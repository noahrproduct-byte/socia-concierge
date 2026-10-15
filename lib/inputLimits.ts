import { NextResponse } from "next/server";

// How much text one request may send to the model. Every limit here sits well
// above real use; they exist so a single oversized request can't run up a
// large AI bill. A person's own text over a limit is refused with a clear
// message, never cut silently. Context SOCIA sends back to itself (chat
// history, its own analyses, research notes) is trimmed instead.

export const LIMITS = {
  question: 4_000,
  historyMessage: 6_000,
  rateCaption: 5_000,
  studioSummary: 6_000,
  hook: 500,
  listItems: 20,
  listItem: 300,
  brandDetailChars: 20_000,
  nicheTitle: 300,
  nicheWhy: 1_500,
  nicheTag: 120,
  /** One base64 JPEG frame from the browser (480px wide is ~40–110K). */
  frameChars: 400_000,
} as const;

/** The text, cut to `max` characters; "" when it isn't a string. */
export function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** The first `items` strings of a list, each cut to `each` characters. */
export function clipList(v: unknown, items: number, each: number): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, items).map((s) => s.slice(0, each)) : [];
}

/** The first field whose text is longer than its limit, or null. */
export function firstTooLong(fields: Record<string, { value: unknown; max: number; label: string }>): { label: string; max: number } | null {
  for (const f of Object.values(fields)) {
    if (typeof f.value === "string" && f.value.length > f.max) return { label: f.label, max: f.max };
  }
  return null;
}

export function tooLongResponse(label: string, max: number): NextResponse {
  return NextResponse.json({ error: `${label} is too long (${max.toLocaleString("en-US")} characters at most). Shorten it and try again.`, code: "too_long" }, { status: 400 });
}
