// What the browser reports about Content-Security-Policy violations, reduced
// to what's needed to decide whether the policy can be enforced: which
// directive, which origin was blocked, on which page. Query strings and
// fragments are dropped (an OAuth `code` or a signed URL could be in them),
// and so is the sample of the offending code.

export const CSP_REPORT_MAX_BYTES = 8 * 1024;

export type CspViolation = { directive: string; blocked: string; page: string; disposition: string };

const originOf = (raw: unknown): string => {
  if (typeof raw !== "string" || !raw) return "unknown";
  // Keywords the browser uses instead of a URL: inline, eval, data, blob, self...
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw.split(/[:\s]/)[0].slice(0, 40);
  try { return new URL(raw).origin; } catch { return "unknown"; }
};

const pathOf = (raw: unknown): string => {
  if (typeof raw !== "string") return "unknown";
  try { return new URL(raw).pathname.slice(0, 200); } catch { return "unknown"; }
};

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "unknown");

/** Violations from a report-uri body ({"csp-report": {...}}) or a Reporting API list. */
export function parseCspReport(text: string): CspViolation[] {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return []; }
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(j)) {
    for (const r of j.slice(0, 20)) if (r && typeof r === "object" && (r as { type?: string }).type === "csp-violation") bodies.push(((r as { body?: unknown }).body ?? {}) as Record<string, unknown>);
  } else if (j && typeof j === "object" && "csp-report" in j) {
    bodies.push(((j as Record<string, unknown>)["csp-report"] ?? {}) as Record<string, unknown>);
  }
  return bodies.map((b) => ({
    directive: clip(b["effective-directive"] ?? b.effectiveDirective ?? b["violated-directive"], 40),
    blocked: originOf(b["blocked-uri"] ?? b.blockedURL),
    page: pathOf(b["document-uri"] ?? b.documentURL),
    disposition: clip(b.disposition ?? "report", 10),
  }));
}
