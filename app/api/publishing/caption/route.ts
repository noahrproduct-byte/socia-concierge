import { NextResponse } from "next/server";
import { anthropic, modelFor, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { resolveContext } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { buildCaptionContext, knownLocations, type CaptionInput } from "@/lib/publishing/captionContext";
import { assembleCaption, describeClaim, HASHTAG_TARGET, hashtagMax, unverifiedClaims, type CaptionParts } from "@/lib/publishing/captionRules";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import { PLATFORM_LABEL, type Platform } from "@/lib/publishing/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST — Generate Caption in Create Post. The browser sends what it saw and
// heard in the media (sampled frames, the automatic transcript, the measured
// sound) and the post's settings; the server adds only what SOCIA has stored
// and verified (lib/publishing/captionContext.ts), asks the model for the
// caption, then checks every specific claim against those facts. A claim
// nothing supports goes back for one rewrite; if it survives, the person
// sees it flagged. Refinements (shorter, more engaging, new ask, new
// hashtags) rewrite the current caption with the same facts.

type Action = "generate" | "regenerate" | "shorten" | "engaging" | "professional" | "cta" | "hashtags";
const ACTIONS: Action[] = ["generate", "regenerate", "shorten", "engaging", "professional", "cta", "hashtags"];
const PLATFORMS: Platform[] = ["instagram", "facebook", "tiktok", "youtube"];

type Current = { target: string; hook: string; body: string; cta: string; hashtags: string[] };
type Body = Partial<Omit<CaptionInput, "studio">> & {
  studio?: { observed?: unknown; goal?: unknown; hook?: unknown; cta?: unknown; onscreen?: unknown } | null;
  action?: string;
  perPlatform?: boolean;
  media?: { kind?: string; count?: number; durationSec?: number | null };
  frames?: unknown[];
  frameTimes?: unknown[];
  imageUrls?: unknown[];
  audio?: string | null;
  understanding?: string;
  purpose?: string;
  current?: Current[];
  ctaGoal?: string;
};

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strs = (v: unknown, n: number, each = 60) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, each)).filter(Boolean).slice(0, n) : []);

/** The longest caption every platform in the list accepts. */
function charLimit(platforms: Platform[]): number {
  const maxes = platforms.flatMap((p) => CAPABILITIES[p].formats.map((f) => f.caption.max));
  return maxes.length ? Math.min(...maxes) : 2200;
}

const PLATFORM_NOTES: Record<Platform, string> = {
  instagram: `Instagram: the hook is the first line and must work alone (about 125 characters show before "more"). Short paragraphs with line breaks. ${HASHTAG_TARGET.instagram.min}–${HASHTAG_TARGET.instagram.max} hashtags at the end (Instagram allows at most 5).`,
  facebook: `Facebook: conversational, can run a little longer, reads like a neighbour talking. ${HASHTAG_TARGET.facebook.min}–${HASHTAG_TARGET.facebook.max} hashtags.`,
  tiktok: `TikTok: short and punchy, one or two lines before the ask. ${HASHTAG_TARGET.tiktok.min}–${HASHTAG_TARGET.tiktok.max} hashtags including the niche and local discovery.`,
  youtube: `YouTube (the description of a Short): the first line says what the video is; one short paragraph; ${HASHTAG_TARGET.youtube.min}–${HASHTAG_TARGET.youtube.max} hashtags.`,
};

const SYSTEM = `You are SOCIA's caption writer. You write the caption for one specific social post by a business or creator, in the brand's voice, so the post does its job. The person will read it before posting.

Hard rules:
1. Use only what the brief gives you: the brand settings, the business locations listed, the people on the post, the Content Plan item or Content Studio cut, what the user told SOCIA, their caption so far, and what is actually visible or audible in the media. Never invent a location, collaborator, product, menu item, offer, price, discount, date, time, event, award, statistic, opening, or any other business fact. If SOCIA doesn't know something, leave it out: a shorter true caption beats a richer invented one.
2. Name a location only from "Business locations SOCIA knows" or when the media or the user says it, and only when it is relevant to this post. When a collaborator is the brand's own other location, the post may speak for both locations.
3. @mention only accounts listed as on this post or as the posting accounts. Say nothing about a person beyond what the brief says about them.
4. Describe only what the frames and transcript show. If you can't tell exactly what a dish, product or place is, describe it plainly ("this slice", "the new space") rather than naming it.
5. Past top posts are for style, length and hashtag choice only. They are older posts, not facts about this one.
6. Never predict performance, never mention algorithms, no generic filler ("elevate", "game-changer", "you won't believe"), no markdown, no quotes around the caption. Emojis: at most two, and none if the brand voice is professional.

Shape:
- hook: the first line, specific to this post (under 125 characters).
- body: one to three short paragraphs with line breaks; may be empty for a very short caption.
- cta: one clear ask that fits the purpose (come in, comment, save, share, tag someone, follow). Don't promise ordering, booking, delivery or a link unless the brief says the business offers it.
- hashtags: written without "#". Each one relevant: the brand, a known location, the niche, the subject of this post, or local discovery. No generic tags (love, instagood, viral, fyp, explore, foryou, trending).`;

function schemaFor(targets: string[]) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      understanding: { type: "string" },
      purpose: { type: "string" },
      captions: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            target: { type: "string", enum: targets },
            hook: { type: "string" }, body: { type: "string" }, cta: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
          },
          required: ["target", "hook", "body", "cta", "hashtags"],
        },
      },
    },
    required: ["understanding", "purpose", "captions"],
  } as const;
}

type ModelOut = { understanding: string; purpose: string; captions: Current[] };
type Img = { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } | { type: "url"; url: string } };

async function callModel(system: string, content: (Img | { type: "text"; text: string })[], targets: string[]): Promise<{ out: ModelOut | null; refused: boolean }> {
  const params = {
    model: modelFor("caption"), max_tokens: 3000, system,
    output_config: { format: { type: "json_schema", schema: schemaFor(targets) } },
    messages: [{ role: "user", content }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  if (res.stop_reason === "refusal") return { out: null, refused: true };
  const block = res.content.find((b) => b.type === "text");
  try {
    const raw = block && "text" in block ? JSON.parse(block.text) : null;
    if (!raw || !Array.isArray(raw.captions)) return { out: null, refused: false };
    return { out: raw as ModelOut, refused: false };
  } catch {
    return { out: null, refused: false };
  }
}

// GET ?collaborators=a,b — the business locations this post may name, so
// the composer can ask which one it is about before writing.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const collaborators = (new URL(req.url).searchParams.get("collaborators") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const locations = await knownLocations(ctx, collaborators).catch(() => []);
  return NextResponse.json({ locations: locations.map((l) => ({ location: l.location, why: l.why, workspace: l.workspace })) });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action: Action = ACTIONS.includes(body.action as Action) ? (body.action as Action) : "generate";
  const refine = action !== "generate";

  const destinations = (Array.isArray(body.destinations) ? body.destinations : [])
    .filter((d) => d && PLATFORMS.includes(d.platform) && typeof d.accountId === "string")
    .slice(0, 10)
    .map((d) => ({ platform: d.platform, accountId: d.accountId }));
  const platforms = Array.from(new Set(destinations.map((d) => d.platform)));
  const perPlatform = Boolean(body.perPlatform) && platforms.length > 0;
  const targets = perPlatform ? platforms : ["all"];
  const forTarget = (t: string): Platform[] => (t === "all" ? (platforms.length ? platforms : ["instagram"]) : [t as Platform]);

  const current = (Array.isArray(body.current) ? body.current : [])
    .filter((c) => c && targets.includes(c.target))
    .map((c) => ({ target: c.target, hook: str(c.hook, 400), body: str(c.body, 2200), cta: str(c.cta, 300), hashtags: strs(c.hashtags, 10) }));
  if (refine && action !== "regenerate" && !current.length) return NextResponse.json({ error: "Generate a caption first." }, { status: 400 });

  const input: CaptionInput = {
    postId: str(body.postId, 64) || null,
    destinations,
    draft: str(body.draft, 2200),
    notes: str(body.notes, 1200),
    collaborators: strs(body.collaborators, 3, 31),
    userTags: strs(body.userTags, 20, 31),
    planId: str(body.planId, 64) || null,
    planDay: str(body.planDay, 40) || null,
    transcript: str(body.transcript, 4000) || null,
    location: str(body.location, 120) || null,
    studio: body.studio && typeof body.studio === "object"
      ? { observed: str(body.studio.observed, 800), goal: str(body.studio.goal, 120), hook: str(body.studio.hook, 200), cta: str(body.studio.cta, 200), onscreen: strs(body.studio.onscreen, 6, 120) }
      : null,
  };
  const facts = await buildCaptionContext(ctx, input);

  // ---- The media, as the browser saw and heard it --------------------------------
  const kind = ["video", "image", "carousel"].includes(body.media?.kind ?? "") ? (body.media!.kind as "video" | "image" | "carousel") : "none";
  const count = Math.max(0, Math.min(20, Number(body.media?.count) || 0));
  const duration = typeof body.media?.durationSec === "number" && Number.isFinite(body.media.durationSec) ? Math.round(body.media.durationSec) : null;
  const frames = refine ? [] : strs(body.frames, 8, 600_000).filter((f) => /^[A-Za-z0-9+/=]+$/.test(f));
  const times = Array.isArray(body.frameTimes) ? body.frameTimes.filter((t): t is number => typeof t === "number").slice(0, frames.length) : [];
  const storagePrefix = `${getSupabaseUrl()}/storage/v1/object/public/scheduled-media/`;
  const urls = refine || frames.length ? [] : strs(body.imageUrls, 10, 1000).filter((u) => u.startsWith(storagePrefix));
  const audio = str(body.audio, 400);

  const mediaLine =
    kind === "none" ? "No media has been added yet."
    : kind === "video" ? `A ${duration ? `${duration}-second ` : ""}video.${frames.length ? ` The images are ${frames.length} frames sampled at ${times.map((t) => `${t.toFixed(1)}s`).join(", ")}.` : " SOCIA couldn't sample its frames in this browser."}`
    : kind === "carousel" ? `A ${count}-image carousel.${frames.length || urls.length ? " The images are the post's images in order." : ""}`
    : `A single image.${frames.length || urls.length ? " The image is attached." : ""}`;
  const mediaSection = [
    `# The post's media\n${mediaLine}`,
    input.transcript ? `What is said in the video (automatic transcript of its own audio):\n"""${input.transcript}"""` : kind === "video" ? "No transcript: either no speech or it couldn't be transcribed." : "",
    audio ? `Measured sound: ${audio}` : "",
  ].filter(Boolean).join("\n");

  const targetLine = perPlatform
    ? `Write one caption for each of: ${targets.map((t) => PLATFORM_LABEL[t as Platform]).join(", ")}.\n${targets.map((t) => `- ${PLATFORM_NOTES[t as Platform]}`).join("\n")}`
    : `Write one caption (target "all") that is posted unchanged to ${forTarget("all").map((p) => PLATFORM_LABEL[p]).join(", ")}. Use at most ${hashtagMax(forTarget("all"))} hashtags.\n${forTarget("all").map((p) => `- ${PLATFORM_NOTES[p]}`).join("\n")}`;

  const prev = current.length ? `# The current caption${current.length > 1 ? "s" : ""} (JSON)\n${JSON.stringify(current)}` : "";
  const known = refine ? [`What SOCIA understood about the post: ${str(body.understanding, 600) || "(not given)"}`, `Its purpose: ${str(body.purpose, 300) || "(not given)"}`].join("\n") : "";
  const ctaGoal = str(body.ctaGoal, 80);
  const TASK: Record<Action, string> = {
    generate: `${targetLine}\nFirst fill "understanding": one or two sentences on what this post shows and says, from the media and transcript only (say plainly if there is no media yet). Then "purpose": one sentence on what the post should accomplish for the business, from the plan item, the user's notes and the brand's goal; if none of those say, the most likely aim stated plainly.`,
    regenerate: `${targetLine}\nWrite a clearly different take from the current caption: a different hook and angle, the same facts. Repeat "understanding" and "purpose" as given unless the take changes the purpose.`,
    shorten: `Make each caption about half as long. Keep the hook's idea, every fact you keep must still come from the brief, keep the ask and the hashtags. Repeat "understanding" and "purpose" as given.`,
    engaging: `Rewrite each caption to be more engaging: a sharper, more specific hook, more personality, and an ask that invites a reply. Same facts, same hashtags unless one is weak. Repeat "understanding" and "purpose" as given.`,
    professional: `Rewrite each caption in a more polished, professional tone: clear, warm, no slang, at most one emoji. Same facts and hashtags. Repeat "understanding" and "purpose" as given.`,
    cta: `Replace only the ask ("cta") with one aimed at: ${ctaGoal ? `${ctaGoal} (the user chose this, so it is allowed; still add no link, price or detail the brief doesn't give)` : "a different, stronger ask that fits the purpose"}. Keep hook, body and hashtags as they are. Repeat "understanding" and "purpose" as given.`,
    hashtags: `Replace only the hashtags with a fresh, relevant set (follow the per-platform counts). Keep hook, body and cta exactly as they are. Repeat "understanding" and "purpose" as given.`,
  };

  const text = [mediaSection, facts.prompt, known, prev, `# Task\n${TASK[action]}`].filter(Boolean).join("\n\n");
  const content: (Img | { type: "text"; text: string })[] = [
    ...frames.map((data): Img => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    ...urls.map((url): Img => ({ type: "image", source: { type: "url", url } })),
    { type: "text", text },
  ];

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_generation");
  if (u.denied) return u.denied;

  try {
    const first = await callModel(SYSTEM, content, targets);
    if (first.refused) { await u.release(); return NextResponse.json({ error: "SOCIA declined this one. Try adding a note about the post." }, { status: 422 }); }
    if (!first.out) { await u.release(); return NextResponse.json({ error: "SOCIA returned no caption. Try again." }, { status: 502 }); }

    // The corpus includes the transcript and the user's words; the model's own
    // reading of the frames is not evidence for a price or a time.
    const check = (out: ModelOut) => out.captions.filter((c) => targets.includes(c.target)).map((c) => {
      const ps = forTarget(c.target);
      const parts: CaptionParts = { hook: str(c.hook, 400), body: str(c.body, 2200), cta: str(c.cta, 300), hashtags: strs(c.hashtags, 12) };
      const { text, hashtags } = assembleCaption(parts, hashtagMax(ps));
      const claims = unverifiedClaims(text, facts.corpus, facts.handles);
      const limit = charLimit(ps);
      return { target: c.target, parts: { ...parts, hashtags }, text, claims, over: [...text].length > limit ? limit : null };
    });

    let out = first.out;
    let checked = check(out);
    const needsFix = checked.filter((c) => c.claims.length || c.over);
    if (needsFix.length) {
      const fixes = needsFix.map((c) => `- ${c.target}: ${[...c.claims.map(describeClaim), c.over ? `it is over ${c.over} characters; shorten it` : ""].filter(Boolean).join("; ")}.`).join("\n");
      const repairText = [facts.prompt, mediaSection, `# Captions to fix (JSON)\n${JSON.stringify(out.captions)}`, `# Task\nThese captions contain things SOCIA can't verify or are too long:\n${fixes}\nRemove each unverified item or replace it with something the brief actually says. Change nothing else. Return all captions, and "understanding" and "purpose" as given.`].join("\n\n");
      const second = await callModel(SYSTEM, [{ type: "text", text: repairText }], targets).catch(() => null);
      if (second?.out?.captions?.length) {
        const again = check(second.out);
        // Keep the rewrite only where it is no worse than the original.
        const merged = checked.map((c) => {
          const r = again.find((x) => x.target === c.target);
          return r && r.claims.length + (r.over ? 1 : 0) <= c.claims.length + (c.over ? 1 : 0) ? r : c;
        });
        checked = merged;
        out = { ...out, understanding: second.out.understanding || out.understanding, purpose: second.out.purpose || out.purpose };
      }
    }

    if (!checked.length) { await u.release(); return NextResponse.json({ error: "SOCIA returned no caption. Try again." }, { status: 502 }); }
    const captions = targets
      .map((t) => checked.find((c) => c.target === t))
      .filter((c): c is (typeof checked)[number] => c != null)
      .map((c) => ({
        target: c.target,
        platforms: forTarget(c.target),
        text: c.text,
        parts: c.parts,
        warnings: [...c.claims.map((x) => `Check before posting: ${describeClaim(x)}.`), ...(c.over ? [`Over the ${c.over}-character limit.`] : [])],
      }));
    return NextResponse.json({
      understanding: str(out.understanding, 600),
      purpose: str(out.purpose, 300),
      captions,
      facts: facts.facts,
      gaps: facts.gaps,
      usage: u.usage,
    });
  } catch (err) {
    await u.release();
    const k = aiFailureKind(err);
    console.error("[caption]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}
