import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clipFolderOf, removeFolder } from "@/lib/studioClips/storage";
import { isCronRequest } from "@/lib/cronAuth";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 120;

// Retention for raw footage (supabase/studio-purge-cron.sql, nightly). Clips
// past expires_at lose their bytes — source, keyframes, audio — and become
// "expired"; the measured facts, transcript, card, Content Yield and edit
// guides stay, so an old project still reads. Service role; CRON_SECRET.
async function run(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });

  const deadline = Date.now() + 100_000;
  const nowIso = new Date().toISOString();
  const { data, error } = await svc
    .from("studio_clips")
    .select("id, project_id, source_path, expires_at")
    .lt("expires_at", nowIso)
    .is("purged_at", null)
    .order("expires_at", { ascending: true })
    .limit(200);
  if (error) return dbErrorResponse("studio-purge", error);

  const run = { due: (data ?? []).length, purged: 0, errors: 0 };
  for (const c of (data ?? []) as { id: string; project_id: string; source_path: string | null }[]) {
    if (Date.now() > deadline) break;
    // Only the clip's own folder: a path pointing anywhere else is cleared, never deleted.
    const folder = clipFolderOf(c);
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
