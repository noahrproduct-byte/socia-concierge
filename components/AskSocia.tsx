"use client";

// The one contextual AI pattern: a small "Ask SOCIA" entry point that opens a
// drawer which already knows the page and the object on screen. Answers come
// back in labelled parts (observed / derived / SOCIA's read / recommendation)
// with real actions and, where the page allows, proposals the user applies.
//
// Two ways in: <AskSociaButton> for a local entry point that can apply
// proposals (Content Plan, Content Studio), and the global <AskHost> in the
// top bar, which also catches every legacy "/chat?q=" link and answers in
// place instead of sending the user to a separate page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Send, ArrowRight, Check, Copy, RotateCcw } from "lucide-react";
import Drawer from "./ov/Drawer";
import { ASK_EVENT, ASK_PAGE_LABEL, ASK_SUGGESTIONS, pageForPath, type AskAnswer, type AskContext, type AskEvent, type AskMessage, type AskProposal } from "@/lib/ask";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import PlanNotice, { UsageLine } from "./PlanNotice";

type ProposalHandler = (p: AskProposal, choice?: string) => Promise<boolean | void> | boolean | void;

export function contextChips(ctx: AskContext, label?: string | null): string[] {
  const out = [ASK_PAGE_LABEL[ctx.page]];
  if (label) out.push(label);
  if (ctx.competitorName && !label) out.push(ctx.competitorName);
  if (ctx.planDay && !label) out.push(ctx.planDay);
  if (ctx.range) out.push(`Last ${ctx.range === "365" ? "12 months" : `${ctx.range} days`}`);
  if (ctx.metric) out.push(ctx.metric[0].toUpperCase() + ctx.metric.slice(1));
  return out;
}

type AskResult =
  | { ok: true; answer: AskAnswer; usage: UsageSnapshot | null }
  | { ok: false; planError: PlanError };

/** Throws on ordinary failures; a plan limit comes back as a result so the drawer can render the notice. */
async function askApi(context: AskContext, messages: AskMessage[]): Promise<AskResult> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, messages: messages.map((m) => ({ role: m.role, content: m.content })) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isPlanError(json)) return { ok: false, planError: json };
    throw new Error(json.error ?? "SOCIA couldn't answer right now.");
  }
  return { ok: true, answer: json.answer as AskAnswer, usage: (json.usage as UsageSnapshot | undefined) ?? null };
}

function AnswerView({ a, onProposal, applied, setApplied }: { a: AskAnswer; onProposal?: ProposalHandler; applied: Record<string, string>; setApplied: (k: string, v: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setCopied(s); setTimeout(() => setCopied(null), 1200); } catch { /* no clipboard */ } };
  return (
    <div className="ask-answer">
      {a.text && <p className="ask-text">{a.text}</p>}
      {a.observed.length > 0 && <div className="ov-why-block"><small>Observed</small><ul>{a.observed.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
      {a.post && (
        <a className="ask-post" href={a.post.permalink ?? "#"} target={a.post.permalink ? "_blank" : undefined} rel="noreferrer">
          {a.post.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.post.thumb} alt="" />
          ) : <span className="ov-card-ph" />}
          <span><b>“{a.post.title}”</b><em>{a.post.stat}</em></span>
        </a>
      )}
      {a.derived.length > 0 && <div className="ov-why-block"><small>Derived</small><ul>{a.derived.map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
      {a.interpretation && <div className="ov-why-block ai"><small>SOCIA's interpretation</small><p>{a.interpretation}</p></div>}
      {a.recommendation && <div className="ov-why-block rec"><small>Recommendation</small><p>{a.recommendation}</p></div>}
      {a.proposals.map((p, i) => {
        const key = `${p.kind}-${i}`;
        if (p.kind === "plan_day") {
          const done = applied[key];
          return (
            <div key={key} className="ask-proposal">
              <small>Suggested update · {p.day}</small>
              <div className="ask-diff">
                <div><em>Current</em><b>{p.current.concept}</b><span>Hook: “{p.current.hook}”</span></div>
                <div className="new"><em>New</em><b>{p.proposed.concept}</b><span>Hook: “{p.proposed.hook}”</span><span>Format: {p.proposed.format}</span></div>
              </div>
              {p.why && <p className="ask-why">{p.why}</p>}
              <div className="ask-proposal-actions">
                {onProposal ? (
                  <button type="button" className={`ov-btn ${done ? "ghost" : "primary"} small`} disabled={Boolean(done)} onClick={async () => { const ok = await onProposal(p); if (ok !== false) setApplied(key, "applied"); }}>{done ? <><Check size={12} /> Applied</> : "Apply change"}</button>
                ) : (
                  <Link href="/tool" className="ov-btn primary small">Open Content Plan <ArrowRight size={12} /></Link>
                )}
              </div>
            </div>
          );
        }
        return (
          <div key={key} className="ask-proposal">
            <small>{p.label}</small>
            <ol className="ask-options">
              {p.options.map((opt, j) => (
                <li key={j}>
                  <span>{opt}</span>
                  <span className="ask-opt-actions">
                    {onProposal && <button type="button" className={`ov-btn ${applied[key] === opt ? "ghost" : "primary"} small`} onClick={async () => { const ok = await onProposal(p, opt); if (ok !== false) setApplied(key, opt); }}>{applied[key] === opt ? <><Check size={12} /> In use</> : "Use"}</button>}
                    <button type="button" className="ov-btn ghost small" onClick={() => copy(opt)} aria-label="Copy">{copied === opt ? <Check size={12} /> : <Copy size={12} />}</button>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {a.actions.length > 0 && (
        <div className="ask-actions">
          {a.actions.map((ac) => <Link key={ac.href + ac.label} href={ac.href} className="ov-btn ghost small">{ac.label} <ArrowRight size={12} /></Link>)}
        </div>
      )}
    </div>
  );
}

export function AskDrawer({ open, onClose, context, contextLabel, suggestions, initialQuestion, autoSend = false, onProposal, title = "Ask SOCIA" }: {
  open: boolean; onClose: () => void; context: AskContext; contextLabel?: string | null; suggestions?: string[]; initialQuestion?: string | null; autoSend?: boolean; onProposal?: ProposalHandler; title?: string;
}) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [applied, setAppliedState] = useState<Record<string, string>>({});
  const setApplied = useCallback((k: string, v: string) => setAppliedState((s) => ({ ...s, [k]: v })), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastKey = useRef<string>("");
  const chips = useMemo(() => contextChips(context, contextLabel), [context, contextLabel]);
  const sugg = suggestions ?? ASK_SUGGESTIONS[context.page];

  const send = useCallback(async (text: string, base?: AskMessage[]) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: AskMessage[] = [...(base ?? messages), { role: "user", content: q }];
    setMessages(next); setInput(""); setBusy(true); setError(null); setPlanError(null);
    try {
      const r = await askApi(context, next);
      if (!r.ok) { setPlanError(r.planError); return; }
      const a = r.answer;
      if (r.usage) setUsage(r.usage);
      setMessages([...next, { role: "assistant", content: a.text, answer: a }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SOCIA couldn't answer right now.");
    } finally { setBusy(false); }
  }, [busy, messages, context]);

  // A new question arriving from outside (a link, the dashboard box) starts a
  // fresh thread for that context; the same one twice doesn't resend.
  useEffect(() => {
    if (!open) return;
    const key = `${JSON.stringify(context)}|${initialQuestion ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setMessages([]); setError(null); setPlanError(null); setAppliedState({});
    if (initialQuestion) {
      if (autoSend) send(initialQuestion, []); else setInput(initialQuestion);
    } else setInput("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context, initialQuestion, autoSend]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);

  return (
    <Drawer open={open} title={title} onClose={onClose} width={520}>
      <div className="ask">
        <div className="ask-chips" aria-label="What SOCIA knows here">
          <span className="ask-mark"><Sparkles size={12} /></span>
          {chips.map((c) => <span key={c} className="ov-chip muted">{c}</span>)}
          <span className="ask-chips-note">answers from your verified data</span>
          {usage && <UsageLine meter="ask_socia" used={usage.used} limit={usage.limit} />}
        </div>
        <div className="ask-thread" ref={scrollRef}>
          {messages.length === 0 && !busy && (
            <div className="ask-suggest">
              <small>Try asking</small>
              {sugg.map((s) => <button key={s} type="button" className="ask-sug" onClick={() => send(s)}>{s} <ArrowRight size={12} /></button>)}
            </div>
          )}
          {messages.map((m, i) => m.role === "user"
            ? <div key={i} className="ask-msg user"><p>{m.content}</p></div>
            : <div key={i} className="ask-msg assistant"><span className="ask-avatar">S</span>{m.answer ? <AnswerView a={m.answer} onProposal={onProposal} applied={applied} setApplied={setApplied} /> : <p>{m.content}</p>}</div>)}
          {busy && <div className="ask-msg assistant"><span className="ask-avatar">S</span><div className="ask-typing"><span /><span /><span /></div></div>}
          {planError && <PlanNotice error={planError} compact />}
          {error && !planError && (
            <div className="ask-error">
              <p>{error}</p>
              {messages.length > 0 && messages[messages.length - 1].role === "user" && (
                <button type="button" className="ov-btn ghost small" onClick={() => { const last = messages[messages.length - 1]; send(last.content, messages.slice(0, -1)); }}><RotateCcw size={12} /> Try again</button>
              )}
            </div>
          )}
        </div>
        <form className="ask-composer" onSubmit={(e) => { e.preventDefault(); if (!planError) send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={planError ? "Allowance used for this period" : context.page === "studio" ? "Ask SOCIA about this content…" : "Ask SOCIA…"} aria-label="Ask SOCIA" disabled={busy || Boolean(planError)} />
          <button type="submit" disabled={busy || Boolean(planError) || !input.trim()} aria-label="Send"><Send size={14} /></button>
        </form>
        <p className="ask-disclaimer">SOCIA cites only your own data. Review before publishing.</p>
      </div>
    </Drawer>
  );
}

/** A local entry point. Use where the page can apply what SOCIA proposes. */
export function AskSociaButton({ context, contextLabel, suggestions, label = "Ask SOCIA", className = "ov-btn ghost", initialQuestion, onProposal, title }: {
  context: AskContext; contextLabel?: string | null; suggestions?: string[]; label?: string; className?: string; initialQuestion?: string | null; onProposal?: ProposalHandler; title?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Sparkles size={13} /> {label}</button>
      <AskDrawer open={open} onClose={() => setOpen(false)} context={context} contextLabel={contextLabel} suggestions={suggestions} initialQuestion={initialQuestion} onProposal={onProposal} title={title ?? undefined} />
    </>
  );
}

/** The global host (top bar): opens on the Ask SOCIA button, on `socia-ask`
 *  events from any component, and on clicks of legacy "/chat?q=" links, using
 *  the current page as context. */
export function AskHost() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState<{ context: AskContext; question: string | null; autoSend: boolean; label: string | null }>({ context: { page: "global" }, question: null, autoSend: false, label: null });

  const openWith = useCallback((detail: AskEvent & { contextLabel?: string | null }) => {
    const base: AskContext = { page: pageForPath(pathname ?? "/") };
    if (base.page === "analytics") { try { const sp = new URLSearchParams(window.location.search); const r = sp.get("range"); if (r) base.range = r; } catch { /* ignore */ } }
    setReq({ context: { ...base, ...(detail.context ?? {}) } as AskContext, question: detail.question ?? null, autoSend: Boolean(detail.autoSend), label: detail.contextLabel ?? null });
    setOpen(true);
  }, [pathname]);

  useEffect(() => {
    const onEvent = (e: Event) => openWith((e as CustomEvent<AskEvent>).detail ?? {});
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="/chat"]') as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      let q: string | null = null;
      try { q = new URL(a.href, window.location.origin).searchParams.get("q"); } catch { q = null; }
      let ctx: Partial<AskContext> | undefined;
      try { ctx = a.dataset.askContext ? JSON.parse(a.dataset.askContext) : undefined; } catch { ctx = undefined; }
      openWith({ question: q, context: ctx, autoSend: Boolean(q && a.dataset.askSend === "1"), contextLabel: a.dataset.askLabel ?? null });
    };
    window.addEventListener(ASK_EVENT, onEvent);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener(ASK_EVENT, onEvent); document.removeEventListener("click", onClick, true); };
  }, [openWith]);

  // /chat?q=… redirects here with ?ask=…; open once.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("ask");
      if (q != null) {
        openWith({ question: q || null });
        sp.delete("ask");
        window.history.replaceState(null, "", `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}${window.location.hash}`);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button type="button" className="tb-ask" onClick={() => openWith({})} aria-label="Ask SOCIA"><Sparkles size={14} /> <span>Ask SOCIA</span></button>
      <AskDrawer open={open} onClose={() => setOpen(false)} context={req.context} contextLabel={req.label} initialQuestion={req.question} autoSend={req.autoSend} />
    </>
  );
}
