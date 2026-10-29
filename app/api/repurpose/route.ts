import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { getActiveConnection, getIgSnapshot } from "@/lib/instagramSync";
import { loadItem, loadPickerAccountsDetailed, saveItem, stampPostWorkspace, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import { PLATFORMS, defaultSettings, type DestinationSettings, type MediaItem, type Platform } from "@/lib/publishing/types";
import type { CreatePostPayload } from "@/lib/publishing/composer";
import { youtubeTitle } from "@/lib/repurpose";
import { fetchAllowed, isPlatformMediaUrl } from "@/lib/fetchGuard";
import { storageFetchUrl, storageOrigin } from "@/lib/publishing/adapters/youtube";
import { isOwnPath } from "@/lib/storagePaths";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/repurpose: "Worth posting again" → one draft with the same media
// for the chosen platforms. The file is copied into the viewer's own folder
// (from Instagram for the account's own post, or from SOCIA's storage for a
// post SOCIA sent), so the new draft never shares a file with the original.
// The draft starts from the original caption; Create post then writes a fresh
// caption for each platform. Nothing is scheduled or published here.
//
// body: { source: { kind: "instagram" | "post", id }, platforms: Platform[] }

const BUCKET = "scheduled-media";
const IG_V = "v23.0";
/** Copied in one request; bigger files are added in Create post instead. */
const MAX_BYTES = 200 * 1024 * 1024;
const TAKES: Record<Platform, MediaItem["kind"][]> = { instagram: ["video", "image"], tiktok: ["video"], youtube: ["video"], facebook: ["video", "image"] };

type Original = { caption: string; kind: MediaItem["kind"]; url: string; mime: string | null; name: string };

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "Not signed in.");
  const ctx = await resolveContext(supabase, user.id);
  const wsId = ctx.workspace?.id ?? null;

  const g = await requireFeature(ctx.client, ctx.ownerId, "repurposing");
  if (g.denied) return g.denied;

  const body = (await req.json().catch(() => null)) as { source?: { kind?: unknown; id?: unknown }; platforms?: unknown } | null;
  const kind = body?.source?.kind;
  const id = typeof body?.source?.id === "string" ? body.source.id.slice(0, 80) : "";
  if ((kind !== "instagram" && kind !== "post") || !id) return fail(400, "Choose a post to repurpose.");
  const wanted = Array.isArray(body?.platforms) ? Array.from(new Set(body!.platforms.filter((p): p is Platform => PLATFORMS.includes(p as Platform)))) : [];
  if (!wanted.length) return fail(400, "Choose at least one platform.");

  // The original: its caption and where its file can be fetched right now.
  let orig: Original;
  if (kind === "instagram") {
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null);
    const m = snap?.media?.find((x) => x.id === id);
    if (!m) return fail(404, "SOCIA can't find that Instagram post in your synced posts.");
    if (m.media_type !== "VIDEO" && m.media_type !== "IMAGE") return fail(422, "Carousels can't be repurposed yet: start a new post with those images in Create post.");
    const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "access_token", wsId).catch(() => null)) as { access_token?: string } | null;
    if (!conn?.access_token) return fail(409, "Reconnect Instagram so SOCIA can fetch the post's file.");
    // A fresh link: the ones stored with the snapshot expire.
    const u = new URL(`https://graph.instagram.com/${IG_V}/${encodeURIComponent(id)}`);
    u.searchParams.set("fields", "media_type,media_url");
    u.searchParams.set("access_token", conn.access_token);
    const r = await fetch(u, { cache: "no-store" }).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => null)) as { media_url?: string } | null) : null;
    if (!j?.media_url) {
      return fail(422, m.media_type === "VIDEO"
        ? "Instagram doesn't share the file for this Reel (it does that for Reels with licensed music). Save it from Instagram and add it in Create post."
        : "Instagram didn't share the file for this post. Save it from Instagram and add it in Create post.");
    }
    orig = { caption: m.caption ?? "", kind: m.media_type === "VIDEO" ? "video" : "image", url: j.media_url, mime: null, name: `instagram-${id}` };
  } else {
    const item = await loadItem(ctx.client, id, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
    const f = item?.media[0];
    // SOCIA's own file, read from its own storage: the stored URL is never
    // fetched as is (the row can be edited), only the bucket path is.
    const ownFile = f?.path && isOwnPath(f.path, [ctx.viewerId, ctx.ownerId]) ? storageFetchUrl({ path: f.path, url: null }, storageOrigin()) : null;
    if (!item || !f || !ownFile) return fail(404, "SOCIA can't find that post's file.");
    orig = { caption: item.caption ?? "", kind: f.kind, url: ownFile, mime: f.mime || null, name: f.name || `post-${id}` };
  }

  // Destinations: one connected account per platform that takes this media.
  const { accounts } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, wsId);
  const chosen = wanted
    .filter((p) => TAKES[p].includes(orig.kind))
    .map((p) => accounts.find((a) => a.platform === p && !a.suspended))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (!chosen.length) return fail(400, `None of those platforms is connected for a ${orig.kind === "video" ? "video" : "photo"}.`);

  // Copy the file into the viewer's own folder.
  const allowedSource = (u: string) => isPlatformMediaUrl(u) || u.startsWith(`${storageOrigin() ?? "\u0000"}/storage/v1/object/public/`);
  const res = await fetchAllowed(orig.url, allowedSource, { cache: "no-store" });
  if (!res?.ok) return fail(502, "SOCIA couldn't download the post's file just now. Try again in a moment.");
  const declared = Number(res.headers.get("content-length"));
  const tooBig = () => fail(413, `This file is over ${MAX_BYTES / 1024 / 1024} MB, too large to copy here. Save it and add it in Create post.`);
  if (Number.isFinite(declared) && declared > MAX_BYTES) return tooBig();
  const bytes = await res.arrayBuffer().catch(() => null);
  if (!bytes) return fail(502, "SOCIA couldn't download the post's file just now. Try again in a moment.");
  if (bytes.byteLength > MAX_BYTES) return tooBig();
  const mime = (res.headers.get("content-type") ?? orig.mime ?? "").split(";")[0].trim() || (orig.kind === "video" ? "video/mp4" : "image/jpeg");
  const ext = mime === "video/quicktime" ? "mov" : mime.startsWith("video/") ? "mp4" : mime === "image/png" ? "png" : "jpg";
  const path = `${ctx.viewerId}/repurpose/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("[repurpose] upload", up.error.message);
    return fail(/exceed|too large|413/i.test(up.error.message) ? 413 : 502, /exceed|too large|413/i.test(up.error.message)
      ? "This file is larger than your storage upload limit. Save it and add it in Create post."
      : "SOCIA couldn't store a copy of the file. Try again in a moment.");
  }
  const media: MediaItem = {
    id: crypto.randomUUID(), kind: orig.kind, name: `${orig.name}.${ext}`, mime, size: bytes.byteLength,
    width: null, height: null, duration: null, path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
  };

  const settingsFor = (p: Platform): DestinationSettings => {
    if (p === "instagram") return { ...defaultSettings("instagram"), format: orig.kind === "video" ? "reel" : "image" };
    if (p === "youtube") return { ...defaultSettings("youtube"), title: youtubeTitle(orig.caption) };
    return defaultSettings(p);
  };
  const payload: CreatePostPayload = {
    id: null, caption: orig.caption, media: [media], scheduledAt: null, source: "repurpose", planId: null, planDay: null,
    customizePerPlatform: false,
    destinations: chosen.map((a) => ({ platform: a.platform, accountId: a.accountId, settings: settingsFor(a.platform), scheduledAt: null })),
    action: "draft",
  };

  try {
    const item = await saveItem(ctx.client, ctx.ownerId, payload, "draft");
    await stampPostWorkspace(ctx.client, ctx.ownerId, wsId, item.id);
    return NextResponse.json({ postId: item.id, platforms: chosen.map((a) => CAPABILITIES[a.platform].label) });
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
    if (e instanceof MissingTableError) return fail(503, MIGRATION_MESSAGE);
    console.error("[repurpose] save", (e as Error)?.message ?? e);
    return fail(500, "SOCIA couldn't create the draft. Try again in a moment.");
  }
}
