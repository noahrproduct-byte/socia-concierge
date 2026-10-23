import { CSP_REPORT_MAX_BYTES, parseCspReport } from "@/lib/cspReport";

export const runtime = "nodejs";

// POST /api/csp-report: browsers send Content-Security-Policy violations here
// (report-uri in next.config.mjs). Public by necessity: reports carry no
// cookies. Each violation becomes one short "[csp]" log line, without query
// strings; Vercel's logs then show what a signed-in session really loads, so
// the report-only policy can be enforced once they are quiet.

let windowStart = 0;
let logged = 0;
const PER_MINUTE = 120;

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  const text = await req.text().catch(() => "");
  if (text.length > CSP_REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; logged = 0; }
  for (const v of parseCspReport(text)) {
    if (++logged > PER_MINUTE) break;
    console.warn(`[csp] ${v.disposition} ${v.directive} blocked=${v.blocked} page=${v.page}`);
  }
  return new Response(null, { status: 204 });
}
