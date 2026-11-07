import { NextResponse } from "next/server";
import { humanText } from "@/lib/studioClips/overlay";
import { LIMITS } from "@/lib/inputLimits";
import { anthropic, MODEL, effortFor, AI_UNAVAILABLE_COPY, aiFailure } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import { postCards, displayTitle, type PostCard } from "@/lib/overview";
import { describeQuickAudio, type QuickAudio } from "@/lib/audio/quick";
import { CATEGORY_INFO, GOALS, SCORE_LABEL, type StudioAnalysis, type StudioKind, type GoalId, type CategoryId } from "@/lib/studio";
import { planConcept } from "@/lib/studioGuideLoad";
import { conceptPrompt } from "@/lib/studioGuide";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { scopeToWorkspace, competitorScopeId } from "@/lib/workspaces";
import { nicheVetted } from "@/lib/discovery";
import { fetchAllowed, isPlatformMediaUrl } from "@/lib/fetchGuard";
import { loadNicheRead } from "@/lib/trendSignalsLoad";
import { loadOutcomes } from "@/lib/raterLogLoad";
import { logEvidence } from "@/lib/raterLog";
import { refResult } from "@/lib/trendSignals";
import { byPriority, citedIds, cleanCompetitors, cleanDirections, cleanExperiments, cleanFixExtras, validCuts, type PostRef } from "@/lib/studioVerdict";

export const runtime = "nodejs";
// One large Opus answer with frames can take minutes. The model call stops at
// MODEL_BUDGET_MS, before the platform's limit, so a slow one gives the person's
// allowance back and answers plainly instead of being cut off with no reply.
export const maxDuration = 300;
const MODEL_BUDGET_MS = 280_000;

// Content Studio analysis. Inputs: frames the browser sampled (the file never
// leaves the device), the transcript/caption the user typed, their goal, and
// the account's own top posts (first lines, formats, numbers and cover
// frames) so "compare to my winners" is grounded in real content, and the
// competitors' Reels that took off (lib/trendSignalsLoad.ts) so the draft is
// compared with them too. Output: a diagnosis, fixes in priority order with
// their evidence, a timestamped analysis, comparisons that cite real posts
// and three creative directions (lib/studioVerdict.ts). No retention curves,
// no virality odds, no platform-rule claims.

type Body = {
  kind: StudioKind; frames: string[]; frameTimes: number[]; durationSec: number; transcript?: string; caption?: string; goal?: GoalId | null; platform?: string | null;
  /** the video's sound, measured on the device from its samples */
  audio?: QuickAudio | null;
  /** the transcript as timestamped lines, when it was transcribed automatically */
  timedTranscript?: string | null;
  autoTranscript?: boolean;
  /** The planned post this draft is for; its concept and guide are read on the server. */
  plan?: { planId?: unknown; index?: unknown } | null;
};

/** Client numbers are the person's own measurements; keep them in range and finite. */
function cleanAudio(a: unknown): QuickAudio | null {
  if (!a || typeof a !== "object") return null;
  const x = a as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
  const levels = ["silent", "quiet", "ok", "loud", "unknown"] as const;
  const pauses = Array.isArray(x.pauses) ? (x.pauses as { start: unknown; end: unknown }[]).slice(0, 8).map((p) => ({ start: n(p.start, 0, 600) ?? 0, end: n(p.end, 0, 600) ?? 0 })).filter((p) => p.end > p.start) : [];
  return {
    durationSec: n(x.durationSec, 0, 600) ?? 0, hasAudio: Boolean(x.hasAudio),
    levelDb: n(x.levelDb, -120, 0), peakDb: n(x.peakDb, -120, 0),
    level: levels.includes(x.level as (typeof levels)[number]) ? (x.level as QuickAudio["level"]) : "unknown",
    audibleRatio: n(x.audibleRatio, 0, 1), silentOpeningSec: n(x.silentOpeningSec, 0, 600) ?? 0, longestPauseSec: n(x.longestPauseSec, 0, 600) ?? 0,
    pauses, bpm: n(x.bpm, 30, 260), bpmConfidence: n(x.bpmConfidence, 0, 1) ?? 0, musicLikely: Boolean(x.musicLikely),
  };
}

const SYSTEM = `You are SOCIA's content editor: a short-form video and social post editor who reviews drafts before they go live. Blunt, specific, useful, and honest about what you cannot see.

Hard rules:
- Judge only what is in the sampled frames, the measurements and the text you were given. Say "not assessable" (assessable=false, score 0) for audio only when there is neither a transcript nor a measurement of the sound; never guess sound beyond what the measurements and transcript show.
- The overall score is a creative readiness assessment of this draft, the editor's judgement of how ready it is to post. Never predict views, reach, virality or retention. Never state platform algorithm rules as facts; say "tends to" and "in your own top posts" instead.
- Every observation must reference a timestamp or something visible/readable. Every fix must be an instruction someone could execute today.
- Hooks, CTAs and on-screen text you propose are written lines in the account's voice, ready to use, no quotes around them, under 90 characters.
- Scores: be harsh. Most drafts land 55-75 overall. 85+ is rare. Score categories independently; the overall is your weighted judgement, dominated by the hook and clarity.
- "Compare to my winners" and "niche patterns" compare only against the material provided (the account's top posts and cover frames, the niche content list). If the material is missing, say so in the summary and return no rows.
- Lead with the decision. "diagnosis" is the single thing holding this draft back, in one plain sentence. Each fix names the problem, the change and the creative problem it addresses ("why"), never a predicted view count. "scoreAfter" is the editor's estimate of one creative score, nothing about views.
- Rank fixes by how much they hold the draft back, and say so in "priority": critical (it undermines the whole video), high, medium, or experiment. Scores that sit within a few points of each other tell the person nothing, so let the priorities carry the difference.
- Be honest about evidence. A pattern across fewer than eight posts, or one where the posts differ in other ways too (music against no music, for example), is never proof: give it priority "experiment", word it as a test over the next three comparable posts, and put it in "experiments". "confidence" is high only when the draft itself shows the problem plainly; a pattern across the account's posts is at most moderate; a small or mixed sample is low. "confidenceWhy" says what else could explain it.
- A fix's kind must match its problem. An ending that asks for too much or too little is an "ending" fix about the ask: never answer it with music or sound. Only suggest music as its own experiment.
- Cuts are real ranges: start before end, at least 0.3 seconds, inside the video. If nothing should be cut, return no edits.
- Sentinels: t=-1 when a moment has no timestamp; end=-1 when a fix is one moment; subjectAppearsAt=-1 when unknown; applyField="none" when a fix isn't a paste-able line; an empty cuts.edits array with suggestedSec=-1 when nothing should be cut (images: always).`;

/** A cover frame from Instagram's CDN only (the stored thumbnail URL is never trusted as is). */
function fetchB64(url: string): Promise<string | null> {
  if (!isPlatformMediaUrl(url)) return Promise.resolve(null);
  return fetchAllowed(url, isPlatformMediaUrl, { signal: AbortSignal.timeout(6000) })
    .then(async (r) => (r?.ok ? Buffer.from(await r.arrayBuffer()).toString("base64") : null))
    .catch(() => null);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Account context and the allowance are the active workspace owner's.
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Array.isArray(body.frames) || !body.frames.length) return NextResponse.json({ error: "No frames were sent." }, { status: 400 });
  if (body.frames.some((f) => typeof f !== "string" || f.length > LIMITS.frameChars)) return NextResponse.json({ error: "A frame is too large. Reload the page and analyse again." }, { status: 400 });
  const kind: StudioKind = body.kind === "image" || body.kind === "carousel" ? body.kind : "video";
  const duration = kind === "video" ? Math.max(1, Math.round(body.durationSec || 0)) : 0;
  const goal = GOALS.find((g) => g.id === body.goal) ?? null;
  // A draft of a planned post is reviewed against what was planned (Studio > Plan a post).
  const planned = body.plan && typeof body.plan.planId === "string" && Number.isInteger(body.plan.index)
    ? await planConcept(ctx, body.plan.planId, body.plan.index as number).catch(() => null)
    : null;
  const plannedText = planned
    ? `# What was planned for this post
${conceptPrompt(planned.concept)}${planned.guide ? `
Planned structure: ${planned.guide.structure.join(" > ")}
Planned openings: ${planned.guide.hooks.map((h) => h.text).join(" | ")}
Planned shots: ${planned.guide.shots.map((x) => x.shot).join("; ")}` : ""}`
    : "";
  const audio = kind === "video" ? cleanAudio(body.audio) : null;

  // Account context: profile + top posts + their cover frames (real content).
  const [profile, snap] = await Promise.all([getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null), getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null)]);
  const media: IgMediaItem[] = snap?.media ?? [];
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  const top: PostCard[] = [...posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 6);
  // Competitors' Reels that took off, the same read plans and ideas build on (lib/trendSignalsLoad.ts); none off the plan feature or when nothing is on file.
  const nicheReadP = competitorScopeId(ctx.client, ctx.workspace?.id).then((scope) => loadNicheRead(ctx.client, ctx.ownerId, scope, { location: profile?.brand_detail?.location ?? null })).catch(() => null);
  // What SOCIA recommended for earlier videos, what was applied and how those posts did (lib/raterLog.ts).
  const pastP = loadOutcomes(ctx).then(logEvidence).catch(() => "");
  const covers = (await Promise.all(top.map((p) => (p.thumb ? fetchB64(p.thumb) : Promise.resolve(null))))).map((b, i) => ({ b64: b, post: top[i] }));
  const rivals = ((await nicheReadP)?.proven ?? []).filter((r) => r.proven).slice(0, 6);
  // The posts a comparison may cite, each with its own link and published numbers (never the model's).
  const winnerPosts: PostRef[] = top.map((p, i) => ({
    id: `W${i + 1}`, title: displayTitle(p.caption).slice(0, 90), url: p.permalink, thumb: p.thumb, account: null,
    result: [p.views != null ? `${p.views.toLocaleString("en-US")} views` : null, `${p.engagements.toLocaleString("en-US")} interactions`, p.multiplier != null ? `${p.multiplier.toFixed(1)}x your median` : null].filter(Boolean).join(", "),
  }));
  const rivalPosts: PostRef[] = rivals.map((r) => ({
    id: r.id, title: (r.line ?? r.title ?? "").slice(0, 90), url: r.url, thumb: r.thumb,
    account: r.accountHandle ? `@${r.accountHandle.replace(/^@/, "")}` : r.accountName, result: refResult(r),
  }));
  const rivalCovers = (await Promise.all(rivals.slice(0, 3).map((r) => (r.thumb ? fetchB64(r.thumb) : Promise.resolve(null))))).filter((b): b is string => Boolean(b));
  let niche: { title: string | null; trend_tags: string[] | null; multiplier: number | null; account_name: string | null }[] = [];
  try {
    const { data } = await scopeToWorkspace(ctx.client.from("discovered_content").select("title, trend_tags, multiplier, account_name, data_source, relevance_reasons").eq("user_id", ctx.ownerId), await competitorScopeId(ctx.client, ctx.workspace?.id)).order("multiplier", { ascending: false, nullsFirst: false }).limit(40);
    niche = (data ?? []).filter(nicheVetted).slice(0, 8);
  } catch { niche = []; }

  const winnersText = top.length
    ? `The account's top ${top.length} posts by views (SOCIA's real data; the images after the draft's frames are their cover frames, in this order):\n${top.map((p, i) => `W${i + 1}. ${p.format} · "${displayTitle(p.caption).slice(0, 80)}" · ${p.views != null ? `${p.views.toLocaleString("en-US")} views` : "views not returned"}, ${p.engagements.toLocaleString("en-US")} interactions${p.multiplier != null ? ` (${p.multiplier.toFixed(1)}× median)` : ""} · caption ${p.caption.length} chars${/\?/.test(p.caption) ? ", asks a question" : ""}${/order|book|dm|link|tag|save|share/i.test(p.caption) ? ", has an ask" : ""}`).join("\n")}\nDerived: ${top.filter((p) => p.format === "Reel").length} of ${top.length} are Reels; median caption length ${median(top.map((p) => p.caption.length)) ?? 0} chars.`
    : "No account posts are synced, so there is nothing to compare the draft with (say so; return no compare rows).";
  const nicheText = niche.length
    ? `High-performing content SOCIA found in the niche (titles and detected features only; treat as observed patterns, not proof):\n${niche.map((n) => `- "${n.title ?? "(untitled)"}"${n.trend_tags?.length ? ` · features: ${n.trend_tags.join(", ")}` : ""}${n.multiplier != null ? ` · ${Number(n.multiplier).toFixed(1)}× the creator's median` : ""}`).join("\n")}`
    : "No niche content is on file (return an empty patterns list and say so).";
  const past = await pastP;
  const rivalsText = rivals.length
    ? `Competitors' Reels and Shorts that took off (SOCIA read these numbers from the platforms; each beat its own creator's usual by 1.5x or more, or passed 100,000 views; other accounts' results, not a prediction for this one):\n${rivals.map((r) => `${r.id}. ${r.platform} ${r.format} by ${r.accountHandle ? `@${r.accountHandle}` : r.accountName} · ${r.line ? `opens: "${r.line}"` : r.title ? `"${r.title.slice(0, 100)}"` : "no caption"} · ${refResult(r) || "no counts published"}${r.structures.length ? ` · hook structure: ${r.structures.join(", ")}` : ""}${r.topics.length ? ` · topic: ${r.topics.join(", ")}` : ""}`).join("\n")}`
    : "No competitor Reels are on file (return an empty competitors.rows list).";

  const images = [
    ...body.frames.slice(0, 10).map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
    ...covers.filter((c) => c.b64).map((c) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: c.b64! } })),
    ...rivalCovers.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
  ];
  const text = `Analyse this ${kind === "video" ? `${duration}-second short-form video` : kind === "carousel" ? `${body.frames.length}-image carousel` : "single image post"} for ${profile?.niche ? `a ${profile.niche} account` : "the account"}${profile?.brand_detail?.location ? ` in ${profile.brand_detail.location}` : ""}.
${kind === "video" ? `The first ${Math.min(10, body.frames.length)} images are frames sampled at these seconds: ${body.frameTimes.slice(0, 10).map((t) => t.toFixed(1)).join(", ")}.` : `The first ${body.frames.length} image(s) are the post itself.`}
${covers.filter((c) => c.b64).length ? `The next ${covers.filter((c) => c.b64).length} images are the cover frames of the account's top posts${covers.every((c) => c.b64) ? ` W1..W${covers.length}` : ` ${covers.map((c, i) => (c.b64 ? `W${i + 1}` : null)).filter(Boolean).join(", ")}`}, in that order.` : ""}
${rivalCovers.length ? `The last ${rivalCovers.length} image${rivalCovers.length === 1 ? " is the cover frame" : "s are the cover frames"} of the first competitor Reels listed below.` : ""}
Goal for this piece: ${goal ? `${goal.label} (prioritise ${goal.focus})` : "not set (judge generally)"}.
Intended platform: ${body.platform ?? "not chosen"}.
${audio ? `Measured sound (from the video's own samples, not estimated): ${describeQuickAudio(audio)}.` : kind === "video" ? "The video's sound could not be measured." : ""}
${body.transcript?.trim()
  ? body.autoTranscript && body.timedTranscript?.trim()
    ? `Transcript, transcribed automatically from the video's audio (timestamps are seconds into the video):\n"""\n${body.timedTranscript.trim().slice(0, 3000)}\n"""`
    : `Transcript / on-screen text the user provided:\n"""\n${body.transcript.trim().slice(0, 3000)}\n"""`
  : audio?.hasAudio ? "No speech was transcribed (there may be none): judge the sound from the measurements." : audio ? "There is no audible sound in the video." : "No transcript or on-screen text was provided and the sound could not be measured: mark audio not assessable and judge clarity from the frames alone."}
${body.caption?.trim() ? `Draft caption:\n"""\n${body.caption.trim().slice(0, 1500)}\n"""` : "No caption yet."}
${brandContext(profile?.brand_detail) || ""}
${profile?.goals ? `The account's overall goal: ${profile.goals}` : ""}

${plannedText}

${winnersText}

${nicheText}

${rivalsText}

${past ? `# What SOCIA recommended for this account's earlier videos, and what happened
${past}
Use this. Build on a change that was applied and did better than the account's usual, and say so in that fix's evidence.account. Do not push a change again as if it were new when it was applied and the post did at or below the usual: say what you would change about it this time. One post is never proof, and a pattern needs three settled posts: keep those words' caution.` : ""}

Return the JSON. Be brief: people scan this, and every word makes them wait. Unless a line below says otherwise, each text field is one sentence under 20 words, with no repeating what another field already says.
Requirements:
- diagnosis: one sentence, under 110 characters, naming the single thing holding the draft back.
- categories: all nine ids once; for ${kind === "video" ? "video" : "a still image"}${kind !== "video" ? " mark structure, pacing and audio assessable=false" : ""}. captions is assessable=false when no on-screen text is visible in the frames. goal judges fit with the goal${planned ? " and with what was planned" : ""}.
- strengths: up to 3 things that already work, each naming a timestamp or something visible.
- planFit: ${planned ? "two or three sentences on how the draft compares with what was planned: the concept, opening and structure, and what to change to deliver it." : "an empty string (nothing was planned)."}
- markers: 3-5 timestamped moments (issue / strong / pacing / cta / text)${kind !== "video" ? " (t=-1 for images)" : ""}.
- segments: the video's structure as 3-5 contiguous ranges covering 0 to ${duration}s with a rating and reason${kind !== "video" ? " (empty for images)" : ""}.
- topFixes: 3 to 5, most important first; when a fix is a line to paste (hook text, CTA, caption), fill applyField and applyValue. "title" is the change as an instruction (Fix your opening, Simplify the ending). "observed" is the problem as seen, with its time. "suggestion" is exactly what to do. "t" and "end" are the range it covers. "why" is the creative problem it addresses. "evidence.account" names which of W1.. support it (or ""), "evidence.niche" names which competitor Reels support it (or ""), with "confidence" and "confidenceWhy". "steps" is 2 or 3 short instructions in order, each starting with where it happens when it has a time ("At 0.0s, ..."), naming what is actually in the frames, the exact words, where they sit in the frame and how long they hold. "motion" is one sentence on how the line or shot should move, with timings (how it enters, holds and leaves); "" when nothing moves. "part" is the category this fix lifts most, and "scoreAfter" your estimate of that one category's score once the fix is made, higher than its score now and by no more than the fix can really earn. "aiPrompt", when an AI tool could make this change (a new opening shot, b-roll, an end card, a voice line, a music bed), is one complete prompt ready to paste, under 60 words, on the 2 fixes where it helps most at most: the subject as seen in the frames, framing, vertical 9:16, how it moves, light, length in seconds and any exact words on screen, with no invented prices, offers, people or results; "" when no AI tool is needed.
- hooks: 4 alternative opening lines in different styles (include local when a place is known). currentHook: the current opening line if one is visible or spoken, else "".
- ctaOptions: 3 endings that fit the goal. currentCta: the current ask if any, else "".
- onScreenText: opening, mid and CTA text with timestamps. Write it the way a person types on-screen text in the Instagram or TikTok text tool: a few plain words, sentence case or all lowercase, no hashtags, at most one emoji, no dashes, no marketing words (unlock, elevate, ultimate, journey, mouthwatering, game-changer and the like), under 45 characters${kind !== "video" ? " (t=-1)" : ""}.
- cuts: dead space, repeats, long setups${kind !== "video" ? " (none for images)" : ""}.
- audio: what the measured sound and the transcript show (level, a silent opening, long pauses, whether music or a beat is present, what is said and when), or that nothing can be assessed; then a recommended music direction and one alternative (style, BPM range, texture, why it fits the pacing and visuals). Never name a specific trending track.
- platformFit: Instagram Reels, TikTok, YouTube Shorts, each with a fit and a one-line reason grounded in length, opening and text.
- compare: 3 to 5 rows such as hook speed, subject visibility, people visible, text on screen, CTA, caption length, contrasting the draft with the winners' cover frames and captions; verdict per row; "refs" lists the ids (W1..) of the posts the row rests on; a two-sentence summary that says what the winners typically do and that it is a pattern, not a cause.
- competitors: ${rivals.length ? `3 or 4 rows contrasting the draft with the competitor Reels listed (how they open, their hook structure, format and length, topic, the ask), "theirs" saying what those Reels do, "refs" listing the ids (R1..) each row rests on, a verdict per row; "takeaways": up to 3 things from those Reels this draft could adopt in its own words; a two-sentence summary. Never reuse their wording, and never say the draft will match their numbers.` : "rows and takeaways empty, summary empty."}
- experiments: 0 to 2 signals worth testing, not acting on as fact (a small or mixed sample): the test, the hypothesis, what it rests on with the sample size, and how to run it over the next comparable posts.
- directions: exactly 3 different ways to remake this video (for example proof first, problem first, demonstration first), each with a name, the approach in a sentence, an opening line ready to use, a storyboard of exactly 3 short beats ("at" such as "0 to 2s", the shot, what is said), lengthSec, who it suits ("bestFor"), its tradeoff, and the evidence for trying it. Mark the one to test first with testFirst true and say why in its evidence. Never say which will perform best.
- niche: patterns observed in the niche list and how the draft compares, hedged.
- captionSuggestion: one caption in the account's voice with an ask that fits the goal.

Respond with ONLY one JSON object (no markdown fences, no preamble) in exactly this shape:
{"overall":0,"diagnosis":"","strengths":[""],"planFit":"","categories":[{"id":"hook|structure|pacing|clarity|visual|captions|audio|cta|goal","assessable":true,"score":0,"explanation":"","evidence":""}],"observed":{"subjectAppearsAt":0,"faceSeen":"yes|no|unknown","onScreenText":"yes|no|unknown","ctaDetected":"yes|no|unknown","summary":""},"markers":[{"t":0,"kind":"issue|strong|pacing|cta|text","label":""}],"segments":[{"start":0,"end":0,"label":"","rating":"weak|good|strong|needs","reason":""}],"topFixes":[{"title":"","priority":"critical|high|medium|experiment","observed":"","suggestion":"","why":"","kind":"opening|hook_text|ending|pacing|text|audio|visual|caption","t":0,"end":0,"applyField":"hook|cta|caption|onscreen|none","applyValue":"","steps":[""],"motion":"","part":"hook|structure|pacing|clarity|visual|captions|audio|cta|goal","scoreAfter":0,"aiPrompt":"","evidence":{"account":"","niche":"","confidence":"low|moderate|high","confidenceWhy":""}}],"currentHook":"","hooks":[{"style":"curiosity|direct|local|educational|challenge|story","text":""}],"currentCta":"","ctaOptions":[""],"onScreenText":[{"t":0,"text":"","role":"opening|mid|cta"}],"cuts":{"suggestedSec":0,"edits":[{"type":"remove|trim","start":0,"end":0,"reason":""}],"note":""},"audio":{"observed":"","direction":{"style":"","bpm":"","texture":"","why":""},"alternative":{"style":"","bpm":"","texture":"","why":""}},"platformFit":[{"platform":"Instagram Reels|TikTok|YouTube Shorts","fit":"strong|medium|weak","note":""}],"compare":{"rows":[{"label":"","current":"","winners":"","verdict":"better|similar|worse|unknown","refs":["W1"]}],"summary":""},"competitors":{"rows":[{"label":"","current":"","theirs":"","verdict":"better|similar|worse|unknown","refs":["R1"]}],"takeaways":[""],"summary":""},"experiments":[{"title":"","hypothesis":"","basis":"","how":""}],"directions":[{"name":"","approach":"","opening":"","storyboard":[{"at":"","shot":"","say":""}],"lengthSec":0,"bestFor":"","tradeoff":"","evidence":"","testFirst":false}],"niche":{"patterns":[""],"summary":""},"captionSuggestion":""}`;

  // One analysis per unit of the Content Studio allowance; counted right
  // before the model is called, and given back when no analysis comes back.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_studio");
  if (u.denied) return u.denied;

  try {
    // The full analysis schema is too large for structured outputs ("compiled
    // grammar is too large"), so the shape is given in the prompt and parsed
    // tolerantly; every field is mapped defensively below.
    const params = {
      model: MODEL,
      max_tokens: 20000,
      system: SYSTEM,
      // Medium, the model's own default: "high" made it think far longer than a rating is worth waiting for.
      output_config: effortFor(MODEL, "medium"),
      messages: [{ role: "user", content: [...images, { type: "text", text }] }],
    };
    const startedAt = Date.now();
    // output_config is newer than this SDK's types; it is sent as-is.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any, { signal: AbortSignal.timeout(MODEL_BUDGET_MS) });
    recordAiUsage(ctx.ownerId, "studio_analyze", res);
    // Counts only: how long ratings really take.
    console.log("[studio/analyze] done", JSON.stringify({ ms: Date.now() - startedAt, stop: res.stop_reason, outputTokens: res.usage?.output_tokens, textChars: res.content.reduce((n, b) => n + (b.type === "text" ? b.text.length : 0), 0), frames: body.frames.length }));
    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json({ error: "SOCIA declined to analyse this content." }, { status: 422 });
    }
    const block = res.content.find((b) => b.type === "text");
    const rawText = block && "text" in block ? block.text : "";
    let raw: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      const s0 = cleaned.indexOf("{"), e0 = cleaned.lastIndexOf("}");
      raw = JSON.parse(s0 === -1 || e0 <= s0 ? cleaned : cleaned.slice(s0, e0 + 1));
    } catch {
      await u.release();
      // Why it couldn't be read goes to the log (never the content).
      console.error(`[studio/analyze] unreadable response, stop ${res.stop_reason}, ${rawText.length} chars`);
      return NextResponse.json({ error: "The analysis came back incomplete. Try again." }, { status: 502 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any;
    const yn = (v: string): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
    const tOrNull = (t: number): number | null => (typeof t === "number" && t >= 0 ? Math.min(t, Math.max(0, duration)) : null);
    const ORDER: CategoryId[] = ["hook", "structure", "pacing", "clarity", "visual", "captions", "audio", "cta", "goal"];
    const categories = ORDER.map((id) => {
      const c = (r.categories ?? []).find((x: { id: string }) => x.id === id);
      const videoOnly = CATEGORY_INFO[id].video_only;
      const assessable = c ? Boolean(c.assessable) && !(videoOnly && kind !== "video") : false;
      return { id, score: assessable ? Math.max(0, Math.min(100, Math.round(c.score))) : null, explanation: c?.explanation ?? (assessable ? "" : "Not assessable from what was provided."), evidence: c?.evidence ?? "", fix: c?.fix ?? "" };
    });
    const overall = Math.max(0, Math.min(100, Math.round(r.overall ?? 0)));
    const analysis: StudioAnalysis = {
      kind, durationSec: kind === "video" ? duration : null,
      score: { overall, label: SCORE_LABEL(overall) },
      categories,
      observed: { subjectAppearsAt: tOrNull(r.observed?.subjectAppearsAt), faceSeen: yn(r.observed?.faceSeen), onScreenText: yn(r.observed?.onScreenText), ctaDetected: yn(r.observed?.ctaDetected), summary: r.observed?.summary ?? "" },
      markers: kind === "video" ? (r.markers ?? []).filter((m: { t: number }) => typeof m.t === "number" && m.t >= 0).map((m: { t: number; kind: string; label: string }) => ({ t: Math.min(m.t, duration), kind: m.kind, label: m.label })).slice(0, 8) : [],
      segments: kind === "video" ? (r.segments ?? []).map((s: { start: number; end: number; label: string; rating: string; reason: string }) => ({ start: Math.max(0, s.start), end: Math.min(duration, s.end), label: s.label, rating: s.rating, reason: s.reason })).filter((s: { start: number; end: number }) => s.end > s.start).slice(0, 8) : [],
      topFixes: byPriority((r.topFixes ?? []).slice(0, 5).map((f: { title: string; observed: string; suggestion: string; kind: string; t: number; applyField: string; applyValue: string }, i: number) => {
        const t = tOrNull(f.t);
        return { title: f.title, observed: f.observed, suggestion: f.suggestion, kind: f.kind, t, apply: f.applyField && f.applyField !== "none" && f.applyValue ? { field: f.applyField, value: f.applyValue } : null, ...cleanFixExtras(f, i, t, duration, Object.fromEntries(categories.map((c) => [c.id, c.score]))) };
      })),
      hooks: { current: r.currentHook || null, options: (r.hooks ?? []).slice(0, 5) },
      cta: { current: r.currentCta || null, options: (r.ctaOptions ?? []).slice(0, 4) },
      onScreenText: (r.onScreenText ?? []).flatMap((o: { t: number; text: string; role: string }) => {
        const text = humanText(o.text ?? "");
        return text ? [{ t: kind === "video" ? Math.max(0, Math.min(duration, o.t)) : 0, text, role: o.role }] : [];
      }).slice(0, 6),
      // Only ranges the editor can really cut: inside the video, start before end, long enough to matter.
      cuts: kind === "video" && r.cuts && validCuts(r.cuts.edits, duration).length ? { currentSec: duration, suggestedSec: r.cuts.suggestedSec > 0 ? Math.round(r.cuts.suggestedSec) : duration, edits: validCuts<{ type: "remove" | "trim"; start: number; end: number; reason: string }>(r.cuts.edits, duration).slice(0, 6), note: r.cuts.note ?? "" } : null,
      audio: r.audio ?? { observed: "", direction: { style: "", bpm: "", texture: "", why: "" }, alternative: { style: "", bpm: "", texture: "", why: "" } },
      platformFit: (r.platformFit ?? []).slice(0, 3),
      compare: top.length && r.compare?.rows?.length ? { basis: `your top ${top.length} posts by views and their cover frames`, rows: r.compare.rows.slice(0, 7).map((row: { refs?: unknown }) => ({ ...row, refs: citedIds(row.refs, winnerPosts) })), summary: r.compare.summary ?? "", sample: top.length, posts: winnerPosts } : null,
      diagnosis: typeof r.diagnosis === "string" ? r.diagnosis.replace(/\s+/g, " ").trim().slice(0, 160) : "",
      competitors: cleanCompetitors(r.competitors, rivalPosts, `${rivalPosts.length} Reel${rivalPosts.length === 1 ? "" : "s"} that took off for accounts in your niche`),
      experiments: cleanExperiments(r.experiments),
      directions: kind === "video" ? cleanDirections(r.directions) : [],
      niche: niche.length && r.niche?.patterns?.length ? { basis: `${niche.length} high-performing posts SOCIA found in your niche`, patterns: r.niche.patterns.slice(0, 6), summary: r.niche.summary ?? "" } : null,
      caption: { current: body.caption?.trim() || null, suggestion: r.captionSuggestion || null },
      strengths: (Array.isArray(r.strengths) ? r.strengths : []).filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3),
      planFit: planned && typeof r.planFit === "string" && r.planFit.trim() ? { title: planned.concept.title, summary: r.planFit.trim().slice(0, 600) } : null,
      meta: { frames: body.frames.length, hadTranscript: Boolean(body.transcript?.trim()), analyzedAt: new Date().toISOString(), version: 1, audioMeasured: Boolean(audio), autoTranscript: Boolean(body.autoTranscript && body.transcript?.trim()) },
      measuredAudio: audio,
    };
    return NextResponse.json({ analysis, usage: u.usage });
  } catch (err) {
    await u.release();
    if ((err as Error)?.name === "APIUserAbortError" || (err as Error)?.name === "TimeoutError") {
      console.error(`[studio/analyze] stopped after ${MODEL_BUDGET_MS} ms`);
      return NextResponse.json({ error: "The analysis took too long and was stopped. It didn't use up an analysis. Try again in a moment.", kind: "timeout" }, { status: 504 });
    }
    const kind2 = aiFailure("studio/analyze", err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind2], kind: kind2 }, { status: kind2 === "rate_limited" ? 429 : 502 });
  }
}
