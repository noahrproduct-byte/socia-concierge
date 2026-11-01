import { NextResponse } from "next/server";
import { LIMITS, clipDeep, tooLongResponse } from "@/lib/inputLimits";
import { anthropic, MODEL, effortFor, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
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
import { isMissingColumnError } from "@/lib/workspaces";

export const runtime = "nodejs";
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
Never work out or state the times yourself: SOCIA calculates them and shows the list for the person to confirm. In "text", say in one sentence what you understood. A post listed as "Can't be moved" stays where it is. When they aren't asking to schedule, want is false, posts [], videos [], collaborators [], strings "", numbers 0, times [], trialReel "unchanged" and trialShare "default".`;

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
  // Earlier turns are context SOCIA re-sends: trimmed, never refused.
  for (const m of messages) m.content = m.content.slice(0, LIMITS.historyMessage);

  // The evidence window is the client's choice, but never longer than the
  // plan's analytics history.
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (askCtx.range && rangeDays(askCtx.range) > maxHistoryDays(ent)) askCtx.range = "30";

  const wsId = ctx.workspace?.id ?? null;
  const tz = zoneOr(askCtx.tz);
  const nowDate = new Date();
  const [ev, sched] = await Promise.all([
    buildAskEvidence(ctx.client, ctx.ownerId, askCtx, wsId, brandWorkspace(ctx)),
    loadSchedulable(ctx.client, ctx.ownerId, wsId, nowDate).catch(() => ({ posts: [] as Schedulable[], others: [] })),
  ]);
  const nowLocal = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }).format(nowDate);
  const rated = sanitizeRated(askCtx.rated);
  delete askCtx.rated;
  const ratedEvidence = ratedBlock(rated, nowDate);
  const schedEvidence = `# Posts SOCIA can schedule or move (the user's time zone is ${tz}; it is now ${nowLocal})\n${schedulableBlock(sched.posts, tz, new Set((Array.isArray(askCtx.newPosts) ? askCtx.newPosts : []).filter((x): x is string => typeof x === "string")))}${ratedEvidence ? `\n\n${ratedEvidence}` : ""}`;
  const first = messages[0];
  const convo: Msg[] = [{ role: "user", content: `${ev.evidence}\n\n${schedEvidence}\n\n# The user's question\n${first.content}` }, ...messages.slice(1)];
  // A follow-up needs the current list too: it may have changed since the first turn.
  if (convo.length > 1 && convo[convo.length - 1].role === "user") convo[convo.length - 1] = { role: "user", content: `${schedEvidence}\n\n# The user's message\n${convo[convo.length - 1].content}` };

  // One question per unit of the Ask SOCIA allowance; counted right before
  // the model is called, and given back when the call produces no answer.
  const u = await requireUsage(ctx.client, ctx.ownerId, "ask_socia", { ent });
  if (u.denied) return u.denied;

  try {
    const params = {
      model: MODEL,
      max_tokens: 2000,
      system: `${ev.system}\n${SCHEDULE_RULES}`,
      output_config: { format: { type: "json_schema", schema: askAnswerSchema }, ...effortFor(MODEL) },
      messages: convo,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    recordAiUsage(ctx.ownerId, "ask", res);
    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json({ error: "SOCIA can't help with that one. Try rephrasing." }, { status: 422 });
    }
    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? parseJson(block.text) : null;
    if (!raw) {
      await u.release();
      return NextResponse.json({ error: "SOCIA returned something unreadable. Try again." }, { status: 502 });
    }

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
      const chosen = picked.length || ratedPicked.length ? [...Array.from(new Set(picked)), ...ratedPicked] : sched.posts.filter((p) => p.status === "draft");
      const movable = chosen.filter((p) => !p.fixed);
      const left = chosen.filter((p) => p.fixed).map((p) => ({ title: p.title, reason: p.fixed! }));
      const gate = checkFeature(ent, "scheduling");
      let blocked = false;
      if (!can(ctx, "publish")) { blocked = true; left.unshift({ title: "Scheduling", reason: "Only the brand's owner or an admin can schedule posts." }); }
      else if (!gate.ok) { blocked = true; left.unshift({ title: "Scheduling", reason: gate.error.error }); }
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
          items: plan.slots.map((s) => { const p = byId.get(s.id)!; return { postId: p.id, title: p.title, status: p.status, from: p.at, at: s.at, reason: s.reason, platforms: p.platforms, legacy: p.legacy, ...(p.id.startsWith("rated:") ? { rated: p.id.slice(6) } : {}) }; }),
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
    const answer: AskAnswer = {
      text: clean(raw.text),
      observed: (raw.observed ?? []).slice(0, 5).map(clean),
      derived: (raw.derived ?? []).slice(0, 4).map(clean),
      interpretation: clean(raw.interpretation),
      recommendation: clean(raw.recommendation),
      actions: (raw.actions ?? []).map((a) => ({ label: a.label, href: hrefFor(a.type, a.note ?? "", post) })).filter((a): a is { label: string; href: string } => Boolean(a.href) && Boolean(a.label)).slice(0, 3),
      proposals,
      post: post ? { id: post.id, title: post.title, thumb: post.thumb, stat: post.views != null ? `${post.views.toLocaleString("en-US")} views` : `${post.engagements.toLocaleString("en-US")} interactions`, permalink: post.permalink } : null,
    };

    // Keep a record in the workspace's history (best-effort), so nothing the
    // strategist said is lost.
    try {
      const title = `${askCtx.page}: ${first.content.slice(0, 44)}`;
      // A chat is the person's own: saved under the viewer with their own
      // session, never in the workspace owner's history (a guest's questions
      // used to land there, readable by the owner and across brands).
      const convRow = { user_id: ctx.viewerId, title, messages: [...messages, { role: "assistant", content: answer.text }] };
      const saved = ctx.workspace && ctx.isOwner
        ? await supabase.from("conversations").insert({ ...convRow, workspace_id: ctx.workspace.id })
        : await supabase.from("conversations").insert(convRow);
      if (saved.error && ctx.workspace && ctx.isOwner && isMissingColumnError(saved.error)) await supabase.from("conversations").insert(convRow); // column not migrated yet
    } catch { /* history is optional */ }

    return NextResponse.json({ answer, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
