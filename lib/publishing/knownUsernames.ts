// Remembering the Instagram usernames a brand uses in SOCIA, and looking one
// up with Instagram (Business Discovery, through a linked Facebook Page).
// Server only. A missing table (supabase/known-usernames.sql not run yet)
// makes remembering a no-op, never an error for the person.
import type { SupabaseClient } from "@supabase/supabase-js";
import { igConnection } from "@/lib/igCompetitorData";
import { businessDiscovery, IG_DISCOVERY_REASON, type IgDiscoveryResult } from "@/lib/igBusinessDiscovery";
import { normalizeUsername, IG_USERNAME_RE } from "./igRules";
import type { LookupAccount, LookupResult } from "./people";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const scopeKey = (workspaceId: string | null | undefined): string => workspaceId || "owner";

type Row = { id: string; uses: number };

/** Count one more use of `username` for this brand; store what the lookup found, when given. */
export async function rememberUsername(client: Supa, ownerId: string, scope: string, raw: string, found?: LookupAccount | null): Promise<boolean> {
  const username = normalizeUsername(raw);
  if (!IG_USERNAME_RE.test(username)) return false;
  const now = new Date().toISOString();
  const lookup = found ? { lookup_status: "found", name: found.name, avatar: found.avatar, followers: found.followers, looked_up_at: now } : {};
  try {
    const { data, error } = await client.from("ig_known_people").select("id, uses").eq("user_id", ownerId).eq("scope", scope).eq("username", username).limit(1);
    if (error) throw error;
    const row = ((data ?? []) as Row[])[0];
    const res = row
      ? await client.from("ig_known_people").update({ uses: row.uses + 1, last_used_at: now, ...lookup }).eq("id", row.id)
      : await client.from("ig_known_people").insert({ user_id: ownerId, scope, username, uses: 1, last_used_at: now, ...lookup });
    if (res.error) throw res.error;
    return true;
  } catch (e) {
    console.error("[known-usernames] not remembered:", (e as Error)?.message ?? e);
    return false;
  }
}

export type KnownRow = { username: string; uses: number; name: string | null; avatar: string | null };

export async function readKnown(client: Supa, ownerId: string, scope: string): Promise<KnownRow[]> {
  try {
    const { data, error } = await client.from("ig_known_people").select("username, uses, name, avatar").eq("user_id", ownerId).eq("scope", scope).order("last_used_at", { ascending: false }).limit(300);
    if (error) throw error;
    return (data ?? []) as KnownRow[];
  } catch {
    return [];
  }
}

/** Business Discovery's answer as the composer shows it. Pure, unit-tested. */
export function lookupFromDiscovery(r: IgDiscoveryResult): LookupResult {
  if (r.ok) {
    const a = r.account;
    return { available: true, status: "found", account: { username: a.username.toLowerCase(), name: a.name, avatar: a.profilePicture, followers: a.followers } };
  }
  if (r.reason === "not_found") return { available: true, status: "not_found" };
  if (r.reason === "not_business") return { available: true, status: "not_business" };
  if (r.reason === "no_permission" || r.reason === "not_connected") return { available: false, reason: IG_DISCOVERY_REASON[r.reason] };
  return { available: true, status: "failed" };
}

const NO_PAGE = "Link a Facebook Page in Settings to confirm usernames with Instagram.";
const cache = new Map<string, { at: number; r: LookupResult }>();
const TTL_MS = 10 * 60_000;

/** Look one exact username up with Instagram, through the owner's linked Facebook Page. */
export async function lookupUsername(client: Supa, ownerId: string, raw: string): Promise<LookupResult> {
  const username = normalizeUsername(raw);
  if (!IG_USERNAME_RE.test(username)) return { available: true, status: "not_found" };
  const key = `${ownerId}:${username}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.r;
  const conn = await igConnection(client, ownerId);
  if (!conn) return { available: false, reason: NO_PAGE };
  const r = lookupFromDiscovery(await businessDiscovery(conn.igUserId, conn.pageToken, username, 0));
  if (r.available && r.status !== "failed") cache.set(key, { at: Date.now(), r });
  if (cache.size > 2000) cache.clear();
  return r;
}
