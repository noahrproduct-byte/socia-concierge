// Server side of the intelligence profile (lib/intel/profile.ts): read it,
// rebuild it only when what it rests on changed, save it, and hand every
// feature the same niche read and competitor lists. Server only.
//
// Before this, seven places read the niche on their own (plans and the rater
// live on every request; the Dashboard, Ask SOCIA, the strategy, animated fit
// and the clipper from stored data), and three queried the discovered
// accounts and posts separately, so the same brand could see different
// things on different pages and pay for the same platform reads repeatedly.

import { loadCachedNicheRead, loadNicheRead, type NicheRead } from "../trendSignalsLoad";
import { listTracked } from "../trackedCompetitors";
import { nicheVetted } from "../discovery";
import { scopeToWorkspace } from "../workspaces";
import {
  PROFILE_VERSION, profileKey, profileServes, sameInputs, storableNiche, LIVE_FRESH_MS,
  type DiscoveredAccountRow, type DiscoveredContentRow, type IntelProfile, type NeedNiche, type ProfileInputs,
} from "./profile";
import { brandDetailFor, pinsOf, rankRoster } from "./rankLoad";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

type Where = { client: Supa; ownerId: string; scopeId: string | null };

const ACCOUNT_COLS = "platform, platform_account_id, handle, display_name, followers, location, category, classification, relevance_score, data_source, relevance_reasons";
const CONTENT_COLS = "platform, account_name, account_handle, title, content_url, thumbnail_url, views, likes, comments, multiplier, trend_tags, why_recommended, published_at, content_type, data_source, relevance_reasons";

export async function readProfile(w: Where): Promise<IntelProfile | null> {
  try {
    const { data } = await w.client.from("niche_trends").select("data").eq("niche", profileKey(w.ownerId, w.scopeId)).maybeSingle();
    const p = (data as { data?: IntelProfile } | null)?.data ?? null;
    return p?.v === PROFILE_VERSION ? p : null;
  } catch { return null; }
}

async function saveProfile(w: Where, p: IntelProfile): Promise<void> {
  try {
    await w.client.from("niche_trends").upsert({ niche: profileKey(w.ownerId, w.scopeId), data: p, updated_at: p.builtAt }, { onConflict: "niche" });
  } catch { /* the profile is a cache: a failed save only means the next request rebuilds it */ }
}

/** What the profile rests on right now: cheap reads, no platform calls. */
export async function profileInputs(w: Where, location: string | null): Promise<ProfileInputs> {
  const [tracked, run, detail] = await Promise.all([
    listTracked<{ platform: string; handle: string }>(w.client, w.ownerId, "platform, handle", { workspaceId: w.scopeId }).catch(() => []),
    (async () => {
      try {
        let q = w.client.from("discovery_runs").select("ran_at").eq("user_id", w.ownerId);
        if (w.scopeId) q = q.eq("workspace_id", w.scopeId);
        return ((await q.maybeSingle()).data?.ran_at as string | null) ?? null;
      } catch { return null; }
    })(),
    brandDetailFor(w.client, w.ownerId, w.scopeId),
  ]);
  const handles = [...new Set(tracked.filter((t) => t.platform === "instagram").map((t) => t.handle.replace(/^@/, "").toLowerCase()))];
  let igReadAt: string | null = null;
  if (handles.length) {
    try {
      const { data } = await w.client.from("ig_competitor_snapshots").select("fetched_at").eq("user_id", w.ownerId).in("handle", handles).order("fetched_at", { ascending: false }).limit(1);
      igReadAt = ((data ?? [])[0] as { fetched_at?: string } | undefined)?.fetched_at ?? null;
    } catch { /* none */ }
  }
  return { tracked: tracked.map((t) => `${t.platform}:${t.handle.toLowerCase()}`).sort(), discoveryAt: run, igReadAt, location: location?.trim() || null, pins: pinsOf(detail).sort() };
}

async function discovered(w: Where): Promise<{ accounts: DiscoveredAccountRow[]; content: DiscoveredContentRow[] }> {
  const [a, c] = await Promise.all([
    (async () => {
      try {
        const { data } = await scopeToWorkspace(w.client.from("discovered_accounts").select(ACCOUNT_COLS).eq("user_id", w.ownerId), w.scopeId)
          .order("relevance_score", { ascending: false, nullsFirst: false }).limit(48);
        return ((data ?? []) as DiscoveredAccountRow[]).filter(nicheVetted).slice(0, 24);
      } catch { return []; }
    })(),
    (async () => {
      try {
        const { data } = await scopeToWorkspace(w.client.from("discovered_content").select(CONTENT_COLS).eq("user_id", w.ownerId), w.scopeId)
          .order("multiplier", { ascending: false, nullsFirst: false }).limit(120);
        return ((data ?? []) as DiscoveredContentRow[]).filter(nicheVetted).slice(0, 60);
      } catch { return []; }
    })(),
  ]);
  return { accounts: a, content: c };
}

// One build per brand at a time on this server: two requests asking together share it.
const inflight = new Map<string, Promise<IntelProfile>>();

async function build(w: Where, need: NeedNiche, location: string | null, inputs: ProfileInputs, prev: IntelProfile | null, now: Date): Promise<IntelProfile> {
  // The ranking first (saved numbers only, no platform call): the niche read studies the best-ranked accounts.
  const roster = await rankRoster({ client: w.client, ownerId: w.ownerId, scopeId: w.scopeId, now }).catch(() => []);
  const [lists, read] = await Promise.all([
    discovered(w),
    need === "live"
      ? loadNicheRead(w.client, w.ownerId, w.scopeId, { location, now, provenMax: 16, order: roster.map((r) => r.key) }).catch(() => null)
      : loadCachedNicheRead(w.client, w.ownerId, w.scopeId, { location, now }).catch(() => null),
  ]);
  // A saved-only read never replaces a live one from the last day: it would be the same data, re-ranked with less.
  const keepPrev = !read && prev?.niche && prev.nicheAt && now.getTime() - Date.parse(prev.nicheAt) < LIVE_FRESH_MS;
  const niche: NicheRead | null = read ? storableNiche(read) : keepPrev ? prev!.niche : null;
  const p: IntelProfile = {
    v: PROFILE_VERSION,
    builtAt: now.toISOString(),
    inputs,
    niche,
    nicheSource: read ? (need === "live" ? "live" : "saved") : keepPrev ? prev!.nicheSource : "none",
    nicheAt: read ? now.toISOString() : keepPrev ? prev!.nicheAt : null,
    accounts: lists.accounts,
    content: lists.content,
    tracked: inputs.tracked.map((t) => { const i = t.indexOf(":"); return { platform: t.slice(0, i), handle: t.slice(i + 1) }; }),
    roster,
  };
  await saveProfile(w, p);
  return p;
}

/**
 * The brand's profile, rebuilt only when it can't serve this request:
 * "live" for features that need current numbers (plans, the rater), at most
 * one live platform read a day per brand unless the competitors changed;
 * "saved" for pages that must never call a platform.
 */
export async function intelFor(w: Where, opts: { need: NeedNiche; location?: string | null; now?: Date }): Promise<IntelProfile> {
  const now = opts.now ?? new Date();
  const location = opts.location ?? null;
  const prev = await readProfile(w);
  // "saved" never needs the inputs; "live" checks them so a new competitor shows up the same day.
  const inputs = opts.need === "live" || !prev ? await profileInputs(w, location) : prev.inputs;
  if (profileServes(prev, opts.need, opts.need === "live" ? inputs : null, now.getTime())) return prev!;
  const key = `${profileKey(w.ownerId, w.scopeId)}|${opts.need}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = build(w, opts.need, location, inputs, prev, now).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Just the niche read, from the profile. */
export async function nicheReadFor(client: Supa, ownerId: string, scopeId: string | null, opts: { need: NeedNiche; location?: string | null; now?: Date }): Promise<NicheRead | null> {
  return (await intelFor({ client, ownerId, scopeId }, opts).catch(() => null))?.niche ?? null;
}

/**
 * The background refresh (the 4-hourly intelligence job): a live rebuild only
 * when the competitors, the discovery results or the Instagram reads changed,
 * or the live read is more than a day old. Otherwise nothing is called.
 */
export async function refreshProfileIfChanged(w: Where, location: string | null, now = new Date()): Promise<"rebuilt" | "unchanged"> {
  const prev = await readProfile(w);
  const inputs = await profileInputs(w, location);
  const fresh = prev && prev.nicheSource === "live" && prev.nicheAt && now.getTime() - Date.parse(prev.nicheAt) < LIVE_FRESH_MS && sameInputs(prev.inputs, inputs);
  if (fresh) return "unchanged";
  await build(w, "live", location, inputs, prev, now);
  return "rebuilt";
}
