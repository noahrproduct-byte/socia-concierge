// When a paid service SOCIA's AI runs on says SOCIA's own balance is empty
// (Claude credits at Anthropic, the Higgsfield API balance), every customer's
// AI stops at once. Customers see "paused on SOCIA's side"; this tells the
// people who can fix it, the admins (ADMIN_EMAILS), with an alert in their
// bell that links to the spend page (/admin/spend). At most one alert per
// service per day: the alert's fingerprint carries the date, and each server
// instance also waits ten minutes between tries.
//
// Nothing here throws or slows the request that hit the empty balance.
// Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/service";
import { recordAlerts } from "./alerts";

export type PaidProvider = "anthropic" | "higgsfield";

export const PROVIDER_ALARM_COPY: Record<PaidProvider, { title: string; body: string }> = {
  anthropic: {
    title: "Claude credits ran out",
    body: "Anthropic refused a request because SOCIA's credit balance is empty, so AI features are paused for every customer. Add credits in the Anthropic Console under Billing. Turning on auto-reload there stops this from happening again.",
  },
  higgsfield: {
    title: "Higgsfield balance ran out",
    body: "Higgsfield refused a request because SOCIA's API balance is empty, so AI Studio can't make videos or images for anyone. Add funds in Higgsfield's API console under Billing, and turn on auto top-up there.",
  },
};

/** Whether a Claude API answer says the account has no credit left. Pure. */
export function isAnthropicNoCredit(status: number, body: string): boolean {
  return (status === 400 || status === 402 || status === 403) && /credit balance/i.test(body);
}

/** The alert's dedup key: one per service per day (UTC). Pure. */
export const providerAlarmFingerprint = (p: PaidProvider, now: Date) => `provider-empty:${p}:${now.toISOString().slice(0, 10)}`;

/** The admins' emails from ADMIN_EMAILS, lowercased. Pure. */
export const adminEmails = (raw = process.env.ADMIN_EMAILS ?? ""): string[] =>
  raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const lastTry = new Map<PaidProvider, number>();
const WAIT_MS = 10 * 60 * 1000;

let adminIds: { ids: string[]; at: number } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function adminUserIds(svc: SupabaseClient<any, any, any>): Promise<string[]> {
  if (adminIds && Date.now() - adminIds.at < 60 * 60 * 1000) return adminIds.ids;
  const want = new Set(adminEmails());
  if (!want.size) return [];
  const ids: string[] = [];
  // A handful of pages at most; stops as soon as every admin is found.
  for (let page = 1; page <= 10 && ids.length < want.size; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (u.email && want.has(u.email.toLowerCase())) ids.push(u.id);
    if (data.users.length < 1000) break;
  }
  adminIds = { ids, at: Date.now() };
  return ids;
}

/**
 * Tell the admins that `provider` refused work for lack of balance. Returns
 * at once; the alert is written in the background. `detail` goes to the server
 * log only (the provider's own words, which hold no secret).
 */
export function raiseProviderAlarm(provider: PaidProvider, detail?: string, now = new Date()): void {
  const prev = lastTry.get(provider);
  if (prev != null && now.getTime() - prev < WAIT_MS) return;
  lastTry.set(provider, now.getTime());
  console.error(`[provider] ${provider} balance empty${detail ? `: ${detail.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
  void (async () => {
    try {
      const svc = createServiceClient();
      if (!svc) return;
      const ids = await adminUserIds(svc);
      const copy = PROVIDER_ALARM_COPY[provider];
      for (const userId of ids) {
        await recordAlerts(svc, { userId, workspaceId: null }, [{
          type: "provider", platform: provider, fingerprint: providerAlarmFingerprint(provider, now), severity: "warning",
          title: copy.title, body: copy.body, evidence: { provider, at: now.toISOString() }, entityRef: "/admin/spend",
        }]);
      }
    } catch (e) {
      console.error("[provider] alarm not recorded:", (e as Error)?.message ?? e);
    }
  })();
}

/**
 * A fetch for the Claude client that watches answers for an empty credit
 * balance and raises the alarm. The answer itself is passed on untouched.
 */
export function watchedAnthropicFetch(inner: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const res = await inner(input, init);
    if (res.status === 400 || res.status === 402 || res.status === 403) {
      try {
        const text = await res.clone().text();
        if (isAnthropicNoCredit(res.status, text)) raiseProviderAlarm("anthropic", text);
      } catch { /* a body that can't be read is not a balance answer */ }
    }
    return res;
  };
}
