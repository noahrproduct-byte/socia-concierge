// Where a clip's bytes live in the private studio-sources bucket, and how
// the server hands out short-lived signed URLs for them. Paths are namespaced
// by the UPLOADER's auth uid (first segment) so the bucket's RLS lets the
// browser write them with its own session.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { STUDIO_BUCKET } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const clipFolder = (uploaderId: string, projectId: string, clipId: string): string => `${uploaderId}/${projectId}/${clipId}`;
export const sourcePath = (folder: string, ext: string): string => `${folder}/source.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp4"}`;
export const framePath = (folder: string, index: number): string => `${folder}/frames/${index}.jpg`;
export const audioPath = (folder: string): string => `${folder}/audio.wav`;

/** The client to read or delete objects with: the service role when present
 *  (team members and jobs have no session of their own), else the caller's. */
export const storageClient = (fallback: Supa): Supa => createServiceClient() ?? fallback;

export const SIGNED_URL_TTL_S = 3600;

/** Signed URLs for many paths at once; paths that fail to sign are left out. */
export async function signUrls(client: Supa, paths: string[], expiresIn = SIGNED_URL_TTL_S): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return out;
  try {
    const { data, error } = await storageClient(client).storage.from(STUDIO_BUCKET).createSignedUrls(unique, expiresIn);
    if (error) throw error;
    for (const r of data ?? []) if (r.signedUrl && r.path) out[r.path] = r.signedUrl;
  } catch (e) {
    console.error("[studio] could not sign storage URLs:", (e as Error)?.message ?? e);
  }
  return out;
}

/** Remove every object under a clip's folder (source, frames, audio). Best-effort. */
export async function removeFolder(client: Supa, folder: string): Promise<boolean> {
  const st = storageClient(client).storage.from(STUDIO_BUCKET);
  try {
    const [top, frames] = await Promise.all([st.list(folder, { limit: 100 }), st.list(`${folder}/frames`, { limit: 200 })]);
    const paths = [
      ...((top.data ?? []).filter((o) => o.id).map((o) => `${folder}/${o.name}`)),
      ...((frames.data ?? []).filter((o) => o.id).map((o) => `${folder}/frames/${o.name}`)),
    ];
    if (paths.length) {
      const { error } = await st.remove(paths);
      if (error) throw error;
    }
    return true;
  } catch (e) {
    console.error(`[studio] could not remove ${folder}:`, (e as Error)?.message ?? e);
    return false;
  }
}
