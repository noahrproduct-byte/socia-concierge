// SOCIA's own Instagram research connection.
//
// Business Discovery (lib/igBusinessDiscovery.ts) only answers when the request
// comes from an Instagram Professional account linked to a Facebook Page. Most
// customers have neither, so SOCIA asks with its own: a Facebook connection,
// made through the normal Facebook flow, whose Page is linked to SOCIA's
// Instagram account. The token is stored, refreshed and revoked like any other
// connection.
//
// Which connection it is:
// - SOCIA_RESEARCH_IG_USERNAME: the linked Instagram account's username
//   (e.g. socia.appmedia). Only someone who manages that account can connect it.
// - SOCIA_RESEARCH_USER_ID: the SOCIA user who connected it.
// Either is enough; with both, a connection must match both. That matters when
// the owner also has other Pages connected (their clients' brands): the
// username keeps those from ever being used for research.
//
// What this reads is public data about other public Business and Creator
// accounts. Results are still cached per customer (ig_competitor_snapshots is
// keyed by user_id), so one customer's research is never served to another.
//
// Server only: the token never leaves the server.

import { createServiceClient } from "@/lib/supabase/service";

export type ResearchConnection = { igUserId: string; pageToken: string };

const TTL_MS = 5 * 60 * 1000;
let memo: { at: number; value: ResearchConnection | null } | null = null;

const settings = () => ({
  userId: process.env.SOCIA_RESEARCH_USER_ID?.trim() || null,
  username: process.env.SOCIA_RESEARCH_IG_USERNAME?.trim().replace(/^@/, "").toLowerCase() || null,
});

/** Whether a research account is configured at all (the token may still be unusable). */
export const researchConfigured = (): boolean => {
  const s = settings();
  return Boolean(s.userId || s.username);
};

type Row = { user_id?: string; ig_business_id?: string | null; ig_business_username?: string | null; access_token?: string | null; connection_status?: string | null };

/** The research account's Page token and Instagram id, or null when it is not set up or not connected. */
export async function researchConnection(): Promise<ResearchConnection | null> {
  const { userId, username } = settings();
  if (!userId && !username) return null;
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;

  let value: ResearchConnection | null = null;
  const row = (await researchRows()).find((r) => r.connection_status === "connected" && r.ig_business_id && r.access_token);
  if (row) value = { igUserId: row.ig_business_id!, pageToken: row.access_token! };
  memo = { at: Date.now(), value };
  return value;
}

/**
 * The research account's Facebook connection rows (several when its owner
 * connected the Page in more than one workspace), with any extra columns a
 * caller needs; [] when it is not configured. Server only.
 */
export async function researchRows<T extends Row = Row>(extraCols = ""): Promise<T[]> {
  const { userId, username } = settings();
  if (!userId && !username) return [];
  const svc = createServiceClient();
  if (!svc) return [];
  try {
    // Narrowed to the research account below: by its SOCIA user_id, its Instagram username, or both.
    let q = svc.from("facebook_connections").select(`user_id, ig_business_id, ig_business_username, access_token, connection_status${extraCols ? `, ${extraCols}` : ""}`);
    if (userId) q = q.eq("user_id", userId);
    if (username) q = q.ilike("ig_business_username", username);
    const { data } = await q.limit(20);
    return ((data ?? []) as unknown as T[]).filter((r) => !username || (r.ig_business_username ?? "").toLowerCase() === username);
  } catch {
    return [];
  }
}

/** Test seam. */
export function resetResearchMemo(): void {
  memo = null;
}
