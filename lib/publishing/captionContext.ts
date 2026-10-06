// Everything SOCIA verifiably knows about one post, for Generate Caption:
// the brand as the person saved it, the business locations it has a reason
// to name, the accounts it posts to, who is on the post (and what SOCIA
// really knows about each), the Content Plan day or Content Studio cut it
// came from, what the person typed, and what worked on this account before.
// Each source is read defensively: a missing table or a failed read means
// "not known", never a guess. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { getProfile, type Profile } from "@/lib/profile";
import { listWorkspaces, scopeToWorkspace } from "@/lib/workspaces";
import { getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { formatOf } from "@/lib/overview";
import type { SavedPlan } from "@/lib/schema";
import type { Edl, YieldResult } from "@/lib/studioClips/types";
import { loadPickerAccountsDetailed } from "./db";
import { readKnown, scopeKey } from "./knownUsernames";
import { mentionsIn } from "./people";
import { businessLocations, performanceFacts, type LocationFact, type PerformanceFacts, type WorkspaceFact } from "./captionRules";
import { PLATFORM_LABEL, type Platform } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type FactSource = "brand" | "location" | "account" | "people" | "plan" | "studio" | "performance" | "notes" | "draft";
export type Fact = { source: FactSource; text: string };

export type CaptionInput = {
  postId: string | null;
  destinations: { platform: Platform; accountId: string }[];
  /** what the person has written in the caption box */
  draft: string;
  /** what the person told SOCIA for this post (offer, date, who's in it) */
  notes: string;
  collaborators: string[];
  userTags: string[];
  planId: string | null;
  planDay: string | null;
  /** heard from the video in the browser + transcription provider */
  transcript: string | null;
};

export type CaptionContext = {
  /** what SOCIA knew, shown to the person under the caption */
  facts: Fact[];
  /** what SOCIA doesn't know and so left out */
  gaps: string[];
  /** the verified-facts part of the prompt */
  prompt: string;
  /** text a specific claim (price, time, link) must be found in */
  corpus: string;
  /** accounts the caption may @mention */
  handles: string[];
  brandName: string | null;
  locations: LocationFact[];
  performance: PerformanceFacts | null;
};

const settle = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };
const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
const at = (u: string) => `@${u.replace(/^@/, "")}`;
const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.replace(/^@/, "").toLowerCase()).filter(Boolean)));

export async function buildCaptionContext(ctx: Ctx, input: CaptionInput): Promise<CaptionContext> {
  const client = ctx.client;
  const ownerId = ctx.ownerId;
  const wsId = ctx.workspace?.id ?? null;
  const collaborators = uniq(input.collaborators).slice(0, 3);
  const tagged = uniq(input.userTags).filter((u) => !collaborators.includes(u)).slice(0, 20);

  const [profile, baseProfile, workspaces, conns, accounts, known, plan, build, snap] = await Promise.all([
    settle(getProfile(client, ownerId, brandWorkspace(ctx)), null as Profile | null),
    // Default workspaces keep their brand on the profile row.
    ctx.isOwner ? settle(getProfile(client, ownerId), null as Profile | null) : Promise.resolve(null),
    // Other workspaces are the owner's to see; an invited member only ever sees this one.
    ctx.isOwner ? settle(listWorkspaces(client, ownerId), []) : Promise.resolve([]),
    settle(
      (ctx.isOwner
        ? client.from("instagram_connections").select("username, workspace_id").eq("user_id", ownerId)
        : scopeToWorkspace(client.from("instagram_connections").select("username, workspace_id").eq("user_id", ownerId), wsId)
      ).then((r: { data: unknown; error: unknown }) => (r.error ? [] : (r.data ?? [])) as { username: string | null; workspace_id: string | null }[]),
      [],
    ),
    settle(loadPickerAccountsDetailed(client, ownerId, wsId).then((r) => r.accounts), []),
    collaborators.length || tagged.length ? readKnown(client, ownerId, scopeKey(wsId)) : Promise.resolve([]),
    input.planId ? settle(loadPlanDay(client, ownerId, wsId, input.planId, input.planDay), null) : Promise.resolve(null),
    input.postId ? settle(loadStudioBuild(client, ownerId, input.postId), null) : Promise.resolve(null),
    settle(getIgSnapshot(client, ownerId, wsId), null),
  ]);

  const facts: Fact[] = [];
  const gaps: string[] = [];
  const sections: string[] = [];
  const corpus: string[] = [];
  const handles: string[] = [...collaborators, ...tagged];

  // ---- Brand ------------------------------------------------------------------
  const bd = profile?.brand_detail ?? null;
  const brandName = clip(profile?.brand_name, 80) || null;
  const wsName = ctx.workspace?.name ?? null;
  const brandLines = [
    brandName ? `Brand name: ${brandName}` : null,
    wsName && wsName !== brandName ? `Brand Workspace: ${wsName}` : null,
    profile?.niche ? `Niche / what the business is: ${clip(profile.niche, 200)}` : null,
    profile?.goals ? `What the brand is working toward: ${clip(profile.goals, 300)}` : null,
    bd?.description ? `About the brand (in the owner's words): ${clip(bd.description, 600)}` : null,
    bd?.voice ? `Brand voice: ${clip(bd.voice, 80)}` : null,
    bd?.website ? `Website: ${clip(bd.website, 120)}` : null,
    bd?.avoid ? `Words/topics to AVOID (hard rule): ${clip(bd.avoid, 300)}` : null,
  ].filter(Boolean) as string[];
  if (brandLines.length) {
    sections.push(`# The brand (saved by the user in SOCIA)\n${brandLines.join("\n")}`);
    corpus.push(...brandLines);
    facts.push({ source: "brand", text: [brandName ?? wsName, profile?.niche ? clip(profile.niche, 60) : null].filter(Boolean).join(" · ") || "Your brand settings" });
  } else {
    gaps.push("No brand details are saved for this workspace, so the caption is written from the post alone.");
  }
  if (!bd?.website) gaps.push("No website is saved, so the caption has no link.");

  // ---- Locations --------------------------------------------------------------
  const igByWs = new Map<string, string>();
  for (const c of conns) if (c.workspace_id && c.username) igByWs.set(c.workspace_id, c.username.toLowerCase());
  const wsFact = (w: { id: string; name: string; isDefault: boolean; brand_name: string | null; brand_detail: { location?: string } | null }): WorkspaceFact => {
    const brand = w.isDefault ? baseProfile : null;
    return {
      id: w.id, name: w.name,
      brandName: (w.isDefault ? brand?.brand_name : w.brand_name) ?? null,
      location: (w.isDefault ? brand?.brand_detail?.location : w.brand_detail?.location) ?? null,
      igUsername: igByWs.get(w.id) ?? null,
    };
  };
  const current: WorkspaceFact = {
    id: wsId ?? "current", name: wsName ?? brandName ?? "This brand", brandName, location: bd?.location ?? null,
    igUsername: wsId ? igByWs.get(wsId) ?? null : null,
  };
  const others = workspaces.filter((w) => w.id !== wsId && !w.suspended).map(wsFact);
  const locations = businessLocations(current, others, collaborators);
  if (locations.length) {
    const why = (l: LocationFact) =>
      l.why === "this_workspace" ? "this workspace's saved location"
      : l.why === "same_brand" ? `another location of the same brand (the user's Brand Workspace "${l.workspace}"${l.igUsername ? `, Instagram ${at(l.igUsername)}` : ""})`
      : `the location of a collaborator on this post, which is the user's own Brand Workspace "${l.workspace}"${l.igUsername ? ` (${at(l.igUsername)})` : ""}`;
    sections.push(`# Business locations SOCIA knows (name one only when the post is about or relevant to it)\n${locations.map((l) => `- ${l.location}: ${why(l)}`).join("\n")}`);
    corpus.push(...locations.map((l) => l.location));
    for (const l of locations) {
      facts.push({ source: "location", text: l.why === "this_workspace" ? `${l.location} (this workspace)` : `${l.location} (your ${l.workspace} workspace)` });
      if (l.why !== "this_workspace" && l.igUsername) handles.push(l.igUsername);
    }
  } else {
    gaps.push("No location is saved for this workspace (Settings → Brand), so no location is named unless the video or your notes say it.");
  }

  // ---- Accounts it posts to ---------------------------------------------------
  const posting = input.destinations
    .map((d) => {
      const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId);
      return a ? { platform: d.platform, handle: a.handle ?? null, label: a.label } : null;
    })
    .filter((x): x is { platform: Platform; handle: string | null; label: string } => x != null);
  if (posting.length) {
    sections.push(`# Posting to\n${posting.map((p) => `- ${PLATFORM_LABEL[p.platform]}: ${p.handle ? at(p.handle) : p.label}`).join("\n")}`);
    for (const p of posting) if (p.handle) handles.push(p.handle);
    facts.push({ source: "account", text: `Posting as ${posting.map((p) => `${p.handle ? at(p.handle) : p.label} on ${PLATFORM_LABEL[p.platform]}`).join(", ")}` });
  }

  // ---- People on the post ------------------------------------------------------
  if (collaborators.length || tagged.length) {
    const knownBy = new Map(known.map((k) => [k.username.toLowerCase(), k]));
    const ownWs = new Map<string, string>();
    for (const w of workspaces) { const u = igByWs.get(w.id); if (u) ownWs.set(u, w.name); }
    const describe = (u: string, role: "collaborator" | "tagged") => {
      const roleText = role === "collaborator" ? "collaborator (co-author of the post)" : "tagged in the post";
      const ws = ownWs.get(u);
      if (ws) {
        const loc = locations.find((l) => l.igUsername === u);
        return { line: `- ${at(u)}: ${roleText}; the user's own Brand Workspace "${ws}"${loc ? ` (${loc.location})` : ""}`, fact: `${at(u)} is your ${ws} account`, known: true };
      }
      if (posting.some((p) => p.handle?.toLowerCase() === u)) return { line: `- ${at(u)}: ${roleText}; the account this post is published from`, fact: null, known: true };
      const k = knownBy.get(u);
      if (k?.name) return { line: `- ${at(u)}: ${roleText}; Instagram account name "${k.name}" (from Instagram's account lookup)`, fact: `${at(u)} is ${k.name} on Instagram`, known: true };
      return { line: `- ${at(u)}: ${roleText}; SOCIA knows only the username. Don't say who they are.`, fact: null, known: false };
    };
    const lines: string[] = [];
    const unknown: string[] = [];
    for (const [list, role] of [[collaborators, "collaborator"], [tagged, "tagged"]] as const) {
      for (const u of list) {
        const d = describe(u, role);
        lines.push(d.line);
        if (d.fact) facts.push({ source: "people", text: d.fact });
        else if (!d.known) unknown.push(at(u));
        corpus.push(at(u));
      }
    }
    sections.push(`# People on this post\n${lines.join("\n")}`);
    if (collaborators.length) facts.push({ source: "people", text: `Collab post with ${collaborators.map(at).join(", ")}` });
    if (unknown.length) gaps.push(`SOCIA knows only the username of ${unknown.join(", ")}, so the caption doesn't say who they are.`);
  }

  // ---- Where the post came from ------------------------------------------------
  if (plan) {
    const p = plan;
    const text = `Day: ${p.day} · Format: ${p.format} · Concept: ${p.concept} · Planned opening line: "${p.hook}" · Why it's in the plan: ${p.rationale}`;
    sections.push(`# The Content Plan item this post is executing (SOCIA's plan, accepted by the user)\n${text}`);
    corpus.push(text);
    facts.push({ source: "plan", text: `Content Plan, ${p.day}: ${clip(p.concept, 80)}` });
  }
  if (build) {
    const lines = [
      build.title ? `Idea: ${build.title}${build.angle ? ` (${build.angle})` : ""}` : null,
      build.onscreen.length ? `On-screen text in the cut: ${build.onscreen.map((t) => `"${t}"`).join(", ")}` : null,
      build.cta ? `Ending ask in the cut: "${build.cta}"` : null,
      build.caption ? `Content Studio's caption draft: """${clip(build.caption, 800)}"""` : null,
    ].filter(Boolean) as string[];
    if (lines.length) {
      sections.push(`# Built in SOCIA's Content Studio from the user's own clips\n${lines.join("\n")}`);
      corpus.push(...lines);
      facts.push({ source: "studio", text: `Content Studio cut${build.title ? `: ${clip(build.title, 70)}` : ""}` });
    }
  }

  // ---- What the person said ------------------------------------------------------
  const notes = clip(input.notes, 1200);
  const draft = clip(input.draft, 2200);
  if (notes) {
    sections.push(`# What the user told SOCIA about this post (facts you may use)\n"""${notes}"""`);
    corpus.push(notes);
    facts.push({ source: "notes", text: "What you told SOCIA" });
  }
  if (draft) {
    sections.push(`# The user's caption so far (their own words: keep their facts)\n"""${draft}"""`);
    corpus.push(draft);
    facts.push({ source: "draft", text: "Your caption so far" });
  }
  for (const m of [...mentionsIn(notes), ...mentionsIn(draft)]) handles.push(m);
  if (input.transcript) corpus.push(input.transcript);
  if (!notes && !/[$£€]\s?\d|\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(corpus.join(" ") + (input.transcript ?? ""))) {
    gaps.push("No prices, hours, dates or offers are known for this post, so none are mentioned. Add them under “Anything SOCIA should know?”.");
  }

  // ---- What worked before (style only) -------------------------------------------
  let performance: PerformanceFacts | null = null;
  if (snap?.media?.length) {
    performance = performanceFacts(snap.media.map((m) => ({ caption: m.caption ?? null, interactions: interactionsTotal(m), format: formatOf(m), at: m.timestamp ?? null })));
    const pf = performance;
    const who = snap.username ? at(snap.username) : "this account";
    const lines: string[] = [];
    if (pf.top.length) lines.push(`Opening lines of the posts that beat the account's median:\n${pf.top.map((t) => `- "${t.hook}" (${t.multiplier}× median, ${t.format}${t.hashtags.length ? `, ${t.hashtags.map((h) => `#${h}`).join(" ")}` : ""})`).join("\n")}`);
    if (pf.hashtags.length) lines.push(`Hashtags this account has used: ${pf.hashtags.map((h) => `#${h.tag} (${h.uses} post${h.uses === 1 ? "" : "s"}${h.medianMultiplier != null ? `, ${h.medianMultiplier}× median` : ""})`).join(", ")}`);
    if (pf.length) lines.push(`Caption length: the best quarter of posts have a median of ${pf.length.top} characters, the rest ${pf.length.rest}.`);
    if (lines.length) {
      sections.push(`# What has worked on ${who} (${pf.posts} recent Instagram posts${pf.baseline ? `, median ${Math.round(pf.baseline)} interactions` : ""}). Use for style and hashtag choice only; these are older posts, NOT facts about this one.\n${lines.join("\n")}`);
      facts.push({ source: "performance", text: pf.top.length ? `${pf.top.length} of your top Instagram posts (${who})` : `Your Instagram history (${who})` });
    }
  }
  if (!performance || (!performance.top.length && !performance.hashtags.length)) {
    gaps.push("Not enough Instagram history with results yet, so style and hashtags come from the post itself.");
  }

  return { facts, gaps, prompt: sections.join("\n\n"), corpus: corpus.join("\n"), handles: uniq(handles), brandName, locations, performance };
}

type PlanItem = SavedPlan["data"]["weeklyPlan"][number];

async function loadPlanDay(client: Supa, ownerId: string, wsId: string | null, planId: string, day: string | null): Promise<PlanItem | null> {
  const { data, error } = await scopeToWorkspace(client.from("plans").select("id, data").eq("user_id", ownerId).eq("id", planId), wsId).limit(1);
  if (error || !data?.[0]) return null;
  const items = ((data[0] as { data: SavedPlan["data"] }).data?.weeklyPlan ?? []) as PlanItem[];
  if (!day) return null;
  const d = day.trim().toLowerCase();
  return items.find((p) => p.day?.trim().toLowerCase() === d) ?? (/^\d+$/.test(d) ? items[Number(d)] ?? null : null);
}

type StudioBuildFacts = { title: string | null; angle: string | null; onscreen: string[]; cta: string | null; caption: string | null };

async function loadStudioBuild(client: Supa, ownerId: string, postId: string): Promise<StudioBuildFacts | null> {
  const { data, error } = await client.from("studio_builds").select("project_id, opportunity_idx, edl, caption").eq("user_id", ownerId).eq("post_id", postId).order("created_at", { ascending: false }).limit(1);
  if (error || !data?.[0]) return null;
  const b = data[0] as { project_id: string; opportunity_idx: number; edl: Edl | null; caption: string | null };
  const proj = await settle(
    client.from("studio_projects").select("yield").eq("user_id", ownerId).eq("id", b.project_id).limit(1)
      .then((r: { data: unknown }) => ((r.data as { yield: YieldResult | null }[] | null)?.[0]?.yield ?? null)),
    null as YieldResult | null,
  );
  const opp = proj?.opportunities?.find((o) => o.idx === b.opportunity_idx) ?? null;
  return {
    title: opp?.title ?? null,
    angle: opp?.angle ?? null,
    onscreen: (b.edl?.text ?? []).map((t) => t.text).filter(Boolean).slice(0, 6),
    cta: b.edl?.cta ?? null,
    caption: b.caption ?? b.edl?.caption ?? null,
  };
}
