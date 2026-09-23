import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isClientEventName, trackEvent } from "@/lib/events";

export const runtime = "nodejs";

// Client-side product events (upgrade_clicked). Only names on the browser
// allow-list are accepted, so limit and subscription events cannot be forged;
// props are capped so the table cannot be used as free storage.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { name?: unknown; props?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isClientEventName(body.name)) return NextResponse.json({ ok: false }, { status: 400 });

  let props: Record<string, unknown> | undefined;
  if (body.props && typeof body.props === "object") {
    const raw = JSON.stringify(body.props);
    if (raw.length <= 2000) props = body.props as Record<string, unknown>;
  }
  await trackEvent(supabase, user.id, body.name, props);
  return NextResponse.json({ ok: true });
}
