// What Ask SOCIA may schedule or move for the active Brand Workspace: drafts
// (newest first) and posts scheduled for later. A post already published, or
// one a platform is holding (a YouTube video uploaded with its own publish
// time, an upload in flight), is listed as fixed with the reason. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { scopeToWorkspace } from "@/lib/workspaces";
import { postLabel, type LabelSource } from "@/lib/publishing/postLabel";
import type { CalendarPost } from "@/lib/studioClips/distribute";

export type Schedulable = {
  /** the [S#] number shown to the model */
  n: number;
  id: string;
  title: string;
  status: "draft" | "scheduled";
  at: string | null;
  createdAt: string;
  platforms: string[];
  legacy: boolean;
  /** why it can't be moved from Ask SOCIA, or null */
  fixed: string | null;
};

const MAX = 40;
const HORIZON_DAYS = 62;

type PostRow = { id: string; caption: string | null; status: string; scheduled_at: string | null; created_at: string };
type DestRow = { post_id: string; platform: string; status: string; external_post_id: string | null; settings: unknown };

export async function loadSchedulable(client: SupabaseClient, ownerId: string, wsId: string | null, now = new Date()): Promise<{ posts: Schedulable[]; others: CalendarPost[] }> {
  const until = new Date(now.getTime() + HORIZON_DAYS * 86400_000).toISOString();
  const [drafts, upcoming] = await Promise.all([
    scopeToWorkspace(client.from("scheduled_posts").select("id, caption, status, scheduled_at, created_at").eq("user_id", ownerId).eq("status", "draft"), wsId)
      .order("created_at", { ascending: false }).limit(MAX),
    scopeToWorkspace(client.from("scheduled_posts").select("id, caption, status, scheduled_at, created_at").eq("user_id", ownerId).in("status", ["scheduled", "publishing"]), wsId)
      .gte("scheduled_at", now.toISOString()).lte("scheduled_at", until).order("scheduled_at", { ascending: true }).limit(100),
  ]);
  const rows = [...((drafts.data ?? []) as PostRow[]), ...((upcoming.data ?? []) as PostRow[])];
  const ids = rows.map((r) => r.id);
  const dests = new Map<string, DestRow[]>();
  if (ids.length) {
    const { data } = await client.from("post_destinations").select("post_id, platform, status, external_post_id, settings").eq("user_id", ownerId).in("post_id", ids);
    for (const d of (data ?? []) as DestRow[]) if (d.status !== "cancelled") dests.set(d.post_id, [...(dests.get(d.post_id) ?? []), d]);
  }
  const posts: Schedulable[] = [];
  const others: CalendarPost[] = [];
  for (const r of rows) {
    const ds = dests.get(r.id) ?? [];
    const title = postLabel(r.caption, ds.map<LabelSource>((d) => ({ platform: d.platform, settings: d.settings }))) ?? "Untitled post";
    const short = title.length > 60 ? `${title.slice(0, 59)}…` : title;
    const fixed = r.status === "publishing" || ds.some((d) => d.status === "uploading" || d.status === "processing" || d.status === "publishing")
      ? "It's being published right now."
      : ds.some((d) => d.status !== "published" && d.external_post_id)
        ? "YouTube already holds it with its own publish time; change that in Create Post."
        : ds.some((d) => d.status === "published")
          ? "Part of it has already been published."
          : null;
    if (posts.length < MAX) {
      posts.push({ n: posts.length + 1, id: r.id, title: short, status: r.status === "draft" ? "draft" : "scheduled", at: r.status === "draft" ? null : r.scheduled_at, createdAt: r.created_at, platforms: Array.from(new Set(ds.map((d) => d.platform))), legacy: ds.length === 0, fixed });
    }
    if (r.status !== "draft" && r.scheduled_at) others.push({ id: r.id, at: r.scheduled_at, label: short });
  }
  return { posts, others };
}

/** The evidence block the model reads: one line per post, numbered [S#]. */
export function schedulableBlock(posts: Schedulable[], tz: string): string {
  if (!posts.length) return "No drafts and nothing scheduled for later.";
  const when = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  return posts.map((p) => `[S${p.n}] ${p.status === "draft" ? `draft, made ${when(p.createdAt)}` : `scheduled for ${when(p.at!)}`}: "${p.title}"${p.platforms.length ? ` (${p.platforms.join(", ")})` : ""}${p.fixed ? `. Can't be moved: ${p.fixed}` : ""}`).join("\n");
}
