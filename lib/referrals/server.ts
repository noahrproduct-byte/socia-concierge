// Invite a friend, server side: a person's code, recording who invited a new
// account, and working out what each person currently has from invitations
// (lib/referrals/core.ts holds the rules). Every write goes through the
// service role after the caller has been authenticated; the tables accept no
// writes from a signed-in browser (supabase/referrals.sql). Server only.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { activeAccounts, listConnectedAccounts } from "@/lib/entitlements";
import { NO_BONUS, PENDING_DAYS, bonusFor, canClaim, cleanCode, makeCode, type Bonus, type ReferralRow } from "./core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** The tables aren't there yet (supabase/referrals.sql not run). */
export const referralsMissing = (e: { code?: string; message?: string } | null | undefined): boolean =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /referral_|does not exist|Could not find the table/i.test(e.message ?? "")));

/** This person's invite code, made on first ask. Null when referrals aren't set up. */
export async function ensureCode(userId: string): Promise<string | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const { data, error } = await svc.from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
  if (error) return null;
  if (data?.code) return data.code as string;
  // A clash on the unique code is possible, if very unlikely: try a few.
  for (let i = 0; i < 4; i++) {
    const code = makeCode(randomBytes(8));
    const ins = await svc.from("referral_codes").insert({ user_id: userId, code }).select("code").maybeSingle();
    if (!ins.error && ins.data?.code) return ins.data.code as string;
    // Someone else's request made this person's row first: read it.
    const again = await svc.from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
    if (again.data?.code) return again.data.code as string;
  }
  return null;
}

async function rowsFor(svc: Supa, userId: string): Promise<ReferralRow[]> {
  const { data, error } = await svc.from("referrals").select("referrer_id, referred_id, created_at, qualified_at").or(`referrer_id.eq.${userId},referred_id.eq.${userId}`).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as ReferralRow[];
}

async function saveBonus(svc: Supa, userId: string, b: Bonus): Promise<void> {
  await svc.from("referral_bonuses").upsert({ user_id: userId, active: b.active, until: b.until, pending: b.pending, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/**
 * Brings one person's invitations up to date: an invitation whose friend has
 * since connected a social account starts counting, and the saved bonus of
 * everyone involved is worked out again. Safe to call often; does nothing
 * when there is nothing waiting. Never throws.
 */
export async function refreshReferrals(userId: string, now: Date = new Date()): Promise<Bonus> {
  const svc = createServiceClient();
  if (!svc) return NO_BONUS;
  try {
    let rows = await rowsFor(svc, userId);
    const waiting = rows.filter((r) => !r.qualified_at && now.getTime() - new Date(r.created_at).getTime() < PENDING_DAYS * 86_400_000).slice(0, 20);
    const touched = new Set<string>();
    for (const r of waiting) {
      const accounts = await listConnectedAccounts(svc, r.referred_id).catch(() => []);
      if (!activeAccounts(accounts).length) continue;
      const { error } = await svc.from("referrals").update({ qualified_at: now.toISOString() }).eq("referred_id", r.referred_id).is("qualified_at", null);
      if (!error) { touched.add(r.referrer_id); touched.add(r.referred_id); }
    }
    if (touched.size) rows = await rowsFor(svc, userId);
    const mine = bonusFor(rows, userId, now);
    await saveBonus(svc, userId, mine);
    // The other person in each invitation that just started counting.
    for (const other of touched) {
      if (other === userId) continue;
      await saveBonus(svc, other, bonusFor(await rowsFor(svc, other), other, now));
    }
    return mine;
  } catch (e) {
    if (!referralsMissing(e as { code?: string; message?: string })) console.error("[referrals] refresh failed:", (e as Error)?.message ?? e);
    return NO_BONUS;
  }
}

export type ClaimResult = { ok: true } | { ok: false; reason: "off" | "bad_code" | "own_code" | "too_late" | "already" };

/**
 * Records that `userId` (a new account) was invited by the owner of `code`.
 * Only within the first days of the account, once, and never for a person's
 * own code. Both people are marked as having an invitation waiting.
 */
export async function claimReferral(userId: string, createdAt: string | null | undefined, rawCode: unknown, now: Date = new Date()): Promise<ClaimResult> {
  const svc = createServiceClient();
  const code = cleanCode(rawCode);
  if (!svc) return { ok: false, reason: "off" };
  if (!code) return { ok: false, reason: "bad_code" };
  if (!canClaim(createdAt, now)) return { ok: false, reason: "too_late" };
  const owner = await svc.from("referral_codes").select("user_id").eq("code", code).maybeSingle();
  if (owner.error) return { ok: false, reason: referralsMissing(owner.error) ? "off" : "bad_code" };
  const referrerId = owner.data?.user_id as string | undefined;
  if (!referrerId) return { ok: false, reason: "bad_code" };
  if (referrerId === userId) return { ok: false, reason: "own_code" };
  // The primary key on referred_id makes this once per person, whatever races.
  const ins = await svc.from("referrals").insert({ referred_id: userId, referrer_id: referrerId });
  if (ins.error) return { ok: false, reason: "already" };
  await Promise.all([refreshReferrals(userId, now), refreshReferrals(referrerId, now)]);
  return { ok: true };
}

/** The saved bonus for a person, read with whatever client the caller has. Null when there is none or it can't be read. */
export async function readBonus(supabase: Supa, userId: string): Promise<Bonus | null> {
  try {
    const { data, error } = await supabase.from("referral_bonuses").select("active, until, pending").eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    return { active: Number(data.active) || 0, until: (data.until as string | null) ?? null, pending: data.pending === true };
  } catch {
    return null;
  }
}

/** What a person sees about their invitations. */
export async function referralStatus(userId: string, now: Date = new Date()): Promise<{ code: string | null; invited: number; counting: number; waiting: number; bonus: Bonus }> {
  const svc = createServiceClient();
  const code = await ensureCode(userId);
  if (!svc || !code) return { code: null, invited: 0, counting: 0, waiting: 0, bonus: NO_BONUS };
  const bonus = await refreshReferrals(userId, now);
  const rows = (await rowsFor(svc, userId).catch(() => [])).filter((r) => r.referrer_id === userId);
  return { code, invited: rows.length, counting: rows.filter((r) => r.qualified_at).length, waiting: rows.filter((r) => !r.qualified_at).length, bonus };
}
