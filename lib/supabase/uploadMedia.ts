import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

// Supabase's TUS endpoint requires every chunk except the last to be exactly 6 MB.
const CHUNK = 6 * 1024 * 1024;
const RETRIES = 3;

/** Upload a file to Storage. Small files go in one request; anything over one
 *  chunk goes through Supabase's resumable (TUS) endpoint in 6 MB pieces, so a
 *  single dropped connection mid-video doesn't sink the whole upload (a single
 *  big fetch surfaces that as the unhelpful "Failed to fetch"). */
export async function uploadMedia(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  /** Optional: bytes sent so far, for a progress bar. Called per chunk. */
  onProgress?: (sent: number, total: number) => void,
): Promise<void> {
  // Optional client-side guard: when NEXT_PUBLIC_MAX_UPLOAD_MB is set to match
  // the project's Supabase Storage limit, an oversized file fails instantly with
  // actionable guidance instead of waiting for a 413 from storage. Unset (the
  // default) = no guard, so this never wrongly blocks a file that would upload.
  const maxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);
  if (Number.isFinite(maxMb) && maxMb > 0 && file.size > maxMb * 1024 * 1024) {
    throw new Error(`Upload failed: this file is ${(file.size / 1024 / 1024).toFixed(0)} MB, over the ${maxMb} MB upload limit. Compress it to a smaller size and try again.`);
  }
  const contentType = file.type || "application/octet-stream";
  if (file.size <= CHUNK) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    onProgress?.(file.size, file.size);
    return;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Upload failed: you're signed out. Sign in again and retry.");

  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const auth = { authorization: `Bearer ${token}`, apikey: getSupabaseAnonKey(), "tus-resumable": "1.0.0" };

  const create = await fetch(`${getSupabaseUrl()}/storage/v1/upload/resumable`, {
    method: "POST",
    headers: {
      ...auth,
      "x-upsert": "false",
      "upload-length": String(file.size),
      "upload-metadata": [
        `bucketName ${b64(bucket)}`,
        `objectName ${b64(path)}`,
        `contentType ${b64(contentType)}`,
        `cacheControl ${b64("3600")}`,
      ].join(","),
    },
  }).catch(() => null);
  if (!create) throw new Error("Upload failed: couldn't reach storage. Check your connection and retry.");
  if (!create.ok) throw new Error(`Upload failed: ${await describe(create, file.size)}`);
  const location = create.headers.get("location");
  if (!location) throw new Error("Upload failed: storage didn't return an upload URL.");

  let offset = 0;
  let attempts = 0;
  while (offset < file.size) {
    const res = await fetch(location, {
      method: "PATCH",
      headers: { ...auth, "upload-offset": String(offset), "content-type": "application/offset+octet-stream" },
      body: file.slice(offset, offset + CHUNK),
    }).catch(() => null);

    if (res?.ok) {
      offset = Number(res.headers.get("upload-offset") ?? offset + CHUNK);
      attempts = 0;
      onProgress?.(Math.min(offset, file.size), file.size);
      continue;
    }
    if (res && res.status !== 409 && res.status < 500) throw new Error(`Upload failed: ${await describe(res, file.size)}`);
    if (++attempts > RETRIES) throw new Error("Upload failed: the connection kept dropping. Check your connection and retry.");

    // Network drop, offset conflict, or server hiccup: ask where the server got to and resume from there.
    await new Promise((r) => setTimeout(r, 1000 * attempts));
    const head = await fetch(location, { method: "HEAD", headers: auth }).catch(() => null);
    if (head?.ok) offset = Number(head.headers.get("upload-offset") ?? offset);
  }
}

async function describe(res: Response, size: number): Promise<string> {
  if (res.status === 413) {
    return `this file is ${(size / 1024 / 1024).toFixed(0)} MB, over your storage upload limit. Compress it or raise the limit in Supabase → Storage → Settings.`;
  }
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j.message ?? j.error ?? `HTTP ${res.status}`;
  } catch {
    return text.trim() || `HTTP ${res.status}`;
  }
}
