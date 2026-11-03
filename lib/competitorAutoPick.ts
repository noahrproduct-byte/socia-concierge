// SOCIA picks competitors for the customer.
//
// After a discovery run (app/api/competitors/intel), the Instagram accounts it
// found are checked through Business Discovery: the customer's own Page, or
// SOCIA's research account (lib/igResearch.ts). Only real, public Business or
// Creator accounts that Instagram returned numbers for qualify. The best of
// them fill the customer's EMPTY roster slots, never more than PICKS_PER_RUN at
// once, and never beyond the plan's competitor limit.
//
// When no Instagram check is possible (no Page of their own and SOCIA's research
// account not connected), SOCIA still adds what web research found, at most
// UNVERIFIED_PICKS, marked as unchecked. No number is ever shown for those
// until Instagram returns one; the roster renders "—" with its reason.
//
// Rules that keep this honest and in the customer's control:
// - An account the customer removed is never picked again (competitor_dismissals).
//   Without that table (supabase/competitor-autopick.sql not run yet) nothing is
//   picked at all, because a removal could not be respected.
// - Their own accounts never qualify (lib/ownAccounts.ts, applied upstream too).
// - Every pick says why, from what discovery found and what Instagram returned.
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntitlements, getLimit, countActiveCompetitors } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { igCompetitorRows, type IgCompetitor } from "@/lib/igCompetitorData";
import { isOwnAccount, type OwnAccounts } from "@/lib/ownAccounts";
import type { ScoredAccount, Classification } from "@/lib/discovery";
import { fmtRate } from "@/lib/competitorRollup";

/** At most this many competitors are added by one run. */
export const PICKS_PER_RUN = 5;
/** Below this, an account is too small to learn much from. */
export const MIN_FOLLOWERS = 100;
/** Candidates checked against Instagram per run (each is one Business Discovery call). */
const MAX_CHECKS = 8;
/** Picks per run when Instagram can't confirm anything: fewer, since nothing was checked. */
export const UNVERIFIED_PICKS = 3;

// Closest rivals first; pure inspiration last.
const CLASS_RANK: Record<Classification, number> = {
  direct_competitor: 0,
  local_competitor: 1,
  niche_leader: 2,
  adjacent_competitor: 3,
  emerging_creator: 4,
  content_inspiration: 5,
};

export type Pick = { handle: string; reason: string };

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

/** The reason shown for a pick: why discovery found it, plus what Instagram reported. */
export function pickReason(candidate: ScoredAccount, verified: IgCompetitor): string {
  const facts = [
    verified.followers != null ? `${fmt(verified.followers)} followers` : null,
    verified.engagementRate != null ? `${fmtRate(verified.engagementRate)} engagement` : null,
  ].filter(Boolean).join(", ");
  return joinReason(whyOf(candidate), facts);
}

/** "why. facts", without a full stop after a cut reason's "…". */
const joinReason = (why: string, rest: string): string =>
  [why, rest].filter(Boolean).reduce((a, b) => (a ? `${a}${a.endsWith("…") ? " " : ". "}${b}` : b), "");

/** A rate under 0.1% reads as "under 0.1%", never "0.0%", which looks like none (lib/competitorRollup). */
export { fmtRate };

/** Discovery's reason, cut at a word so the facts after it always show. */
const WHY_MAX = 180;
function whyOf(c: ScoredAccount): string {
  const why = (c.note ?? c.relevanceReasons[0] ?? "").trim().replace(/\.$/, "");
  if (why.length <= WHY_MAX) return why;
  const cut = why.slice(0, WHY_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[,;:]$/, "")}…`;
}

/**
 * Pure choice: which verified candidates fill the free slots. `candidates` are
 * discovery's Instagram accounts, `verified` what Business Discovery returned
 * for them (keyed by lowercase handle).
 */
export function choosePicks(
  candidates: ScoredAccount[],
  verified: Map<string, IgCompetitor>,
  freeSlots: number,
): Pick[] {
  if (freeSlots <= 0) return [];
  return candidates
    .filter((c) => c.handle)
    .map((c) => ({ c, v: verified.get(c.handle!.toLowerCase()) }))
    .filter((x): x is { c: ScoredAccount; v: IgCompetitor } => Boolean(x.v?.found && x.v.followers != null && x.v.followers >= MIN_FOLLOWERS))
    .sort(
      (a, b) =>
        (CLASS_RANK[a.c.classification] ?? 9) - (CLASS_RANK[b.c.classification] ?? 9) ||
        b.c.relevanceScore - a.c.relevanceScore ||
        (b.v.engagementRate ?? -1) - (a.v.engagementRate ?? -1),
    )
    .slice(0, Math.min(freeSlots, PICKS_PER_RUN))
    .map(({ c, v }) => ({ handle: v.handle.toLowerCase(), reason: pickReason(c, v) }));
}

/**
 * Pure choice when Instagram can't confirm anything: web research's Instagram
 * finds, closest rivals first, each saying it was not checked.
 */
export function chooseUnverifiedPicks(candidates: ScoredAccount[], freeSlots: number): Pick[] {
  if (freeSlots <= 0) return [];
  return candidates
    .filter((c) => c.handle && c.dataSource === "web_research")
    .sort((a, b) => (CLASS_RANK[a.classification] ?? 9) - (CLASS_RANK[b.classification] ?? 9) || b.relevanceScore - a.relevanceScore)
    .slice(0, Math.min(freeSlots, UNVERIFIED_PICKS))
    .map((c) => ({
      handle: c.handle!.toLowerCase(),
      reason: joinReason(whyOf(c), "Found by web research; Instagram has not confirmed its numbers yet"),
    }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** Handles the customer removed from this workspace's roster; null when the table is missing. */
async function dismissedHandles(svc: SupabaseClient, ownerId: string, wsId: string | null): Promise<Set<string> | null> {
  let q = svc.from("competitor_dismissals").select("handle").eq("user_id", ownerId).eq("platform", "instagram");
  q = wsId ? q.eq("workspace_id", wsId) : q.is("workspace_id", null);
  const { data, error } = await q;
  if (error) return null;
  return new Set((data ?? []).map((r: { handle: string }) => r.handle.toLowerCase()));
}

/**
 * Fill empty roster slots with verified competitors. Best effort: any failure
 * leaves the roster as it was. Returns what was added.
 */
export async function autoPickCompetitors(opts: {
  client: Supa;
  ownerId: string;
  wsId: string | null;
  accounts: ScoredAccount[];
  own: OwnAccounts;
}): Promise<Pick[]> {
  const { client, ownerId, wsId, accounts, own } = opts;
  const svc = createServiceClient();
  if (!svc) return [];
  try {
    const dismissed = await dismissedHandles(svc, ownerId, wsId);
    if (!dismissed) return [];

    const ent = await getEntitlements(client, ownerId);
    const limit = getLimit(ent, "competitors");
    const active = await countActiveCompetitors(client, ownerId);
    if (active == null) return [];
    const free = Math.min(limit - active, PICKS_PER_RUN);
    if (free <= 0) return [];

    const tracked = await listTracked<{ handle: string }>(client, ownerId, "handle", { platform: "instagram", workspaceId: wsId });
    const taken = new Set(tracked.map((t) => t.handle.toLowerCase()));

    const candidates = accounts
      .filter((a) => a.platform === "instagram" && a.handle)
      .filter((a) => !taken.has(a.handle!.toLowerCase()) && !dismissed.has(a.handle!.toLowerCase()))
      .filter((a) => !isOwnAccount(own, { handle: a.handle, name: a.displayName }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, MAX_CHECKS);
    if (!candidates.length) return [];

    const res = await igCompetitorRows(client, ownerId, candidates.map((c) => c.handle!));
    const picks = res.enabled
      ? choosePicks(candidates, new Map(res.competitors.map((c) => [c.handle.toLowerCase(), c])), free)
      : chooseUnverifiedPicks(candidates, free);

    const added: Pick[] = [];
    for (const p of picks) {
      // The same privileged add the Track button uses: cap check and insert in
      // one call, so a pick can never exceed the plan limit.
      const { data, error } = await svc.rpc("socia_add_competitor", wsId
        ? { p_user: ownerId, p_workspace: wsId, p_platform: "instagram", p_handle: p.handle, p_limit: limit }
        : { p_user: ownerId, p_platform: "instagram", p_handle: p.handle, p_limit: limit });
      if (error) break;
      const row = (Array.isArray(data) ? data[0] : data) as { added?: boolean } | null;
      if (!row?.added) break; // full, or a race: stop rather than guess
      let mark = svc.from("tracked_competitors").update({ added_by: "socia", pick_reason: p.reason })
        .eq("user_id", ownerId).eq("platform", "instagram").eq("handle", p.handle);
      if (wsId) mark = mark.eq("workspace_id", wsId);
      await mark;
      added.push(p);
    }
    return added;
  } catch {
    return [];
  }
}
