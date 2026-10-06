import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { removeFolder } from "@/lib/studioClips/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

// Retention for raw footage (supabase/studio-purge-cron.sql, nightly). Clips
// past expires_at lose their bytes — source, keyframes, audio — and become
// "expired"; the measured facts, transcript, card, Content Yield and edit
// guides stay, so an old project still reads. Service role; CRON_SECRET.
async function run(req: Request) {
  const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/^["']|["']$/g, "");
  const bearer = clean(req.headers.get("authorization")).match(/^bearer\s+(.+)$/i)?.[1];
  const secret = clean(process.env.CRON_SECRET);
  if (!secret || bearer === undefined || clean(bearer) !== secret) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });

  const deadline = Date.now() + 100_000;
  const nowIso = new Date().toISOString();
  const { data, error } = await svc
    .from("studio_clips")
    .select("id, source_path, expires_at")
    .lt("expires_at", nowIso)
    .is("purged_at", null)
    .order("expires_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const run = { due: (data ?? []).length, purged: 0, errors: 0 };
  for (const c of (data ?? []) as { id: string; source_path: string | null }[]) {
    if (Date.now() > deadline) break;
    const folder = c.source_path ? c.source_path.split("/").slice(0, 3).join("/") : null;
    const removed = folder ? await removeFolder(svc, folder) : true;
    if (!removed) { run.errors++; continue; }
    const { error: upErr } = await svc.from("studio_clips").update({ status: "expired", source_path: null, frames: null, audio_path: null, purged_at: nowIso, updated_at: nowIso }).eq("id", c.id);
    if (upErr) run.errors++; else run.purged++;
  }
  console.log("[studio-purge]", JSON.stringify(run));
  return NextResponse.json(run);
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
