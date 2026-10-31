// Server side of lib/publishing/postLabel: for posts with no caption, read their
// destinations' settings and name them from those (a YouTube title, say).
// Any failure leaves the post unnamed here; the caller falls back to "Untitled post".

import type { SupabaseClient } from "@supabase/supabase-js";
import { firstLineOf, postLabel, type LabelSource } from "./postLabel";

export async function captionlessLabels(client: SupabaseClient, ownerId: string, posts: { id: string; caption: string | null }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = posts.filter((p) => !firstLineOf(p.caption)).map((p) => p.id).slice(0, 100);
  if (!ids.length) return out;
  try {
    const { data, error } = await client.from("post_destinations").select("post_id, platform, status, settings").eq("user_id", ownerId).in("post_id", ids);
    if (error || !data) return out;
    const by = new Map<string, LabelSource[]>();
    for (const r of data as { post_id: string; platform: string; status: string; settings: unknown }[]) {
      if (r.status !== "cancelled") by.set(r.post_id, [...(by.get(r.post_id) ?? []), { platform: r.platform, settings: r.settings }]);
    }
    for (const [id, ds] of by) {
      const label = postLabel(null, ds);
      if (label) out.set(id, label);
    }
  } catch {
    // no labels: those posts read "Untitled post"
  }
  return out;
}
