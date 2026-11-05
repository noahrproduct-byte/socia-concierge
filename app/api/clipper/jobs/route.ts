import { NextResponse } from "next/server";
import { aiRequest, aiErrorResponse } from "@/lib/aiStudio/auth";
import { perUserLimit } from "@/lib/rateLimit";
import { recordEvent } from "@/lib/planGuard";
import { createClipJob, listClipJobs, cleanOptions, PriceCheckError, YOUTUBE_RE } from "@/lib/clipper/server";
import { clipCredits } from "@/lib/credits/config";
import { creditBalance } from "@/lib/credits/ledger";
import { isOwnPath } from "@/lib/storagePaths";

export const runtime = "nodejs";
export const maxDuration = 60;

// The AI Clipper's jobs (Scale).
//   GET  -> { jobs, balance }
//   POST { source: { kind, url | path }, minutes?, options } -> the job
//        SOCIA measures the video and prices it from that length. When it is
//        longer than the `minutes` the page showed a price for, nothing is
//        spent: 409 { code: "confirm_price", minutes, price } and the page asks
//        again with the real price. Credits are spent up front and refunded if
//        the job fails.
export async function GET() {
  const r = await aiRequest("ai_clipper");
  if (!r.ok) return r.res;
  try {
    const [jobs, balance] = await Promise.all([
      listClipJobs(r.ctx.client, r.ctx.ownerId, r.ctx.workspace?.id ?? null),
      creditBalance(r.ctx.ownerId, r.ent.plan).catch(() => null),
    ]);
    return NextResponse.json({ jobs, balance });
  } catch (e) {
    if (e instanceof PriceCheckError) return NextResponse.json({ error: e.message, code: e.code, minutes: e.minutes, price: e.price }, { status: 409 });
    return aiErrorResponse("clipper/jobs", e);
  }
}

export async function POST(req: Request) {
  const r = await aiRequest("ai_clipper", { mutate: true });
  if (!r.ok) return r.res;
  const limited = await perUserLimit(r.viewerId, "clipper_submit", 10, "clipping");
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { source?: { kind?: string; url?: string; path?: string }; minutes?: unknown; options?: unknown } | null;
  const kind = body?.source?.kind;
  const url = typeof body?.source?.url === "string" ? body.source.url.trim() : "";
  const path = typeof body?.source?.path === "string" ? body.source.path : null;
  const minutes = typeof body?.minutes === "number" && body.minutes > 0 ? Math.ceil(body.minutes) : null;
  const options = cleanOptions(body?.options);
  let source: Parameters<typeof createClipJob>[1]["source"];
  if (kind === "youtube") {
    if (!YOUTUBE_RE.test(url)) return NextResponse.json({ error: "Paste a YouTube video link." }, { status: 400 });
    source = { kind: "youtube", url };
  } else if (kind === "upload") {
    if (!path || !isOwnPath(path, [r.ctx.ownerId, r.viewerId]) || !/\.(mp4|mov|3gp)$/i.test(path)) return NextResponse.json({ error: "Upload the video first." }, { status: 400 });
    source = { kind: "upload", url: path, path };
  } else if (kind === "url") {
    if (!/^https:\/\/\S+\.(mp4|mov|3gp)(\?\S*)?$/i.test(url)) return NextResponse.json({ error: "Paste a direct https link to an .mp4, .mov or .3gp file." }, { status: 400 });
    source = { kind: "url", url };
  } else return NextResponse.json({ error: "Choose a YouTube link, a direct video link or an upload." }, { status: 400 });
  try {
    const job = await createClipJob(r.ctx, { source, minutes, options });
    recordEvent(r.ctx.client, r.ctx.ownerId, "ai_usage", { feature: "clipper_job", minutes: job.source_minutes, credits: job.credits_reserved });
    const balance = await creditBalance(r.ctx.ownerId, r.ent.plan).catch(() => null);
    return NextResponse.json({ job, balance, price: clipCredits(job.source_minutes, options.clipModel, job.provider === "socia" ? "socia" : "vizard") });
  } catch (e) {
    if (e instanceof PriceCheckError) return NextResponse.json({ error: e.message, code: e.code, minutes: e.minutes, price: e.price }, { status: 409 });
    return aiErrorResponse("clipper/jobs", e);
  }
}
