// Media for posts an AI assistant creates. Two sources, both ending up as a
// file of SOCIA's own in the scheduled-media bucket under the workspace
// owner's folder, so a post never depends on someone else's link or on
// another post's file staying put:
//
//   media_id   a file already in SOCIA (attached to one of the workspace's
//              posts, drafts included). It is COPIED, so deleting the original
//              post never takes the new post's media with it.
//   url        a public https link to an image or video. SOCIA fetches it once
//              (public addresses only, no credentials, at most 3 redirects,
//              size-capped while streaming) and stores the bytes.
//
// Width, height and duration are unknown for a fetched video (null, never 0):
// the platform checks them at upload, exactly as for a file whose browser
// couldn't measure it. Image dimensions are read from PNG/JPEG headers.
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Ctx } from "../context";
import type { MediaItem, MediaKind } from "../publishing/types";
import { isPrivateAddress } from "../oauth/clients";
import { scopeToWorkspace } from "../workspaces";
import { ApiFailure } from "./context";

export const MEDIA_BUCKET = "scheduled-media";
const MB = 1024 * 1024;
/** Largest file SOCIA copies from a link, by kind. Bigger files: upload in SOCIA's Create post. */
export const LINK_MAX_BYTES: Record<MediaKind, number> = { image: 10 * MB, video: 100 * MB };
const LINK_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 3;

/** Types SOCIA accepts from a link: the union of what its platforms take (lib/publishing/capabilities.ts). */
export const LINK_TYPES: Record<string, { kind: MediaKind; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/x-m4v": { kind: "video", ext: "m4v" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** A media file in SOCIA, as an assistant sees it. */
export type ListedMedia = {
  media_id: string;
  kind: MediaKind;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  in_post: { id: string; status: string; caption_preview: string };
};

type PostRow = { id: string; caption: string | null; status: string; media: MediaItem[] | null; updated_at: string };

async function recentPosts(ctx: Ctx, limit: number): Promise<PostRow[]> {
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("id, caption, status, media, updated_at").eq("user_id", ctx.ownerId).neq("status", "cancelled"),
    ctx.workspace?.id,
  ).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new ApiFailure("unavailable", "SOCIA couldn't read the workspace's media just now. Try again shortly.");
  return (data ?? []) as PostRow[];
}

/** Uploaded files in the workspace's posts, newest post first, each file once. */
export async function listWorkspaceMedia(ctx: Ctx, limit = 30): Promise<ListedMedia[]> {
  const seen = new Set<string>();
  const out: ListedMedia[] = [];
  for (const p of await recentPosts(ctx, 80)) {
    for (const m of Array.isArray(p.media) ? p.media : []) {
      if (!m?.path || !m.id || seen.has(m.path)) continue;
      seen.add(m.path);
      out.push({
        media_id: m.id, kind: m.kind, name: m.name || "file", mime: m.mime || null, size_bytes: m.size ?? null,
        width: m.width ?? null, height: m.height ?? null, duration_seconds: m.duration ?? null,
        in_post: { id: p.id, status: p.status, caption_preview: (p.caption ?? "").slice(0, 80) },
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const extOf = (path: string) => (path.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "bin").toLowerCase();
const newPath = (ownerId: string, ext: string) => `${ownerId}/assistant/${randomUUID()}.${ext}`;
const publicUrl = (svc: Supa, path: string): string => svc.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

/** A file already in one of this workspace's posts, copied to a new file of the owner's. */
export async function copyWorkspaceMedia(ctx: Ctx, svc: Supa, mediaId: string): Promise<MediaItem> {
  let found: MediaItem | null = null;
  for (const p of await recentPosts(ctx, 200)) {
    found = (Array.isArray(p.media) ? p.media : []).find((m) => m?.id === mediaId && m.path) ?? null;
    if (found) break;
  }
  if (!found?.path) throw new ApiFailure("not_found", `Media ${mediaId} isn't in this Brand Workspace. Use list_media to see the files you can use.`);
  const to = newPath(ctx.ownerId, extOf(found.path));
  const { error } = await svc.storage.from(MEDIA_BUCKET).copy(found.path, to);
  if (error) throw new ApiFailure("unavailable", `SOCIA couldn't copy ${found.name || "that file"} just now. Try again shortly.`);
  return { ...found, id: randomUUID(), path: to, url: publicUrl(svc, to) };
}

// ------------------------------------------------------------------ links

export type LinkDeps = { fetch: typeof fetch; resolve: (host: string) => Promise<string[]> };
const defaultDeps: LinkDeps = { fetch: (...a) => fetch(...a), resolve: async (h) => (await lookup(h, { all: true })).map((r) => r.address) };

/** Why a link can't be fetched, or null. https only, no credentials, never a private or loopback address. */
export async function checkLinkTarget(raw: string, deps: LinkDeps = defaultDeps): Promise<string | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return "That isn't a valid link."; }
  if (u.protocol !== "https:") return "Only https links can be used.";
  if (u.username || u.password) return "Links with a username or password can't be used.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  try {
    const addrs = isIP(host) ? [host] : await deps.resolve(host);
    if (!addrs.length || addrs.some(isPrivateAddress)) return "That link points to a private address.";
  } catch {
    return "That link's address couldn't be found.";
  }
  return null;
}

/** Image width and height from a PNG or JPEG header, or nulls. */
export function imageSize(b: Uint8Array): { width: number | null; height: number | null } {
  const none = { width: null, height: null };
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16) || null, height: dv.getUint32(20) || null };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        return { width: w || null, height: h || null };
      }
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return none;
}

const fileName = (u: URL, ext: string) => {
  const last = decodeURIComponent(u.pathname.split("/").pop() ?? "").replace(/[^\w.\- ]+/g, "").slice(0, 80);
  return last || `linked-file.${ext}`;
};

/** Fetch a public image or video once and keep it as a file of the owner's. */
export async function importLinkedMedia(ctx: Ctx, svc: Supa, link: string, deps: LinkDeps = defaultDeps): Promise<MediaItem> {
  let url = link;
  let res: Response | null = null;
  const signal = AbortSignal.timeout(LINK_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = await checkLinkTarget(url, deps);
    if (bad) throw new ApiFailure("invalid_input", `${bad} (${link})`);
    try {
      res = await deps.fetch(url, { redirect: "manual", signal, headers: { accept: "image/*,video/*" } });
    } catch {
      throw new ApiFailure("invalid_input", `SOCIA couldn't download ${link}. Check that it's a public link to the file itself.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new ApiFailure("invalid_input", `${link} redirects too many times.`);
  if (!res.ok) throw new ApiFailure("invalid_input", `${link} answered ${res.status}. Use a public link to the file itself.`);
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const type = LINK_TYPES[mime];
  if (!type) throw new ApiFailure("invalid_input", `${link} isn't a direct image or video file${mime ? ` (it's ${mime})` : ""}. Share pages (Google Drive, Dropbox previews) don't work; use the file's own link, or upload it in SOCIA.`);
  const cap = LINK_MAX_BYTES[type.kind];
  const tooBig = () => new ApiFailure("invalid_input", `${link} is larger than ${cap / MB} MB, the most SOCIA copies from a link. Upload it in SOCIA's Create post instead.`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) throw tooBig();

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (!reader) throw new ApiFailure("invalid_input", `${link} sent no file.`);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) { await reader.cancel().catch(() => undefined); throw tooBig(); }
    chunks.push(value);
  }
  if (!size) throw new ApiFailure("invalid_input", `${link} is empty.`);
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }

  const path = newPath(ctx.ownerId, type.ext);
  const { error } = await svc.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new ApiFailure("unavailable", "SOCIA couldn't store that file just now. Try again shortly.");
  const dims = type.kind === "image" ? imageSize(bytes.subarray(0, Math.min(bytes.length, 256 * 1024))) : { width: null, height: null };
  return {
    id: randomUUID(), kind: type.kind, name: fileName(new URL(link), type.ext), mime, size,
    width: dims.width, height: dims.height, duration: null, path, url: publicUrl(svc, path),
  };
}
