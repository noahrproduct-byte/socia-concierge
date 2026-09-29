// Alerts store: record verified events (service role, from detection) and read
// them for the in-app inbox (the owner and the workspace's members, through
// their own session under RLS). Nothing here computes an alert; detectors in
// lib/alertDetectors.ts do, and this only persists and serves them.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertCandidate } from "./alertDetectors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type Alert = {
  id: string;
  type: string;
  platform: string | null;
  severity: "good" | "info" | "warning";
  title: string;
  body: string;
  evidence: Record<string, unknown> | null;
  entityRef: string | null;
  detectedAt: string;
  readAt: string | null;
};

let enabledSince: number | null = null;

/** Whether supabase/alerts.sql has run. Sticky once seen. */
export async function alertsEnabled(supabase: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await supabase.from("alert_events").select("id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist candidate events for one workspace owner. The unique (user_id,
 * fingerprint) index means a re-run inserts only what is new; existing events
 * are left untouched (their read state is preserved). Returns how many were new.
 * Service role only (RLS has no insert policy).
 */
export async function recordAlerts(
  svc: Supa,
  owner: { userId: string; workspaceId: string | null },
  candidates: AlertCandidate[],
): Promise<number> {
  if (!candidates.length) return 0;
  const rows = candidates.map((c) => ({
    user_id: owner.userId,
    workspace_id: owner.workspaceId,
    type: c.type,
    platform: c.platform,
    fingerprint: c.fingerprint,
    severity: c.severity,
    title: c.title,
    body: c.body,
    evidence: c.evidence,
    entity_ref: c.entityRef ?? null,
  }));
  const { data, error } = await svc
    .from("alert_events")
    .upsert(rows, { onConflict: "user_id,fingerprint", ignoreDuplicates: true })
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

type Row = {
  id: string; type: string; platform: string | null; severity: Alert["severity"];
  title: string; body: string; evidence: Record<string, unknown> | null; entity_ref: string | null;
  detected_at: string; read_at: string | null;
};
const toAlert = (r: Row): Alert => ({
  id: r.id, type: r.type, platform: r.platform, severity: r.severity, title: r.title, body: r.body,
  evidence: r.evidence, entityRef: r.entity_ref, detectedAt: r.detected_at, readAt: r.read_at,
});

/** The workspace owner's alerts, newest first (dismissed ones excluded). */
export async function getAlerts(supabase: Supa, ownerId: string, limit = 20): Promise<Alert[]> {
  if (!(await alertsEnabled(supabase))) return [];
  const { data, error } = await supabase
    .from("alert_events")
    .select("id, type, platform, severity, title, body, evidence, entity_ref, detected_at, read_at")
    .eq("user_id", ownerId)
    .is("dismissed_at", null)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return ((data ?? []) as Row[]).map(toAlert);
}

/** How many of the owner's alerts are unread. null when the table isn't there. */
export async function unreadAlertCount(supabase: Supa, ownerId: string): Promise<number | null> {
  if (!(await alertsEnabled(supabase))) return null;
  const { count, error } = await supabase
    .from("alert_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId)
    .is("read_at", null)
    .is("dismissed_at", null);
  if (error) return null;
  return count ?? 0;
}

/** Mark specific alerts, or all of the owner's unread, as read. */
export async function markAlertsRead(supabase: Supa, ownerId: string, ids?: string[]): Promise<boolean> {
  let q = supabase.from("alert_events").update({ read_at: new Date().toISOString() }).eq("user_id", ownerId).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  return !error;
}

/** Remove an alert from the feed for good. */
export async function dismissAlert(supabase: Supa, ownerId: string, id: string): Promise<boolean> {
  const { error } = await supabase
    .from("alert_events")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", ownerId)
    .eq("id", id);
  return !error;
}
