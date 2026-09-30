import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import { postCards, displayTitle, type PostCard } from "@/lib/overview";
import { GOALS, SCORE_LABEL, type StudioAnalysis, type StudioKind, type GoalId, type CategoryId } from "@/lib/studio";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext, brandWorkspace } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 120;

// Content Studio analysis. Inputs: frames the browser sampled (the file never
// leaves the device), the transcript/caption the user typed, their goal, and
// the account's own top posts (first lines, formats, numbers and cover
// frames) so "compare to my winners" is grounded in real content. Output:
// a scored, explainable, timestamped analysis. No retention curves, no
// virality odds, no platform-rule claims.

type Body = { kind: StudioKind; frames: string[]; frameTimes: number[]; durationSec: number; transcript?: string; caption?: string; goal?: GoalId | null; platform?: string | null };

const SYSTEM = `You are SOCIA's content editor: a short-form video and social post editor who reviews drafts before they go live. Blunt, specific, useful, and honest about what you cannot see.

Hard rules:
- Judge only what is in the sampled frames and the text you were given. Say "not assessable" (assessable=false, score 0) for audio when no transcript or on-screen text was provided; never guess sound.
- Never predict views, reach, virality or retention. Never state platform algorithm rules as facts; say "tends to" and "in your own top posts" instead.
- Every observation must reference a timestamp or something visible/readable. Every fix must be an instruction someone could execute today.
- Hooks, CTAs and on-screen text you propose are written lines in the account's voice, ready to use, no quotes around them, under 90 characters.
- Scores: be harsh. Most drafts land 55-75 overall. 85+ is rare. Score categories independently; the overall is your weighted judgement, dominated by the hook and clarity.
- "Compare to my winners" and "niche patterns" compare only against the material provided (the account's top posts and cover frames, the niche content list). If the material is missing, say so in the summary and return no rows.
- Sentinels: t=-1 when a moment has no timestamp; subjectAppearsAt=-1 when unknown; applyField="none" when a fix isn't a paste-able line; an empty cuts.edits array with suggestedSec=-1 when nothing should be cut (images: always).`;

function fetchB64(url: string): Promise<string | null> {
  return fetch(url, { signal: AbortSignal.timeout(6000) }).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()).toString("base64") : null)).catch(() => null);
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
  const kind: StudioKind = body.kind === "image" || body.kind === "carousel" ? body.kind : "video";
  const duration = kind === "video" ? Math.max(1, Math.round(body.durationSec || 0)) : 0;
  const goal = GOALS.find((g) => g.id === body.goal) ?? null;

  // Account context: profile + top posts + their cover frames (real content).
  const [profile, snap] = await Promise.all([getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null), getIgSnapshot(ctx.client, ctx.ownerId).catch(() => null)]);
  const media: IgMediaItem[] = snap?.media ?? [];
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  const top: PostCard[] = [...posts].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 6);
  const covers = (await Promise.all(top.map((p) => (p.thumb ? fetchB64(p.thumb) : Promise.resolve(null))))).map((b, i) => ({ b64: b, post: top[i] }));
  let niche: { title: string | null; trend_tags: string[] | null; multiplier: number | null; account_name: string | null }[] = [];
  try {
    const { data } = await ctx.client.from("discovered_content").select("title, trend_tags, multiplier, account_name").eq("user_id", ctx.ownerId).order("multiplier", { ascending: false, nullsFirst: false }).limit(8);
    niche = data ?? [];
  } catch { niche = []; }

  const winnersText = top.length
    ? `The account's top ${top.length} posts by views (SOCIA's real data; the images after the draft's frames are their cover frames, in this order):\n${top.map((p, i) => `W${i + 1}. ${p.format} · "${displayTitle(p.caption).slice(0, 80)}" · ${p.views != null ? `${p.views.toLocaleString("en-US")} views` : "views not returned"}, ${p.engagements.toLocaleString("en-US")} interactions${p.multiplier != null ? ` (${p.multiplier.toFixed(1)}× median)` : ""} · caption ${p.caption.length} chars${/\?/.test(p.caption) ? ", asks a question" : ""}${/order|book|dm|link|tag|save|share/i.test(p.caption) ? ", has an ask" : ""}`).join("\n")}\nDerived: ${top.filter((p) => p.format === "Reel").length} of ${top.length} are Reels; median caption length ${median(top.map((p) => p.caption.length)) ?? 0} chars.`
    : "No account posts are synced, so there is nothing to compare the draft with (say so; return no compare rows).";
  const nicheText = niche.length
    ? `High-performing content SOCIA found in the niche (titles and detected features only; treat as observed patterns, not proof):\n${niche.map((n) => `- "${n.title ?? "(untitled)"}"${n.trend_tags?.length ? ` · features: ${n.trend_tags.join(", ")}` : ""}${n.multiplier != null ? ` · ${Number(n.multiplier).toFixed(1)}× the creator's median` : ""}`).join("\n")}`
    : "No niche content is on file (return an empty patterns list and say so).";

  const images = [
    ...body.frames.slice(0, 10).map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
    ...covers.filter((c) => c.b64).map((c) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: c.b64! } })),
  ];
  const text = `Analyse this ${kind === "video" ? `${duration}-second short-form video` : kind === "carousel" ? `${body.frames.length}-image carousel` : "single image post"} for ${profile?.niche ? `a ${profile.niche} account` : "the account"}${profile?.brand_detail?.location ? ` in ${profile.brand_detail.location}` : ""}.
${kind === "video" ? `The first ${Math.min(10, body.frames.length)} images are frames sampled at these seconds: ${body.frameTimes.slice(0, 10).map((t) => t.toFixed(1)).join(", ")}.` : `The first ${body.frames.length} image(s) are the post itself.`}
${covers.filter((c) => c.b64).length ? `The remaining ${covers.filter((c) => c.b64).length} images are the cover frames of the account's top posts W1..W${covers.filter((c) => c.b64).length}, in that order.` : ""}
Goal for this piece: ${goal ? `${goal.label} (prioritise ${goal.focus})` : "not set (judge generally)"}.
Intended platform: ${body.platform ?? "not chosen"}.
${body.transcript?.trim() ? `Transcript / on-screen text the user provided:\n"""\n${body.transcript.trim().slice(0, 3000)}\n"""` : "No transcript or on-screen text was provided: mark audio not assessable and judge clarity from the frames alone."}
${body.caption?.trim() ? `Draft caption:\n"""\n${body.caption.trim().slice(0, 1500)}\n"""` : "No caption yet."}
${brandContext(profile?.brand_detail) || ""}
${profile?.goals ? `The account's overall goal: ${profile.goals}` : ""}

${winnersText}

${nicheText}

Return the JSON. Requirements:
- categories: all six ids once; for ${kind === "video" ? "video" : "a still image"}${kind !== "video" ? " mark pacing and audio assessable=false" : ""}.
- markers: 3-6 timestamped moments (issue / strong / pacing / cta / text)${kind !== "video" ? " (t=-1 for images)" : ""}.
- segments: the video's structure as 3-6 contiguous ranges covering 0 to ${duration}s with a rating and reason${kind !== "video" ? " (empty for images)" : ""}.
- topFixes: exactly 3, ranked by impact; when a fix is a line to paste (hook text, CTA, caption), fill applyField and applyValue.
- hooks: 4-5 alternative opening lines in different styles (include local when a place is known). currentHook: the current opening line if one is visible or spoken, else "".
- ctaOptions: 3 endings that fit the goal. currentCta: the current ask if any, else "".
- onScreenText: opening, mid and CTA text with timestamps${kind !== "video" ? " (t=-1)" : ""}.
- cuts: dead space, repeats, long setups${kind !== "video" ? " (none for images)" : ""}.
- audio: what you can observe about sound from the transcript (or that nothing can be), then a recommended music direction and one alternative (style, BPM range, texture, why it fits the pacing and visuals). Never name a specific trending track.
- platformFit: Instagram Reels, TikTok, YouTube Shorts, each with a fit and a one-line reason grounded in length, opening and text.
- compare: rows such as hook speed, subject visibility, people visible, text on screen, CTA, caption length, contrasting the draft with the winners' cover frames and captions; verdict per row; a two-sentence summary that says what the winners typically do.
- niche: patterns observed in the niche list and how the draft compares, hedged.
- captionSuggestion: one caption in the account's voice with an ask that fits the goal.

Respond with ONLY one JSON object (no markdown fences, no preamble) in exactly this shape:
{"overall":0,"categories":[{"id":"hook|pacing|clarity|visual|cta|audio","assessable":true,"score":0,"explanation":"","evidence":"","fix":""}],"observed":{"subjectAppearsAt":0,"faceSeen":"yes|no|unknown","onScreenText":"yes|no|unknown","ctaDetected":"yes|no|unknown","summary":""},"markers":[{"t":0,"kind":"issue|strong|pacing|cta|text","label":""}],"segments":[{"start":0,"end":0,"label":"","rating":"weak|good|strong|needs","reason":""}],"topFixes":[{"title":"","observed":"","suggestion":"","kind":"opening|hook_text|ending|pacing|text|audio|visual|caption","t":0,"applyField":"hook|cta|caption|onscreen|none","applyValue":""}],"currentHook":"","hooks":[{"style":"curiosity|direct|local|educational|challenge|story","text":""}],"currentCta":"","ctaOptions":[""],"onScreenText":[{"t":0,"text":"","role":"opening|mid|cta"}],"cuts":{"suggestedSec":0,"edits":[{"type":"remove|trim","start":0,"end":0,"reason":""}],"note":""},"audio":{"observed":"","direction":{"style":"","bpm":"","texture":"","why":""},"alternative":{"style":"","bpm":"","texture":"","why":""}},"platformFit":[{"platform":"Instagram Reels|TikTok|YouTube Shorts","fit":"strong|medium|weak","note":""}],"compare":{"rows":[{"label":"","current":"","winners":"","verdict":"better|similar|worse|unknown"}],"summary":""},"niche":{"patterns":[""],"summary":""},"captionSuggestion":""}`;

  // One analysis per unit of the Content Studio allowance; counted right
  // before the model is called, and given back when no analysis comes back.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_studio");
  if (u.denied) return u.denied;

  try {
    // The full analysis schema is too large for structured outputs ("compiled
    // grammar is too large"), so the shape is given in the prompt and parsed
    // tolerantly; every field is mapped defensively below.
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM,
      messages: [{ role: "user", content: [...images, { type: "text", text }] }],
    });
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
      return NextResponse.json({ error: "The analysis came back unreadable. Try again." }, { status: 502 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = raw as any;
    const yn = (v: string): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
    const tOrNull = (t: number): number | null => (typeof t === "number" && t >= 0 ? Math.min(t, Math.max(0, duration)) : null);
    const ORDER: CategoryId[] = ["hook", "pacing", "clarity", "visual", "cta", "audio"];
    const categories = ORDER.map((id) => {
      const c = (r.categories ?? []).find((x: { id: string }) => x.id === id);
      const videoOnly = id === "pacing" || id === "audio";
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
      topFixes: (r.topFixes ?? []).slice(0, 3).map((f: { title: string; observed: string; suggestion: string; kind: string; t: number; applyField: string; applyValue: string }) => ({ title: f.title, observed: f.observed, suggestion: f.suggestion, kind: f.kind, t: tOrNull(f.t), apply: f.applyField && f.applyField !== "none" && f.applyValue ? { field: f.applyField, value: f.applyValue } : null })),
      hooks: { current: r.currentHook || null, options: (r.hooks ?? []).slice(0, 5) },
      cta: { current: r.currentCta || null, options: (r.ctaOptions ?? []).slice(0, 4) },
      onScreenText: (r.onScreenText ?? []).map((o: { t: number; text: string; role: string }) => ({ t: kind === "video" ? Math.max(0, Math.min(duration, o.t)) : 0, text: o.text, role: o.role })).slice(0, 6),
      cuts: kind === "video" && r.cuts && Array.isArray(r.cuts.edits) && r.cuts.edits.length ? { currentSec: duration, suggestedSec: r.cuts.suggestedSec > 0 ? Math.round(r.cuts.suggestedSec) : duration, edits: r.cuts.edits.slice(0, 6), note: r.cuts.note ?? "" } : null,
      audio: r.audio ?? { observed: "", direction: { style: "", bpm: "", texture: "", why: "" }, alternative: { style: "", bpm: "", texture: "", why: "" } },
      platformFit: (r.platformFit ?? []).slice(0, 3),
      compare: top.length && r.compare?.rows?.length ? { basis: `your top ${top.length} posts by views and their cover frames`, rows: r.compare.rows.slice(0, 7), summary: r.compare.summary ?? "", sample: top.length } : null,
      niche: niche.length && r.niche?.patterns?.length ? { basis: `${niche.length} high-performing posts SOCIA found in your niche`, patterns: r.niche.patterns.slice(0, 6), summary: r.niche.summary ?? "" } : null,
      caption: { current: body.caption?.trim() || null, suggestion: r.captionSuggestion || null },
      meta: { frames: body.frames.length, hadTranscript: Boolean(body.transcript?.trim()), analyzedAt: new Date().toISOString(), version: 1 },
    };
    return NextResponse.json({ analysis, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind2 = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind2], kind: kind2 }, { status: kind2 === "rate_limited" ? 429 : 502 });
  }
}
