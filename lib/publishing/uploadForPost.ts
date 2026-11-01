// One file on its way into a post, in the browser: measured, made smaller
// when it's an oversized video, and uploaded to the person's own folder in
// the scheduled-media bucket. Used by Ask SOCIA (footage in the chat, and a
// rated video it schedules). Client only.
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { compressVideo, shouldOfferCompression } from "@/lib/videoCompress";
import { measure } from "./mediaInfo";
import type { MediaItem } from "./types";

export const POST_MEDIA_BUCKET = "scheduled-media";
export type UploadStep = "measuring" | "compressing" | "uploading";

export async function uploadForPost(original: File, userId: string, onStep?: (s: UploadStep) => void): Promise<{ media: MediaItem; file: File }> {
  let file = original;
  onStep?.("measuring");
  let m = await measure(file);
  URL.revokeObjectURL(m.previewUrl);
  if (shouldOfferCompression(file)) {
    onStep?.("compressing");
    const smaller = await compressVideo(file);
    if (smaller) { file = smaller; m = await measure(smaller); URL.revokeObjectURL(m.previewUrl); }
  }
  onStep?.("uploading");
  const supabase = createClient();
  const path = `${userId}/ask/${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
  await uploadMedia(supabase, POST_MEDIA_BUCKET, path, file);
  const url = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  return { media: { id: crypto.randomUUID(), kind: m.kind, name: file.name, mime: m.mime ?? "", size: file.size, width: m.width ?? null, height: m.height ?? null, duration: m.duration ?? null, path, url }, file };
}

/** Take back an upload whose post wasn't saved. */
export async function removePostUpload(path: string): Promise<void> {
  await createClient().storage.from(POST_MEDIA_BUCKET).remove([path]).then(() => null, () => null);
}
