import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { buildAskEvidence } from "@/lib/askContext";
import { askAnswerSchema, type AskAnswer, type AskContext, type ModelAnswer, type AskProposal } from "@/lib/ask";
import { requireUsage } from "@/lib/planGuard";
import { getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import { rangeDays } from "@/lib/overview";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { isMissingColumnError } from "@/lib/workspaces";

export const runtime = "nodejs";
export const maxDuration = 60;

// Ask SOCIA, in context. The page and object the user is looking at arrive
// with the question; the server assembles verified evidence for them and the
// model answers in labelled parts. Actions are mapped to real routes here;
// the model never writes a URL.

type Msg = { role: "user" | "assistant"; content: string };

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
    case "content_plan": return `/tool?note=${q(note)}`;
    case "calendar": return `/calendar?compose=1${note ? `&caption=${q(note)}` : ""}`;
    case "analytics": return `/analytics#${["overview", "content", "audience", "times", "growth"].includes(note) ? note : "overview"}`;
    case "content": return "/analytics#content";
    case "competitors": return "/competitors";
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
  const askCtx: AskContext = { page: "global", ...(body.context ?? {}) };
  const messages = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12);
  while (messages.length && messages[0].role === "assistant") messages.shift();
  if (!messages.length) return NextResponse.json({ error: "No message to send." }, { status: 400 });

  // The evidence window is the client's choice, but never longer than the
  // plan's analytics history.
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (askCtx.range && rangeDays(askCtx.range) > maxHistoryDays(ent)) askCtx.range = "30";

  const ev = await buildAskEvidence(ctx.client, ctx.ownerId, askCtx, ctx.workspace?.id ?? null, brandWorkspace(ctx));
  const first = messages[0];
  const convo: Msg[] = [{ role: "user", content: `${ev.evidence}\n\n# The user's question\n${first.content}` }, ...messages.slice(1)];

  // One question per unit of the Ask SOCIA allowance; counted right before
  // the model is called, and given back when the call produces no answer.
  const u = await requireUsage(ctx.client, ctx.ownerId, "ask_socia", { ent });
  if (u.denied) return u.denied;

  try {
    const params = {
      model: MODEL,
      max_tokens: 2000,
      system: ev.system,
      output_config: { format: { type: "json_schema", schema: askAnswerSchema } },
      messages: convo,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
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
      const convRow = { user_id: ctx.ownerId, title, messages: [...messages, { role: "assistant", content: answer.text }] };
      const saved = ctx.workspace
        ? await ctx.client.from("conversations").insert({ ...convRow, workspace_id: ctx.workspace.id })
        : await ctx.client.from("conversations").insert(convRow);
      if (saved.error && ctx.workspace && isMissingColumnError(saved.error)) await ctx.client.from("conversations").insert(convRow); // column not migrated yet
    } catch { /* history is optional */ }

    return NextResponse.json({ answer, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
