import { NextResponse } from "next/server";
import { LIMITS, clipDeep, tooLongResponse } from "@/lib/inputLimits";
import { anthropic, modelFor, effortFor, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { partialStringField } from "@/lib/assistant/streamText";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { recordAiUsage } from "@/lib/aiUsage";
import { createClient } from "@/lib/supabase/server";
import { buildAskEvidence } from "@/lib/askContext";
import { askAnswerSchema, type AskAnswer, type AskContext, type ModelAnswer, type AskProposal } from "@/lib/ask";
import { requireUsage } from "@/lib/planGuard";
import { checkFeature, getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import { formatOf, rangeDays } from "@/lib/overview";
import { resolveContext, brandWorkspace, can } from "@/lib/context";
import { getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { loadSchedulable, schedulableBlock, type Schedulable } from "@/lib/assistant/schedulable";
import { planReschedule } from "@/lib/assistant/reschedule";
import { instagramAsk, ratedBlock, sanitizeRated } from "@/lib/assistant/askExtras";
import { fileLabel, postLabel } from "@/lib/publishing/postLabel";
import { competitorScopeId, isMissingColumnError } from "@/lib/workspaces";
import { intentBlock, linkIn, planSources } from "@/lib/research/intent";
import { readIntent } from "@/lib/research/readIntent";
import { gatherResearch, type Research } from "@/lib/research/gather";
import { buildResearch } from "@/lib/research/answer";
import { guessIntent, type SourcePlan } from "@/lib/research/intent";
import { briefBlock, checkDraft, formatRule, nextBrief, readTurn, repairNote, sanitizeBrief, type Problem } from "@/lib/assistant/brief";
import { CREATIVE_STYLES, directionBlock, sanitizeDirection } from "@/lib/research/direction";
import { prefsLine, recordChoice } from "@/lib/creativePrefs";
import { currentDetail } from "@/lib/intel/understandLoad";
import { falseClaimsIn, productBlock } from "@/lib/socia/productKnowledge";

export const runtime = "nodejs";

/** An answer as a chat turn: its text, plus what it wrote, so a follow-up ("make it shorter") can see it. */
const withDraft = (a: { text: string; draft?: { title: string; body: string } | null }) => (a.draft ? `${a.text}\n\n${a.draft.title}:\n${a.draft.body}` : a.text);

/** The provider's own reason, in the server log only: the reply keeps the
 *  plain sentence, but "couldn't be reached" alone can't be diagnosed. */
function logAskFailure(where: string, kind: string, err: unknown) {
  const e = err as { status?: number; error?: { error?: { type?: string; message?: string } }; message?: string } | null;
  const detail = e?.error?.error?.message ?? e?.message ?? String(err);
  console.error(`[ask] ${where} failed (${kind})`, e?.status ?? "", e?.error?.error?.type ?? "", detail.slice(0, 500));
}
export const maxDuration = 60;

// Ask SOCIA, in context. The page and object the user is looking at arrive
// with the question; the server assembles verified evidence for them and the
// model answers in labelled parts. Actions are mapped to real routes here;
// the model never writes a URL.

type Msg = { role: "user" | "assistant"; content: string };

/** A real IANA zone from the browser, or UTC. */
function zoneOr(tz: unknown): string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "UTC"; }
}

const SCHEDULE_RULES = `Scheduling: when the user asks to schedule, post, spread out, space out or move posts, set schedule.want to true and fill it from their words:
- posts: the [S#] numbers of the posts they mean, in the order they want them. "These clips", "the videos I just made" or "my drafts" means the drafts listed (newest first, made together); when some drafts are marked "added in this chat", "these", "them" and "the footage" mean exactly those. Empty means every draft listed.
- startLocal: when they named a start, "YYYY-MM-DDTHH:MM" in their time zone, or "YYYY-MM-DD" for a day without a time; "" when they didn't.
- spacingMinutes: a gap between posts they asked for ("2 hours each" = 120, "every 30 minutes" = 30); 0 otherwise.
- perDay: how many a day they asked for; 0 otherwise.
- times: times of day they named, as 24-hour "HH:MM"; [] otherwise.
- days: how many days the run may cover when they gave a limit ("for the rest of the week" = the days from the start up to and including Sunday); 0 otherwise.
- videos: the [V#] refs of videos they rated in Content Studio that they mean ("the video I just rated" = the latest one; "the ones I rated" = all of them); [] otherwise. A rated video isn't a post yet; scheduling saves it as one. posts and videos can both be filled.
- trialReel: "yes" when they ask for a Trial Reel, "no" when they ask for a normal Reel instead of a trial, "unchanged" otherwise. trialShare: "manual" when they say they'll share it to followers themselves, "if_performing" when they say to share it if it does well, "default" otherwise.
- collaborators: the Instagram usernames they name as collaborators, exactly as they wrote them; never add one they didn't write. [] otherwise.
- ideas: when they ask to fill the calendar with ideas, planned videos or posts they'll film or make later (not posts they already have), one entry per post: title (2 to 6 words), hook (the first line they'd say or show), concept (one sentence: what to film). Write them for this brand from its data, varied, each easy to make. As many as they asked for ("2 a day for a week" = 14; "fill my week" = their saved posts-a-week pace, else 5), at most 21. Leave posts [] unless they also mean existing drafts. [] otherwise.
Never work out or state the times yourself: SOCIA calculates them and shows the list for the person to confirm. In "text", say in one sentence what you understood. A post listed as "Can't be moved" stays where it is. When they aren't asking to schedule, want is false, posts [], videos [], collaborators [], ideas [], strings "", numbers 0, times [], trialReel "unchanged" and trialShare "default".`;

const RESEARCH_RULES = `Research answers: when the evidence has "Comparable public videos SOCIA found" (or the request is to make content, study a niche, plan a week or recreate a reference), fill "research"; otherwise approach "", examples [], why "", test "", steps [].
- Base the answer on the request and the research, not on the user's past posts. Use the user's own posts only when the evidence lists them and they genuinely help.
- approach: the recommended approach in at most two sentences.
- examples: 3 or 4 videos by their [R#], each in a different creative style, so the person has a real choice of direction (never four near-identical videos; fewer when the list doesn't hold different styles). For each: style, one of ${CREATIVE_STYLES.map((s) => `${s.id} (${s.label})`).join(", ")}, as best read from its title, length and numbers; why it is relevant to this request in one short line; techniques: 1 to 3 specific techniques worth adapting (an opening move, a structure, a pacing or caption choice), read from what is known about it, never invented detail. No numbers in these lines, SOCIA shows them. Never refer to a video that isn't listed; never say you watched one (SOCIA read titles and numbers only), and only call one viral when its numbers show it far above its creator's usual. List first the example whose style fits this request best.
- When the person hasn't chosen a direction yet and you write a script now, write it in the first example's style and say so in "text" in a few words; the person can choose another direction below. Never hold the script back for a choice.
- why: one to three sentences on what recurs across the examples and how the approach uses it. Keep apart what was observed (a pattern in these titles or numbers) from your reading of it, and never present correlation as cause. When no examples were found, say so here and that the approach rests on general practice.
- test: how to judge it after posting, in one or two sentences (what to compare, after how long).
- steps: 1 to 3 of content_plan (add it to their plan), writer (write the post in Create Post), editor (make the video in the Video editor), idea (save it as a calendar draft), with a short label.
- For a video or pitch request also write the script in "draft", in the parts the deliverable rule for this message asks for. Each request gets its own structure from its research; never reuse one template. The research informs the script; it never replaces or crowds it.
- "text" stays one sentence; observed, derived, interpretation and recommendation stay empty unless they add something the card doesn't.`;

const NO_RESEARCH = `Research: none ran for this message, so "research" stays empty (approach "", examples [], why "", test "", steps []). Never refer to example videos.`;

const BRIEF_RULES = `brief: the creative brief after this message, for the piece of content being worked on: contentType, topic, audience, platform, goal, hook (the exact opening line when the person set or approved one, else ""), duration, mustInclude (the features, products or talking points that have to be in it, by their real names), tone, structure, cta. Start from the brief given and change only what the latest message changes; never drop a requirement the person set unless they dropped it. When the message isn't about a piece of content, return the brief given unchanged, or every field "" and [] when there is none.`;

/** No outside research and only a summary of the account: for a message that continues the current piece. */
const CONTINUE_SOURCES: SourcePlan = { account: "summary", external: false, niche: false, competitors: false, reference: false, post: false, why: "Continuing the piece already in this chat." };

/** What is said under an answer a check couldn't fully fix: never a silent problem. */
function noticeFor(problems: Problem[]): string | null {
  if (problems.some((p) => p.kind === "incomplete" || p.kind === "missing")) return "This may not be complete. Ask for it again in full.";
  const claim = problems.find((p): p is Extract<Problem, { kind: "claim" }> => p.kind === "claim");
  return claim ? `Check this before using it: ${claim.detail}` : null;
}

function parseJson(text: string): ModelAnswer | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
}

function hrefFor(type: string, note: string, post: { permalink: string | null } | null): string | null {
  const q = (s: string) => encodeURIComponent(s.slice(0, 400));
  switch (type) {
    case "content_plan": return `/plan?note=${q(note)}`;
    case "calendar": return `/plan/calendar?compose=1${note ? `&caption=${q(note)}` : ""}`;
    case "analytics": return `/analytics#${["overview", "content", "audience", "times", "growth"].includes(note) ? note : "overview"}`;
    case "content": return "/analytics#content";
    case "competitors": return "/discover";
    case "studio": return "/studio";
    case "reports": return "/reports";
    case "post": return post?.permalink ?? null;
    default: return null;
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Evidence, the plan's history window and the allowance are the active
  // workspace owner's; a member's question is answered from, and charged to,
  // the workspace they are in.
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  let body: { context?: AskContext; messages?: Msg[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  // The page context goes into the prompt: bounded in size and shape so one
  // question can't carry a huge prompt for the price of one unit.
  if (body.context != null && JSON.stringify(body.context).length > LIMITS.askContextChars) return tooLongResponse("The page context", LIMITS.askContextChars);
  const askCtx: AskContext = { page: "global", ...((clipDeep(body.context ?? {}) as AskContext | null) ?? {}) };
  const messages = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12);
  while (messages.length && messages[0].role === "assistant") messages.shift();
  if (!messages.length) return NextResponse.json({ error: "No message to send." }, { status: 400 });
  const latest = messages[messages.length - 1];
  if (latest.role === "user" && latest.content.length > LIMITS.question) return tooLongResponse("Your question", LIMITS.question);
  // Earlier turns are context SOCIA re-sends: trimmed, never refused. SOCIA's own turns carry the script
  // being revised, so they keep more: a script trimmed here was a script the next answer couldn't keep.
  for (const m of messages) m.content = m.content.slice(0, m.role === "assistant" ? LIMITS.historyMessage * 4 : LIMITS.historyMessage);
  // The brief SOCIA returned last turn, and what this message asks for against it (lib/assistant/brief.ts).
  const prevBrief = sanitizeBrief(askCtx.brief);
  delete askCtx.brief;
  // The creative direction chosen from a gallery in this chat (lib/research/direction.ts), kept for every later message.
  const direction = sanitizeDirection(askCtx.direction);
  const choseNow = askCtx.choseNow === true && Boolean(direction);
  const moreRefs = (Array.isArray(askCtx.moreRefs) ? askCtx.moreRefs : []).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 12);
  delete askCtx.direction; delete askCtx.choseNow; delete askCtx.moreRefs;
  const hasWork = Boolean(prevBrief) || messages.slice(0, -1).some((m) => m.role === "assistant" && /(?:^|\n)\s*(?:Say|Your lines|Film)\s*:/i.test(m.content));

  // The evidence window is the client's choice, but never longer than the
  // plan's analytics history.
  // The reads run together. Only a page that names its own range (Analytics)
  // has to wait for the plan first, to keep that range inside its history.
  const wsId = ctx.workspace?.id ?? null;
  const tz = zoneOr(askCtx.tz);
  const nowDate = new Date();
  const entP = getEntitlements(ctx.client, ctx.ownerId);
  // One question per unit of the Ask SOCIA allowance, counted before any model
  // call (reading the request is one) and given back when no answer comes.
  const u = await requireUsage(ctx.client, ctx.ownerId, "ask_socia", { ent: await entP });
  if (u.denied) return u.denied;
  // What this request is about, then the evidence it needs (lib/research).
  const earlierUser = messages.slice(0, -1).filter((m) => m.role === "user").map((m) => m.content).slice(-2).join(" | ");
  const latestText = latest.role === "user" ? latest.content : "";
  const read = readTurn(latestText, { hasWork, brief: prevBrief });
  // Choosing a direction rewrites the current piece in it (or writes it, when there is none yet); asking
  // for different examples is research for the same piece.
  const turn = choseNow ? (hasWork ? "revise" : "new") : moreRefs.length ? "new" : read.turn;
  let deliverable = choseNow ? (prevBrief?.output && prevBrief.output !== "research" ? prevBrief.output : "full_script") : moreRefs.length ? "research" : read.deliverable;
  // A message that continues the current piece ("more storytelling", "only the lines", "again, complete")
  // needs no new research: running it again is what brought the same examples back every turn.
  const continuing = turn === "revise" || turn === "format" || turn === "again" || choseNow;
  // Different examples for the same piece: search from the brief, not from "show me others".
  const aboutPiece = [prevBrief?.topic, prevBrief?.contentType].filter(Boolean).join(" ");
  const intent = continuing
    ? { ...guessIntent(latestText, { page: askCtx.page }), kind: "create_content" as const, queries: [] }
    : moreRefs.length && aboutPiece
      ? (await readIntent({ ownerId: ctx.ownerId, question: `Find comparable short videos for: ${aboutPiece}`, earlier: earlierUser, page: askCtx.page, brand: ctx.workspace?.name ?? "" })).intent
      : (await readIntent({ ownerId: ctx.ownerId, question: latestText, earlier: earlierUser, page: askCtx.page, brand: ctx.workspace?.name ?? "" })).intent;
  const sources = continuing ? CONTINUE_SOURCES : planSources(intent, { linkInQuestion: Boolean(linkIn(latestText)), page: askCtx.page });
  // Where the words alone weren't clear, the model's read of a new request settles what to write.
  if (!continuing && deliverable === "answer") {
    if (intent.kind === "create_content" && /\b(script|reel|video|short|tiktok|pitch)\b/i.test(latestText) && !/\bideas?\b/i.test(latestText)) deliverable = "full_script";
    else if (intent.kind === "niche_research" || intent.kind === "reference_style") deliverable = "research";
  }
  const researchP: Promise<Research> = (sources.external || sources.niche || sources.reference)
    ? competitorScopeId(ctx.client, wsId).catch(() => wsId).then((scopeId) => gatherResearch({ client: ctx.client, ownerId: ctx.ownerId, scopeId, question: latestText, intent, plan: sources, now: new Date(), exclude: moreRefs }))
      .catch(() => ({ evidence: "", examples: [], notes: ["The research couldn't run this time."], reference: null }))
    : Promise.resolve({ evidence: "", examples: [], notes: [], reference: null });
  const schedP = loadSchedulable(ctx.client, ctx.ownerId, wsId, nowDate).catch(() => ({ posts: [] as Schedulable[], others: [] }));
  const evidenceFor = () => buildAskEvidence(ctx.client, ctx.ownerId, askCtx, wsId, brandWorkspace(ctx), sources).catch(async (e) => { await u.release(); throw e; });
  let ent: Awaited<typeof entP>;
  let ev: Awaited<ReturnType<typeof evidenceFor>>;
  if (askCtx.range) {
    ent = await entP;
    if (rangeDays(askCtx.range) > maxHistoryDays(ent)) askCtx.range = "30";
    ev = await evidenceFor();
  } else {
    [ent, ev] = await Promise.all([entP, evidenceFor()]);
  }
  const sched = await schedP;
  const research = await researchP;
  const researchEvidence = [intentBlock(intent, sources), research.evidence, research.notes.length ? `# What SOCIA could and couldn't research\n${research.notes.map((x) => `- ${x}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  const nowLocal = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(nowDate);
  const rated = sanitizeRated(askCtx.rated);
  delete askCtx.rated;
  const ratedEvidence = ratedBlock(rated, nowDate);
  const schedEvidence = `# Posts SOCIA can schedule or move (the user's time zone is ${tz}; it is now ${nowLocal})\n${schedulableBlock(sched.posts, tz, new Set((Array.isArray(askCtx.newPosts) ? askCtx.newPosts : []).filter((x): x is string => typeof x === "string")))}${ratedEvidence ? `\n\n${ratedEvidence}` : ""}`;
  const first = messages[0];
  const researchOn = !continuing && (sources.external || sources.niche || sources.reference);
  // What this message asks for: the brief so far and the one deliverable to write (lib/assistant/brief.ts).
  // A choice is kept on the brand (best-effort) so later galleries can start from the styles this person picks.
  if (choseNow && direction?.refs.length) void recordChoice(ctx, direction.refs.map((r) => r.style));
  const prefs = researchOn ? prefsLine((await currentDetail(ctx).catch(() => null))?.creative) : "";
  const turnBlock = [briefBlock(prevBrief), directionBlock(direction), prefs, choseNow ? "The person just chose this direction: rewrite the piece in it now, complete." : "", `# What to write for this message\n${formatRule(deliverable, turn)}`].filter(Boolean).join("\n\n");
  const convo: Msg[] = [{ role: "user", content: `${ev.evidence}\n\n${schedEvidence}\n\n${messages.length === 1 ? `${researchEvidence}\n\n${turnBlock}\n\n` : ""}# The user's question\n${first.content}` }, ...messages.slice(1)];
  // A follow-up needs the current list too (it may have changed since the first turn). A new request in
  // the same chat is researched for itself; a message that continues the current piece gets no research.
  if (convo.length > 1 && convo[convo.length - 1].role === "user") convo[convo.length - 1] = { role: "user", content: `${schedEvidence}\n\n${researchOn ? `${researchEvidence}\n\n` : ""}${turnBlock}\n\n# The user's message\n${convo[convo.length - 1].content}` };


  const model = modelFor("ask");
  const params = {
    model,
    // Room for a full script in "draft", the rest of the answer and the model's thinking (which counts
    // toward this limit): at 4,000 long scripts ran out. An answer that still hits it is caught below.
    max_tokens: 16000,
    system: `${ev.system}\n${productBlock()}\n${researchOn ? RESEARCH_RULES : NO_RESEARCH}\n${BRIEF_RULES}\n${SCHEDULE_RULES}`,
    output_config: { format: { type: "json_schema", schema: askAnswerSchema }, ...effortFor(model, "medium") },
    messages: convo,
  };

  // From the finished model message to the answer (or an error response).
  const answerFrom = async (first: Message): Promise<Response> => {
  try {
    let res = first;
    recordAiUsage(ctx.ownerId, "ask", res);
    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json({ error: "SOCIA can't help with that one. Try rephrasing." }, { status: 422 });
    }
    const textOf = (m: Message) => { const b = m.content.find((x) => x.type === "text"); return b && "text" in b ? b.text : ""; };
    // An answer stopped by the output limit is never shown as if it were whole.
    if (res.stop_reason === "max_tokens") {
      await u.release();
      console.error("[ask] answer hit max_tokens", res.usage?.output_tokens ?? "");
      return NextResponse.json({ error: "SOCIA's answer ran too long and was cut off before the end, so it isn't shown. Try again, or ask for a shorter version.", kind: "cut_off" }, { status: 502 });
    }
    let raw = parseJson(textOf(res));
    if (!raw) {
      await u.release();
      return NextResponse.json({ error: "SOCIA returned something unreadable. Try again." }, { status: 502 });
    }
    // Checks before it is shown (lib/assistant/brief.ts): the deliverable asked for is there, complete, in
    // the format asked for, and says nothing false about SOCIA. What can be fixed here is fixed here; what
    // can't gets one repair pass, a second model call only when a check fails.
    const wantsDraft = deliverable !== "research" && deliverable !== "answer";
    const check = (r: ModelAnswer) => checkDraft(r.draft && r.draft.kind !== "none" ? r.draft.body ?? "" : "", wantsDraft ? deliverable : "answer", falseClaimsIn);
    let checked = check(raw);
    let problems: Problem[] = checked.problems.filter((p) => wantsDraft || p.kind === "claim");
    const textClaims = falseClaimsIn(raw.text ?? "").map((detail) => ({ kind: "claim" as const, detail }));
    problems = [...problems, ...textClaims];
    if (problems.length) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const again = await anthropic.messages.create({ ...params, messages: [...convo, { role: "assistant", content: textOf(res) }, { role: "user", content: repairNote(problems, deliverable) }] } as any) as Message;
        recordAiUsage(ctx.ownerId, "ask", again);
        const fixedRaw = again.stop_reason === "end_turn" ? parseJson(textOf(again)) : null;
        if (fixedRaw) {
          const re = check(fixedRaw);
          const left = [...re.problems.filter((p) => wantsDraft || p.kind === "claim"), ...falseClaimsIn(fixedRaw.text ?? "").map((detail) => ({ kind: "claim" as const, detail }))];
          if (left.length < problems.length) { raw = fixedRaw; res = again; checked = re; problems = left; }
        }
      } catch (e) { logAskFailure("repair", aiFailureKind(e), e); }
    }
    console.info("[ask] turn", JSON.stringify({ turn, deliverable, research: researchOn, fixed: checked.fixed, problems: problems.map((p) => p.kind) }));
    // Research belongs only to a turn that ran it: a revision never brings the examples back.
    if (!researchOn && raw.research) raw.research = { approach: "", examples: [], why: "", test: "", steps: [] };

    const post = raw.postId ? ev.posts.find((p) => p.id === raw.postId) ?? null : null;
    const proposals: AskProposal[] = [];
    for (const p of raw.proposals ?? []) {
      if (p.kind === "plan_day" && askCtx.page === "plan" && ev.plan && ev.plan.data.weeklyPlan?.[p.index]) {
        const cur = ev.plan.data.weeklyPlan[p.index];
        proposals.push({ kind: "plan_day", planId: ev.plan.id, index: p.index, day: cur.day, current: { concept: cur.concept, hook: cur.hook, format: cur.format, rationale: cur.rationale }, proposed: { concept: p.concept, hook: p.hook, format: p.format || cur.format, rationale: p.rationale }, why: p.why });
      } else if (p.kind === "text" && p.field !== "none" && p.options?.length) {
        proposals.push({ kind: "text", field: p.field, label: p.label || p.field, options: p.options.slice(0, 5) });
      }
    }
    // Scheduling: the model says which posts and what rule; the times are worked out here.
    if (raw.schedule?.want) {
      const want = raw.schedule;
      const byN = new Map(sched.posts.map((p) => [p.n, p]));
      const picked = (want.posts ?? []).map((n) => byN.get(n)).filter((p): p is Schedulable => Boolean(p));
      // Rated videos become posts on confirm: listed here as drafts with no platforms yet.
      const byRef = new Map(rated.map((v) => [v.ref, v]));
      const ratedPicked = Array.from(new Set((want.videos ?? []).filter((r) => typeof r === "string" && byRef.has(r.replace(/^\[|\]$/g, ""))).map((r) => r.replace(/^\[|\]$/g, "")))).map((ref) => {
        const v = byRef.get(ref)!;
        return { n: 0, id: `rated:${ref}`, title: postLabel(v.caption, []) ?? fileLabel(v.name) ?? "Your rated video", status: "draft" as const, at: null, createdAt: v.ratedAt, platforms: [], legacy: false, fixed: null } satisfies Schedulable;
      });
      // New video ideas: drafts with no media yet, made on confirm (any plan may save drafts).
      const ideaList = (want.ideas ?? []).filter((x) => x && (x.hook?.trim() || x.concept?.trim())).slice(0, 21);
      const ideaById = new Map(ideaList.map((x, i) => [`idea:${i}`, { hook: x.hook.trim().slice(0, 300), concept: x.concept.trim().slice(0, 600) }]));
      const ideaPicked = ideaList.map((x, i) => ({ n: 0, id: `idea:${i}`, title: (x.title || x.hook).trim().slice(0, 80) || "Video idea", status: "draft" as const, at: null, createdAt: nowDate.toISOString(), platforms: [], legacy: false, fixed: null }) satisfies Schedulable);
      const named = picked.length || ratedPicked.length;
      const chosen = named || ideaPicked.length ? [...Array.from(new Set(picked)), ...ratedPicked, ...ideaPicked] : sched.posts.filter((p) => p.status === "draft");
      let movable = chosen.filter((p) => !p.fixed);
      const left = chosen.filter((p) => p.fixed).map((p) => ({ title: p.title, reason: p.fixed! }));
      const gate = checkFeature(ent, "scheduling");
      let blocked = false;
      if (!can(ctx, "publish")) { blocked = true; left.unshift({ title: "Scheduling", reason: "Only the brand's owner or an admin can schedule posts." }); }
      else if (!gate.ok) { blocked = true; left.unshift({ title: "Scheduling", reason: gate.error.error }); }
      // Ideas are saved as drafts, which every plan and role may do: they still go on the calendar.
      if (blocked && ideaPicked.length) {
        movable = movable.filter((p) => p.id.startsWith("idea:"));
        blocked = false;
        // Only ideas were asked for: the scheduling note doesn't apply to them.
        if (!named) left.shift();
      }
      if (!blocked && movable.length) {
        const ids = new Set(movable.map((p) => p.id));
        const needsHistory = !(want.spacingMinutes > 0) && !(want.times ?? []).length;
        const snap = needsHistory ? await getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null) : null;
        const history = snap ? (snap.media ?? []).filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) })) : null;
        const plan = planReschedule({
          posts: movable.map((p) => ({ id: p.id, title: p.title })),
          rule: { startLocal: want.startLocal || null, spacingMinutes: Math.max(0, want.spacingMinutes | 0), perDay: Math.max(0, Math.min(8, want.perDay | 0)), times: (want.times ?? []).slice(0, 8), days: Math.max(0, Math.min(60, want.days | 0)) },
          existing: sched.others.filter((o) => !ids.has(o.id)), history, now: nowDate, tz,
        });
        const byId = new Map(movable.map((p) => [p.id, p]));
        proposals.push({
          kind: "schedule", summary: plan.summary,
          items: plan.slots.map((s) => { const p = byId.get(s.id)!; return { postId: p.id, title: p.title, status: p.status, from: p.at, at: s.at, reason: s.reason, platforms: p.platforms, legacy: p.legacy, ...(p.id.startsWith("rated:") ? { rated: p.id.slice(6) } : {}), ...(ideaById.has(p.id) ? { idea: ideaById.get(p.id)! } : {}) }; }),
          left: [...left, ...plan.unplaced.map((u) => ({ title: byId.get(u.id)?.title ?? "A post", reason: u.reason }))],
          instagram: instagramAsk({ trialReel: want.trialReel, trialShare: want.trialShare, collaborators: want.collaborators ?? [] }, latest.role === "user" ? latest.content : ""),
        });
      } else {
        proposals.push({ kind: "schedule", summary: blocked ? "Nothing can be scheduled from here." : "There's nothing here SOCIA can schedule.", items: [], left });
      }
    }
    // Post ids are for the model's postId field, never for prose; and the
    // product's copy rule (no em dashes) applies to SOCIA's answers too.
    const clean = (t: string) => (t ?? "").replace(/\[\d{6,}\]\s*/g, "").replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, " to ").trim();
    const draftBody = raw.draft && raw.draft.kind !== "none" ? checked.body : "";
    const answer: AskAnswer = {
      text: clean(raw.text),
      research: buildResearch({
        raw: raw.research, kind: intent.kind, examples: research.examples, notes: research.notes, clean,
        seed: clean(raw.research?.approach ?? "") || clean(raw.text),
        caption: /^Caption:\s*(.+(?:\n(?!\s*\n)(?![A-Z][a-z]+:).+)*)/m.exec(draftBody)?.[1]?.trim() ?? null,
      }),
      observed: (raw.observed ?? []).slice(0, 5).map(clean),
      derived: (raw.derived ?? []).slice(0, 4).map(clean),
      interpretation: clean(raw.interpretation),
      recommendation: clean(raw.recommendation),
      actions: (raw.actions ?? []).map((a) => ({ label: a.label, href: hrefFor(a.type, a.note ?? "", post) })).filter((a): a is { label: string; href: string } => Boolean(a.href) && Boolean(a.label)).slice(0, 3),
      proposals,
      post: post ? { id: post.id, title: post.title, thumb: post.thumb, stat: post.views != null ? `${post.views.toLocaleString("en-US")} views` : `${post.engagements.toLocaleString("en-US")} interactions`, permalink: post.permalink } : null,
      // Never cut short here: the old 4,000-character cap ended long scripts mid-line without a word.
      draft: raw.draft && raw.draft.kind !== "none" && draftBody.trim()
        ? {
            kind: deliverable === "spoken_lines" ? "script" : raw.draft.kind,
            title: deliverable === "spoken_lines" ? "Your lines" : clean(raw.draft.title).slice(0, 80) || "Draft",
            body: draftBody.replace(/\s*—\s*/g, ", ").replace(/\r/g, "").trim().slice(0, 24000),
            seconds: checked.seconds,
          }
        : null,
      brief: nextBrief(prevBrief, sanitizeBrief({ ...(raw.brief ?? {}), output: deliverable }), turn, deliverable, latestText),
      deliverable,
      // "Photos of your place" only for a business people visit, under a script that films somewhere.
      placeScan: ev.placeFilming && Boolean(draftBody) && /^\s*Film\s*:/im.test(draftBody),
      notice: noticeFor(problems),
    };

    // Keep a record in the workspace's history (best-effort), so nothing the
    // strategist said is lost.
    try {
      const title = `${askCtx.page}: ${first.content.slice(0, 44)}`;
      // A chat is the person's own: saved under the viewer with their own
      // session, never in the workspace owner's history (a guest's questions
      // used to land there, readable by the owner and across brands).
      const convRow = { user_id: ctx.viewerId, title, messages: [...messages, { role: "assistant", content: withDraft(answer) }] };
      const saved = ctx.workspace && ctx.isOwner
        ? await supabase.from("conversations").insert({ ...convRow, workspace_id: ctx.workspace.id })
        : await supabase.from("conversations").insert(convRow);
      if (saved.error && ctx.workspace && ctx.isOwner && isMissingColumnError(saved.error)) await supabase.from("conversations").insert(convRow); // column not migrated yet
    } catch { /* history is optional */ }

    return NextResponse.json({ answer, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind = aiFailureKind(err);
    logAskFailure("answer", kind, err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
  };

  // Streamed as lines of JSON: {"type":"text"} with the answer's text so far,
  // while the model writes, then one {"type":"answer"} (or {"type":"error"})
  // with exactly what the non-streamed reply used to carry.
  const enc = new TextEncoder();
  const streamBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A reader that has gone away (tab closed, request aborted) must not stop
      // the answer: the model is already paid for, so it finishes and is counted.
      let open = true;
      const send = (o: unknown) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { open = false; }
      };
      const close = () => { if (!open) return; open = false; try { controller.close(); } catch { /* already closed */ } };
      let res: Message | null = null;
      let stream: { currentMessage?: Message } | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = anthropic.messages.stream(params as any);
        stream = s;
        let json = "", shown = "";
        s.on("text", (delta: string) => {
          json += delta;
          const t = partialStringField(json, "text");
          if (t != null && t.length > shown.length) { shown = t; send({ type: "text", text: t }); }
        });
        res = await s.finalMessage();
      } catch (err) {
        // A stream that broke part-way was billed for what it had read and written.
        if (stream?.currentMessage) recordAiUsage(ctx.ownerId, "ask", stream.currentMessage);
        await u.release();
        const kind = aiFailureKind(err);
        logAskFailure("stream", kind, err);
        send({ type: "error", status: kind === "rate_limited" ? 429 : 502, error: AI_UNAVAILABLE_COPY[kind], kind });
        close();
        return;
      }
      const out = await answerFrom(res);
      const j = await out.json().catch(() => ({ error: "SOCIA couldn't answer right now." }));
      send(out.ok ? { type: "answer", ...j } : { type: "error", status: out.status, ...j });
      close();
    },
  });
  return new Response(streamBody, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
