import { NextResponse } from "next/server";
import { rateHit } from "@/lib/oauth/runtime";
import { submitSignup } from "@/lib/contacts/server";

export const runtime = "nodejs";

// POST { email, handle?, consent, website? } from a brand's public sign-up page.
// Anyone may sign up, so: only from SOCIA's own page, a few tries per address
// an hour, and a hidden field bots fill in.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Sign up from the page itself." }, { status: 403 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if ((await rateHit(`signup:${slug.slice(0, 40)}:${ip}`, 3600, 8)) === "limited") {
    return NextResponse.json({ error: "Too many tries. Try again in a little while." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { email?: unknown; handle?: unknown; consent?: unknown; website?: unknown } | null;
  // The hidden field: a person never sees it, so anything in it is a bot. Answer as if it worked.
  if (body?.website) return NextResponse.json({ ok: true });
  const r = await submitSignup(slug, { email: body?.email, handle: body?.handle, consent: body?.consent });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
