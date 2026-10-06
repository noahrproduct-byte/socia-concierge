// The accounts SOCIA already knows for a brand, for username suggestions:
// its own connected Instagram accounts, people it collaborated with or tagged
// in past posts, accounts @mentioned in its captions, the competitors it
// tracks, and people who comment on its posts. Nothing is searched on
// Instagram (there is no API for that). Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIgSnapshot } from "@/lib/instagramSync";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId, scopeToWorkspace } from "@/lib/workspaces";
import { mergePeople, mentionsIn, type Person, type PersonSource } from "./people";
import { readKnown, scopeKey } from "./knownUsernames";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

type Entry = { username: string; name: string | null; avatar: string | null; source: PersonSource; count?: number; accountId?: string | null };

const settle = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

export async function knownPeople(client: Supa, opts: { ownerId: string; workspaceId: string | null; isOwner: boolean }): Promise<Person[]> {
  const { ownerId, workspaceId, isOwner } = opts;
  const entries: Entry[] = [];

  const [conns, dests, snap, tracked, comments, known] = await Promise.all([
    // The brand's own accounts. An invited team member sees only the active workspace's.
    settle(
      (isOwner
        ? client.from("instagram_connections").select("ig_user_id, username, profile").eq("user_id", ownerId)
        : scopeToWorkspace(client.from("instagram_connections").select("ig_user_id, username, profile").eq("user_id", ownerId), workspaceId)
      ).then((r: { data: unknown }) => (r.data ?? []) as { ig_user_id: string; username: string | null; profile: { profile_picture_url?: string; name?: string } | null }[]),
      [],
    ),
    // Collaborators and tagged people from past Instagram posts of this workspace.
    settle(
      scopeToWorkspace(client.from("post_destinations").select("settings").eq("user_id", ownerId).eq("platform", "instagram"), workspaceId)
        .order("created_at", { ascending: false }).limit(300)
        .then((r: { data: unknown }) => (r.data ?? []) as { settings: { collaborators?: string[]; userTags?: { username: string }[] } | null }[]),
      [],
    ),
    settle(getIgSnapshot(client, ownerId, workspaceId), null),
    settle(
      competitorScopeId(client, workspaceId).then((scope) => listTracked<{ handle: string }>(client, ownerId, "handle", { platform: "instagram", workspaceId: scope })),
      [] as { handle: string }[],
    ),
    settle(
      scopeToWorkspace(client.from("comment_drafts").select("author").eq("user_id", ownerId).eq("platform", "instagram").not("author", "is", null), workspaceId)
        .order("created_at", { ascending: false }).limit(400)
        .then((r: { data: unknown }) => (r.data ?? []) as { author: string | null }[]),
      [],
    ),
    // Every username added in SOCIA for this brand, remembered at the moment it was added.
    readKnown(client, ownerId, scopeKey(workspaceId)),
  ]);

  for (const k of known) entries.push({ username: k.username, name: k.name, avatar: k.avatar, source: "used", count: k.uses });

  for (const c of conns) {
    if (c.username) entries.push({ username: c.username, name: c.profile?.name ?? null, avatar: c.profile?.profile_picture_url ?? null, source: "your_account", accountId: c.ig_user_id });
  }
  for (const d of dests) {
    for (const u of d.settings?.collaborators ?? []) entries.push({ username: u, name: null, avatar: null, source: "collaborated" });
    for (const t of d.settings?.userTags ?? []) if (t?.username) entries.push({ username: t.username, name: null, avatar: null, source: "tagged" });
  }
  for (const m of snap?.media ?? []) for (const u of mentionsIn(m.caption)) entries.push({ username: u, name: null, avatar: null, source: "mentioned" });
  for (const c of comments) if (c.author) entries.push({ username: c.author, name: null, avatar: null, source: "commented" });

  if (tracked.length) {
    const handles = tracked.map((t) => t.handle.replace(/^@/, "").toLowerCase());
    const snaps = await settle(
      client.from("ig_competitor_snapshots").select("handle, display_name, profile_picture").eq("user_id", ownerId).in("handle", handles)
        .then((r: { data: unknown }) => (r.data ?? []) as { handle: string; display_name: string | null; profile_picture: string | null }[]),
      [],
    );
    const info = new Map(snaps.map((s) => [s.handle.toLowerCase(), s]));
    for (const h of handles) entries.push({ username: h, name: info.get(h)?.display_name ?? null, avatar: info.get(h)?.profile_picture ?? null, source: "competitor" });
  }

  return mergePeople(entries).slice(0, 500);
}
