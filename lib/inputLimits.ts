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
  /** Everything the page sends alongside a question, as JSON. */
  askContextChars: 24_000,
  /** Profile and workspace brand fields that go into most prompts. */
  niche: 200,
  brandName: 120,
  goals: 1_500,
  platformName: 40,
} as const;

/**
 * A copy of untrusted JSON with every string cut to `each` characters, every
 * list to `items` entries, and nothing deeper than `depth` levels: what a
 * prompt may receive from a request body, whatever the client sent.
 */
export function clipDeep(v: unknown, each = LIMITS.studioSummary, items = LIMITS.listItems, depth = 5): unknown {
  if (typeof v === "string") return v.slice(0, each);
  if (typeof v === "number" || typeof v === "boolean" || v == null) return v;
  if (depth <= 0) return null;
  if (Array.isArray(v)) return v.slice(0, items).map((x) => clipDeep(x, each, items, depth - 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) out[k.slice(0, 60)] = clipDeep(x, each, items, depth - 1);
    return out;
  }
  return null;
}

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
