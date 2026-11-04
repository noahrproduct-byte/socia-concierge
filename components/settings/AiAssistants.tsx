"use client";

// Settings → AI Assistants. Connect SOCIA to Claude, ChatGPT or another MCP
// app: the address, how to add it, which apps are connected (what they may
// do, which Brand Workspaces, when last used), the switch that lets an app
// create, schedule and publish posts, and Disconnect, which stops the app at
// once. An app is marked tested only after its whole flow has passed.

import { useEffect, useState } from "react";
import { Bot, Check, Copy, Loader2, Unplug } from "lucide-react";
import { ASSISTANT_CLIENTS } from "@/lib/mcp/clients";

type Connection = { id: string; app: string; permissions: string[]; canPublish: boolean; canHandIn: boolean; workspaces: string[]; connectedAt: string; lastUsedAt: string | null };

/** What to ask Claude each week (Claude makes the week, lib/claudeWeek). Works with the SOCIA skill installed, and without it. */
const WEEKLY_PROMPT = "Make my SOCIA videos for this week: call get_videos_to_make, make every video that is to_make or changes_requested exactly as its brief says (made on the computer, no filming), check each one, then hand it in with start_video_upload and submit_video. Tell me what you handed in.";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not used yet");

export default function AiAssistants({ mcpUrl }: { mcpUrl: string }) {
  const [state, setState] = useState<{ ready: boolean; connections: Connection[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string>("claude");

  const load = () => fetch("/api/integrations/ai").then((r) => r.json()).then((j) => setState({ ready: Boolean(j.ready), connections: j.connections ?? [] })).catch(() => setState({ ready: false, connections: [] }));
  useEffect(() => { void load(); }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  const disconnect = async (c: Connection) => {
    if (!window.confirm(`Disconnect ${c.app}? It stops working right away; you can connect it again later.`)) return;
    setBusy(c.id);
    setError(null);
    const r = await fetch(`/api/integrations/ai?id=${encodeURIComponent(c.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!r?.ok) { setError("SOCIA couldn't disconnect it. Try again."); return; }
    await load();
  };

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(WEEKLY_PROMPT); setPromptCopied(true); setTimeout(() => setPromptCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  const setHandIn = async (c: Connection, review: boolean) => {
    setBusy(c.id);
    setError(null);
    const r = await fetch("/api/integrations/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, review }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) { setError("SOCIA couldn't change it. Try again."); return; }
    await load();
  };

  const setPublish = async (c: Connection, publish: boolean) => {
    if (publish && !window.confirm(`Let ${c.app} create, schedule and publish posts? It posts as soon as you ask it to, to the accounts in the Brand Workspaces you shared.`)) return;
    setBusy(c.id);
    setError(null);
    const r = await fetch("/api/integrations/ai", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, publish }) }).catch(() => null);
    setBusy(null);
    if (!r?.ok) { setError("SOCIA couldn't change it. Try again."); return; }
    await load();
  };

  const client = ASSISTANT_CLIENTS.find((c) => c.id === open) ?? ASSISTANT_CLIENTS[0];

  return (
    <div className="ai-s">
      <p className="ai-s-intro">
        Connect SOCIA to an AI assistant and ask it about your analytics, top posts, plan and calendar in plain language. It reads your SOCIA data only with your permission and only the Brand Workspaces you choose. On a paid plan you can also let it create, schedule and publish posts; that&apos;s off until you turn it on. It can&apos;t delete posts or change your settings.
      </p>

      <div className="ai-s-url">
        <span className="ai-s-label">Connection address</span>
        <div className="ai-s-urlrow">
          <code>{mcpUrl}</code>
          <button type="button" className="btn-secondary sm" onClick={() => void copy()}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
        </div>
      </div>

      <div className="ai-s-clients" role="tablist" aria-label="AI apps">
        {ASSISTANT_CLIENTS.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={open === c.id} className={open === c.id ? "on" : ""} onClick={() => setOpen(c.id)}>{c.name}</button>
        ))}
      </div>
      <div className="ai-s-steps" role="tabpanel">
        {!client.tested && <p className="ai-s-untested">SOCIA hasn&apos;t finished testing the connection with {client.name === "Other MCP apps" ? "every MCP app" : client.name} yet. If a step doesn&apos;t match what you see, tell us.</p>}
        <ol>{client.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      </div>

      <div className="ai-s-label">Connected apps</div>
      {!state ? (
        <p className="ai-s-muted"><Loader2 size={13} className="cp-spin" /> Loading…</p>
      ) : !state.ready ? (
        <p className="ai-s-muted">Connecting AI apps isn&apos;t set up on this server yet.</p>
      ) : !state.connections.length ? (
        <p className="ai-s-muted">No apps connected.</p>
      ) : (
        <ul className="ai-s-list">
          {state.connections.map((c) => (
            <li key={c.id}>
              <span className="ai-s-ico"><Bot size={15} /></span>
              <span className="ai-s-body">
                <b>{c.app}</b>
                <small>{c.permissions.join(" · ")}</small>
                <small>Brand Workspaces: {c.workspaces.join(", ")}</small>
                <small>Connected {when(c.connectedAt)} · Last used {when(c.lastUsedAt)}</small>
                <span className="ai-s-pub">
                  <button type="button" className={`cbb-toggle${c.canPublish ? " on" : ""}`} role="switch" aria-checked={c.canPublish} aria-label={`Let ${c.app} publish posts`} disabled={busy === c.id} onClick={() => void setPublish(c, !c.canPublish)}><i /></button>
                  <span>Can publish posts<small>{c.canPublish ? "Creates, schedules and publishes when you ask it to. Paid plans only." : "Read only."}</small></span>
                </span>
                <span className="ai-s-pub">
                  <button type="button" className={`cbb-toggle${c.canHandIn ? " on" : ""}`} role="switch" aria-checked={c.canHandIn} aria-label={`Let ${c.app} add videos for your review`} disabled={busy === c.id || c.canPublish} onClick={() => void setHandIn(c, !c.canHandIn)}><i /></button>
                  <span>Can add videos for review<small>{c.canPublish ? "Included with publishing." : c.canHandIn ? "Hands in this week's videos; nothing posts until you approve them. Paid plans only." : "Off."}</small></span>
                </span>
              </span>
              <button type="button" className="btn-secondary sm" disabled={busy === c.id} onClick={() => void disconnect(c)}>
                {busy === c.id ? <Loader2 size={13} className="cp-spin" /> : <Unplug size={13} />} Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="ai-s-err" role="alert">{error}</p>}

      <div className="ai-s-label">Let Claude make your week</div>
      <div className="ai-s-steps">
        <p className="ai-s-muted">When your Growth Profile says your Claude makes your videos, each week&apos;s plan marks the posts for it. Claude makes them on your computer, hands them in, and you approve them on the Calendar. Nothing posts until you do.</p>
        <ol>
          <li>Use Claude Code, or the Claude app with code tools on: making a video needs a computer, so Claude on the web can&apos;t do it.</li>
          <li>Connect SOCIA above, then turn on <b>Can add videos for review</b> for it.</li>
          <li>Optional, for better videos: download the <a href="/claude/socia-week/SKILL.md" download>SOCIA week skill</a> and put it in a folder named <code>socia-week</code> inside <code>~/.claude/skills</code>.</li>
          <li>Ask Claude the message below, or schedule it to run every Monday morning (in Claude Code, ask it to schedule the message weekly).</li>
        </ol>
        <div className="ai-s-urlrow">
          <code>{WEEKLY_PROMPT}</code>
          <button type="button" className="btn-secondary sm" onClick={() => void copyPrompt()}>{promptCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
        </div>
      </div>

      <div className="ai-s-dev">
        <b>Developer API</b>
        <small>Direct API access for your own tools is planned for the Pro plan. It isn&apos;t available yet.</small>
      </div>
    </div>
  );
}
