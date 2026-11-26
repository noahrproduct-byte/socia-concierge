// "Help me make a video", server side (lib/videoWorkspace.ts has the shapes):
//   research: candidates from what SOCIA has already read (Discover's lists for
//     this brand, the Reels read across every brand for other industries) and
//     YouTube Shorts found by the idea, shortlisted by numbers, then one model
//     call picks the few that match the idea's concept and structure and
//     writes two or three directions;
//   plan: one model call writes the production plan for the chosen direction,
//     or changes one part of it.
// A reference's words are its caption or title: the model is told it hasn't
// watched the video, and says so. Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, effortFor, MODEL } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { loadDiscoverData } from "@/lib/discoverData";
import { trendingPool } from "@/lib/discoverTrending";
import { youtubeExamples } from "@/lib/research/gather";
import { ytConfigured } from "@/lib/youtube";
import { signRefUrl } from "@/lib/studioClips/refToken";
import { isPlatformMediaUrl } from "@/lib/fetchGuard";
import { getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { buildWindows } from "@/lib/postingTimes";
import { zonedAt } from "@/lib/publishing/timing";
import type { ProvenReel } from "@/lib/trendSignals";
import { PLAN_CHANGES, sanitizeDirection, sanitizePlan, type PlanChange, type WsDirection, type WsPlan, type WsRef, type WsResearch } from "@/lib/videoWorkspace";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

/** How many candidates the model reads: enough to find the right few, small enough to stay cheap. */
const CANDIDATES = 60;

type Candidate = Omit<WsRef, "why" | "adapt"> & { line: string | null; source: string };

const fromReel = (r: ProvenReel & { source?: string }, viewerId: string): Candidate => {
  const token = r.refToken ?? (r.video && isPlatformMediaUrl(r.video) ? signRefUrl(viewerId, r.video) : null);
  return {
    key: r.url, url: r.url, platform: r.platform === "youtube" ? "youtube" : "instagram", creator: r.accountHandle ? `@${r.accountHandle}` : r.accountName,
    thumb: r.thumb, views: r.views, multiplier: r.multiplier, basis: r.basis, format: r.format, caption: r.title, line: r.line,
    video: r.video ?? null, refToken: token, source: r.source ?? "niche",
  };
};

/** Everything worth showing the model, best first, no link twice. */
async function candidates(client: Supa, viewerId: string, idea: string): Promise<Candidate[]> {
  const [discover, pool, yt] = await Promise.all([
    loadDiscoverData(client, { id: viewerId }).catch(() => null),
    trendingPool().catch(() => []),
    ytConfigured() ? youtubeExamples(idea.slice(0, 100), true, 365).catch(() => []) : Promise.resolve([]),
  ]);
  const own = [...(discover?.recommended ?? []), ...(discover?.reelsToCopy ?? []), ...(discover?.styleReels ?? []), ...(discover?.nicheReels ?? []), ...(discover?.trending ?? [])].map((r) => fromReel(r as ProvenReel & { source?: string }, viewerId));
  const wide = [...pool].sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0)).slice(0, 40).map((r) => ({ ...fromReel(r, viewerId), source: "other industries" }));
  const shorts: Candidate[] = yt.slice(0, 10).map((x) => ({
    key: x.url, url: x.url, platform: "youtube", creator: x.creator, thumb: x.thumb, views: x.views, multiplier: null, basis: "views", format: "Short",
    caption: x.title, line: null, video: null, refToken: null, source: "YouTube search",
  }));
  const seen = new Set<string>();
  return [...own, ...shorts, ...wide].filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true))).slice(0, CANDIDATES);
}

const RESEARCH_SYSTEM = `You are a short-form video strategist. A business owner has an idea for one video. From the list of real videos given, pick the ones that truly match the idea: the same concept, creative format, story structure or presentation (for example a talking-head opening that turns into a product demo), not merely the same topic or words. Then give two or three distinct directions for making the owner's video. Return JSON only.

Each listed video has only its published caption or title, format and numbers: you have not watched it. Never describe its footage, spoken words or on-screen text as fact; say "its caption" or "its title" when you refer to its words. Pick 3 to 6 that genuinely match; fewer, or none, is right when the list has nothing close. Prefer ones that did well against the creator's usual.

"refs": for each pick, its id, "why" (one sentence on how it matches the idea, from what can be read) and "adapt" (two or three things the owner could take from it, as concrete actions).
"directions": two or three, clearly different (for example cinematic, fast-paced, behind the scenes), each with an id (A, B, C), a short title, the concept in one or two sentences, the opening hook (what is seen first, and words only if they help), seconds, what filming it takes within the owner's means, the editing style, why SOCIA recommends it, the ids of the picks that support it, and recommended true for exactly one.
"note": one plain sentence when no video matched, else "".
Write plainly, no dashes, no hype, no promise of views.`;

const RESEARCH_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    refs: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, why: { type: "string" }, adapt: { type: "array", items: { type: "string" } } }, required: ["id", "why", "adapt"] } },
    directions: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, title: { type: "string" }, concept: { type: "string" }, hook: { type: "string" }, seconds: { type: "number" }, filming: { type: "string" }, editing: { type: "string" }, why: { type: "string" }, refKeys: { type: "array", items: { type: "string" } }, recommended: { type: "boolean" } }, required: ["id", "title", "concept", "hook", "seconds", "filming", "editing", "why", "refKeys", "recommended"] } },
    note: { type: "string" },
  },
  required: ["refs", "directions", "note"],
} as const;

async function callJson(ownerId: string, feature: "video_workspace_research" | "video_workspace_plan", system: string, schema: unknown, user: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.stream({ model: MODEL, max_tokens: maxTokens, system, output_config: { format: { type: "json_schema", schema }, ...effortFor(MODEL, "medium") }, messages: [{ role: "user", content: user }] } as any).finalMessage();
  recordAiUsage(ownerId, feature, res);
  const block = res.content.find((b) => b.type === "text");
  try { return JSON.parse(block && "text" in block ? block.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() : "") as Record<string, unknown>; } catch { return null; }
}

const fmt = (n: number | null) => (n == null ? "unknown" : n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

/** Stage 1: the real videos that match the idea, and the directions to take it. */
export async function researchIdea(args: { client: Supa; viewerId: string; ownerId: string; idea: string; account: string }): Promise<WsResearch> {
  const cands = await candidates(args.client, args.viewerId, args.idea);
  const ids = new Map(cands.map((c, i) => [`V${i + 1}`, c]));
  const listText = [...ids].map(([id, c]) => `${id} | ${c.platform} ${c.format} by ${c.creator} (${c.source}) | ${fmt(c.views)} views${c.multiplier != null ? `, ${c.multiplier.toFixed(1)}x the creator's usual` : ""} | caption or title: "${(c.line || c.caption || "").replace(/\s+/g, " ").slice(0, 140)}"`).join("\n");
  const out = await callJson(args.ownerId, "video_workspace_research", RESEARCH_SYSTEM, RESEARCH_SCHEMA, `${args.account}\n\nThe owner's idea:\n<<<\n${args.idea.replace(/<<<|>>>/g, "")}\n>>>\n\nThe videos SOCIA has read (${ids.size}):\n${listText || "(none)"}`, 3000);
  const refs: WsRef[] = (Array.isArray(out?.refs) ? out!.refs as Record<string, unknown>[] : []).flatMap((r) => {
    const c = ids.get(String(r.id ?? ""));
    if (!c) return [];
    const { line: _l, source: _s, ...base } = c; void _l; void _s;
    return [{ ...base, why: typeof r.why === "string" ? r.why.slice(0, 300) : "", adapt: Array.isArray(r.adapt) ? r.adapt.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 160)).slice(0, 3) : [] }];
  }).slice(0, 6);
  const keyOf = new Map([...ids].map(([id, c]) => [id, c.key]));
  const refKeys = new Set(refs.map((r) => r.key));
  const directions = (Array.isArray(out?.directions) ? out!.directions as Record<string, unknown>[] : [])
    .map((d, i) => sanitizeDirection({ ...d, refKeys: (Array.isArray(d.refKeys) ? d.refKeys : []).map((k) => keyOf.get(String(k)) ?? String(k)) }, i, refKeys))
    .filter((d): d is WsDirection => d != null).slice(0, 3);
  if (directions.length && !directions.some((d) => d.recommended)) directions[0].recommended = true;
  if (!directions.length) throw new Error("SOCIA couldn't work out directions for that idea just now. Try again, or say a little more about it.");
  const note = typeof out?.note === "string" && out.note.trim() ? out.note.trim().slice(0, 240) : refs.length ? null : "SOCIA didn't find videos close enough to this idea, so the directions build on your idea alone.";
  return { refs, directions, note };
}

const PLAN_SYSTEM = `You are the producer for one short vertical video for a business. Write the full production plan for the direction the owner chose, in their brand's voice and within their means. Return JSON only.

The opening must stop the scroll in the first second: say exactly what is seen first, and add spoken words or on-screen text only when they help. The script is natural spoken English for this business: no greetings, no "in this video", no generic AI phrases (unlock, elevate, game-changer, journey, seamless), no repeated points, no forced call to action, no dashes. Never invent facts, prices, numbers, reviews or claims about the business; use only what you are given. The shot list is timed to the seconds given, each shot with what to film, the camera angle, the camera movement, what is said (or ""), on-screen text (or "") and how to edit it. Reference videos are known only by their captions: borrow their structure and approach, never their words. The caption is ready to post with at most five hashtags. postTime is "" (SOCIA fills it from the account's own results).`;

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string" }, objective: { type: "string" }, audience: { type: "string" }, seconds: { type: "number" }, platform: { type: "string" }, format: { type: "string" }, direction: { type: "string" },
    hook: { type: "object", additionalProperties: false, properties: { visual: { type: "string" }, say: { type: "string" }, text: { type: "string" }, sound: { type: "string" } }, required: ["visual", "say", "text", "sound"] },
    script: { type: "string" },
    shots: { type: "array", items: { type: "object", additionalProperties: false, properties: { from: { type: "number" }, to: { type: "number" }, film: { type: "string" }, angle: { type: "string" }, move: { type: "string" }, say: { type: "string" }, text: { type: "string" }, edit: { type: "string" } }, required: ["from", "to", "film", "angle", "move", "say", "text", "edit"] } },
    editing: { type: "string" }, music: { type: "string" }, voiceover: { type: "string" }, caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, cta: { type: "string" }, postTime: { type: "string" },
  },
  required: ["title", "objective", "audience", "seconds", "platform", "format", "direction", "hook", "script", "shots", "editing", "music", "voiceover", "caption", "hashtags", "cta", "postTime"],
} as const;

/** When the account's own posts did best, in the brand's time zone, as a line; null without enough posts. */
async function bestTime(client: Supa, ownerId: string, wsId: string | null, tz: string | null): Promise<string | null> {
  const snap = await getIgSnapshot(client, ownerId, wsId).catch(() => null);
  const timed = (snap?.media ?? []).filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: m.media_type ?? "" }));
  if (timed.length < 8) return null;
  const w = buildWindows(timed, zonedAt(tz || "UTC"));
  const best = w.best[0];
  return best ? `${best.label}: when your own posts have done best (${best.n} posts${best.confidence === "early" ? ", an early read" : ""}).` : null;
}

/** Stage 2: the production plan for the chosen direction, or one part of it changed. */
export async function planVideo(args: {
  client: Supa; ownerId: string; wsId: string | null; tz: string | null; idea: string; account: string;
  direction: WsDirection; refs: WsRef[]; change?: PlanChange | null; current?: WsPlan | null;
}): Promise<WsPlan> {
  const refsText = args.refs.map((r) => `- ${r.platform} ${r.format} by ${r.creator}: caption "${(r.caption ?? "").slice(0, 140)}". Take from it: ${r.adapt.join("; ")}`).join("\n");
  const user = [
    args.account,
    `The owner's idea:\n<<<\n${args.idea.replace(/<<<|>>>/g, "")}\n>>>`,
    `The direction they chose: ${args.direction.title}. ${args.direction.concept} Hook: ${args.direction.hook}. About ${args.direction.seconds} seconds. Filming: ${args.direction.filming}. Editing: ${args.direction.editing}.`,
    refsText ? `Reference videos they chose:\n${refsText}` : "No reference videos were chosen.",
    args.change && args.current ? `The current plan:\n${JSON.stringify(args.current)}\n\nChange asked for: ${PLAN_CHANGES[args.change]} Keep every other part exactly as it is.` : "",
  ].filter(Boolean).join("\n\n");
  const out = await callJson(args.ownerId, "video_workspace_plan", PLAN_SYSTEM, PLAN_SCHEMA, user, 6000);
  const plan = sanitizePlan(out);
  if (!plan) throw new Error("SOCIA couldn't write the plan just now. Try again.");
  const when = await bestTime(args.client, args.ownerId, args.wsId, args.tz).catch(() => null);
  return { ...plan, postTime: when ?? "" };
}
