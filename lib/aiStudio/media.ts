// Files for the AI Clipper and AI Studio: the private `ai-media` bucket
// (supabase/ai-studio.sql). Providers' output URLs expire, so every result is
// copied here; the browser reads through short signed URLs. Server only.
import { randomUUID } from "node:crypto";

export const AI_BUCKET = "ai-media";
/** How long a playback or download link stays valid. */
export const SIGNED_SECONDS = 60 * 60;
/** Largest file SOCIA will copy from a provider (clips and generations are far smaller). */
export const MAX_COPY_BYTES = 500 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

export const EXT_FOR: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_FOR_EXT: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", "3gp": "video/3gpp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
/** The stored type comes from the path SOCIA chose, not the provider's header: the bucket only takes these types. */
export const typeForPath = (path: string, fallback: string): string => TYPE_FOR_EXT[(path.split(".").pop() ?? "").toLowerCase()] ?? fallback;
export const extOf = (contentType: string | null | undefined, fallback = "bin"): string => EXT_FOR[(contentType ?? "").split(";")[0].trim().toLowerCase()] ?? fallback;

/** `<owner>/<area>/<uuid>.<ext>`: the owner's folder, as the bucket policies require. */
export function mediaPath(ownerId: string, area: "clipper-sources" | "clips" | "generations" | "thumbs" | "studio-inputs", ext: string): string {
  return `${ownerId}/${area}/${randomUUID()}.${ext.replace(/^\./, "")}`;
}

/** Download a provider's file and store it. Returns the stored path and type. */
export async function copyUrlToBucket(svc: Svc, url: string, path: string, fallbackType = "application/octet-stream"): Promise<{ path: string; contentType: string; bytes: number }> {
  const res = await fetch(url, { headers: { Accept: "*/*" } });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_COPY_BYTES) throw new Error("file too large to copy");
  const contentType = typeForPath(path, fallbackType);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_COPY_BYTES) throw new Error("file too large to copy");
  const { error } = await svc.storage.from(AI_BUCKET).upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return { path, contentType, bytes: buf.byteLength };
}

/** A link the browser can play or download for an hour. null when the path is empty. */
export async function signedUrl(svc: Svc, path: string | null | undefined, seconds = SIGNED_SECONDS, download?: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await svc.storage.from(AI_BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl as string;
}

/** Where the browser PUTs a source file; valid for a short while. */
export async function signedUploadUrl(svc: Svc, path: string): Promise<{ signedUrl: string; token: string } | null> {
  const { data, error } = await svc.storage.from(AI_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) return null;
  return { signedUrl: data.signedUrl as string, token: data.token as string };
}

export async function removePaths(svc: Svc, paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => Boolean(p));
  if (!list.length) return;
  await svc.storage.from(AI_BUCKET).remove(list).catch(() => null);
}

/** Copy a stored AI file into the scheduler's bucket under the owner, so Create Post can use it. */
export async function copyToScheduledMedia(svc: Svc, fromPath: string, ownerId: string, ext: string): Promise<{ path: string; publicUrl: string }> {
  const { data, error } = await svc.storage.from(AI_BUCKET).download(fromPath);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
  const path = `${ownerId}/ai/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await (data as Blob).arrayBuffer());
  const contentType = (data as Blob).type || (ext === "mp4" ? "video/mp4" : "image/jpeg");
  const up = await svc.storage.from("scheduled-media").upload(path, buf, { contentType, upsert: false });
  if (up.error) throw new Error(`copy failed: ${up.error.message}`);
  const { data: pub } = svc.storage.from("scheduled-media").getPublicUrl(path);
  return { path, publicUrl: pub.publicUrl as string };
}
