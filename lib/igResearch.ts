// SOCIA's own Instagram research connection.
//
// Business Discovery (lib/igBusinessDiscovery.ts) only answers when the request
// comes from an Instagram Professional account linked to a Facebook Page. Most
// customers have neither, so SOCIA asks with its own: the Facebook connection
// of one SOCIA-owned account, named by SOCIA_RESEARCH_USER_ID (that account's
// SOCIA user id). Its owner connects it through the normal Facebook flow, so
// the token is stored, refreshed and revoked like any other connection.
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

/** Whether a research account is configured at all (the token may still be unusable). */
export const researchConfigured = (): boolean => Boolean(process.env.SOCIA_RESEARCH_USER_ID?.trim());

/** The research account's Page token and Instagram id, or null when it is not set up or not connected. */
export async function researchConnection(): Promise<ResearchConnection | null> {
  const userId = process.env.SOCIA_RESEARCH_USER_ID?.trim();
  if (!userId) return null;
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;

  let value: ResearchConnection | null = null;
  const svc = createServiceClient();
  if (svc) {
    try {
      const { data } = await svc
        .from("facebook_connections")
        .select("ig_business_id, access_token, connection_status")
        .eq("user_id", userId)
        .limit(20);
      const row = (data ?? []).find(
        (r: { ig_business_id?: string | null; access_token?: string | null; connection_status?: string | null }) =>
          r.connection_status === "connected" && r.ig_business_id && r.access_token,
      ) as { ig_business_id: string; access_token: string } | undefined;
      if (row) value = { igUserId: row.ig_business_id, pageToken: row.access_token };
    } catch {
      /* treated as not configured */
    }
  }
  memo = { at: Date.now(), value };
  return value;
}

/** Test seam. */
export function resetResearchMemo(): void {
  memo = null;
}
