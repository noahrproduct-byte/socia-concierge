// Product events for SOCIA's own understanding of conversion: which plan
// structure people hit limits on, where they click upgrade, when audits finish.
// No third-party vendor; rows land in product_events and are queried in SQL.
// Best-effort: never throws, never blocks the request that emitted it.

import { createServiceClient } from "./supabase/service";

export type ProductEventName =
  | "free_audit_completed"
  | "pricing_viewed"
  | "upgrade_clicked"
  | "checkout_started"
  | "subscription_started"
  | "subscription_upgraded"
  | "subscription_downgraded"
  | "subscription_cancelled"
  | "usage_limit_reached"
  | "feature_locked"
  | "account_limit_reached"
  | "competitor_limit_reached"
  | "plan_keep_chosen";

export const PRODUCT_EVENT_NAMES: ProductEventName[] = [
  "free_audit_completed", "pricing_viewed", "upgrade_clicked", "checkout_started", "subscription_started",
  "subscription_upgraded", "subscription_downgraded", "subscription_cancelled", "usage_limit_reached",
  "feature_locked", "account_limit_reached", "competitor_limit_reached", "plan_keep_chosen",
];

export function isProductEventName(v: unknown): v is ProductEventName {
  return typeof v === "string" && (PRODUCT_EVENT_NAMES as string[]).includes(v);
}

/**
 * The only events a browser may report. Everything else (limits reached,
 * subscription lifecycle, audits) is emitted by the server, so a client cannot
 * forge conversion data.
 */
export const CLIENT_EVENT_NAMES = ["upgrade_clicked"] as const satisfies readonly ProductEventName[];

export function isClientEventName(v: unknown): v is (typeof CLIENT_EVENT_NAMES)[number] {
  return typeof v === "string" && (CLIENT_EVENT_NAMES as readonly string[]).includes(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/**
 * Insert one event for a signed-in user. Anonymous events are dropped.
 * Writes go through the service-role client: product_events has no browser
 * insert policy, so a session cannot forge limit or subscription events by
 * inserting rows directly. The user client is only a fallback for local
 * setups without a service key (the insert then simply fails, silently).
 */
export async function trackEvent(
  supabase: Supa,
  userId: string | null | undefined,
  name: ProductEventName,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  try {
    const client = createServiceClient() ?? supabase;
    await client.from("product_events").insert({ user_id: userId, name, props: props ?? null });
  } catch {
    /* the table may not exist yet; analytics must never break the product */
  }
}
