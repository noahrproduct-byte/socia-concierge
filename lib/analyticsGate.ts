// Plan-locked analytics never reach the browser. The analytics views are
// client components, so whatever the server hands them is in the page
// payload, readable in devtools even under a "locked" panel. When a plan
// doesn't include previous-period comparisons, every comparison value is
// removed here, on the server, before the data is rendered.

const NUMBER_KEYS = new Set(["prevTotal", "deltaPct"]);
const TEXT_KEYS = new Set(["delta", "deltaText"]);

const VS_PREVIOUS = /^vs\. previous \d+ days$/;

/**
 * A copy of the analytics data with every previous-period value removed. A
 * note that only said "vs. previous N days" becomes `periodNote` (the range).
 */
export function withoutComparison<T>(data: T, periodNote: string): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object" || v instanceof Date) return v;
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const comparative = "delta" in src || "deltaPct" in src || "prevTotal" in src;
    for (const [k, val] of Object.entries(src)) {
      if (NUMBER_KEYS.has(k) || TEXT_KEYS.has(k)) out[k] = null;
      // A series' previous-period points, or a change row's previous value.
      else if (k === "previous") out[k] = Array.isArray(val) ? [] : null;
      // Up or down says how it moved against the previous period.
      else if (k === "positive" && comparative) out[k] = null;
      else if (k === "note" && typeof val === "string" && VS_PREVIOUS.test(val)) out[k] = periodNote;
      else out[k] = walk(val);
    }
    return out;
  };
  return walk(data) as T;
}
