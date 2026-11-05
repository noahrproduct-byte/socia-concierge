import { NextResponse } from "next/server";
import { addressKey, rateHit } from "@/lib/oauth/runtime";
import { submitSignup } from "@/lib/contacts/server";
import { cleanSlug } from "@/lib/contacts/contacts";

export const runtime = "nodejs";

// POST { email, handle?, consent, website? } from a brand's public sign-up page.
// Anyone may sign up, so: only from SOCIA's own page, a few tries per address
// an hour and a ceiling per page (both keyed on the page's real address, so a
// differently spelled one doesn't get a fresh allowance), refused when the
// limiter can't be checked, and a hidden field bots fill in.
const PER_ADDRESS_HOUR = 8;
const PER_PAGE_HOUR = 200;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = cleanSlug((await params).slug);
  if (!slug) return NextResponse.json({ error: "This page isn't available." }, { status: 404 });
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Sign up from the page itself." }, { status: 403 });
  for (const [key, limit] of [[`signup:${slug}:${addressKey(req)}`, PER_ADDRESS_HOUR], [`signup-page:${slug}`, PER_PAGE_HOUR]] as const) {
    const r = await rateHit(key, 3600, limit);
    if (r === "unavailable") return NextResponse.json({ error: "Sign-ups can't be taken just now. Try again in a minute." }, { status: 503 });
    if (r === "limited") return NextResponse.json({ error: "Too many tries. Try again in a little while." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { email?: unknown; handle?: unknown; consent?: unknown; website?: unknown } | null;
  // The hidden field: a person never sees it, so anything in it is a bot. Answer as if it worked.
  if (body?.website) return NextResponse.json({ ok: true });
  const r = await submitSignup(slug, { email: body?.email, handle: body?.handle, consent: body?.consent });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
