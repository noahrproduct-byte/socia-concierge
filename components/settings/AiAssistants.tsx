"use client";

// Settings → AI Assistants. Connect SOCIA to Claude, ChatGPT or another MCP
// app: the address, how to add it, which apps are connected (what they may
// do, which Brand Workspaces, when last used), and Disconnect, which stops the
// app at once. An app is marked tested only after its whole flow has passed.

import { useEffect, useState } from "react";
import { Bot, Check, Copy, Loader2, Unplug } from "lucide-react";
import { ASSISTANT_CLIENTS } from "@/lib/mcp/clients";

type Connection = { id: string; app: string; permissions: string[]; workspaces: string[]; connectedAt: string; lastUsedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Not used yet");

export default function AiAssistants({ mcpUrl }: { mcpUrl: string }) {
  const [state, setState] = useState<{ ready: boolean; connections: Connection[] } | null>(null);
  const [copied, setCopied] = useState(false);
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

  const client = ASSISTANT_CLIENTS.find((c) => c.id === open) ?? ASSISTANT_CLIENTS[0];

  return (
    <div className="ai-s">
      <p className="ai-s-intro">
        Connect SOCIA to an AI assistant and ask it about your analytics, top posts, plan and calendar in plain language. It reads your SOCIA data only with your permission and only the Brand Workspaces you choose. It can&apos;t publish, schedule, delete or change anything.
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
              </span>
              <button type="button" className="btn-secondary sm" disabled={busy === c.id} onClick={() => void disconnect(c)}>
                {busy === c.id ? <Loader2 size={13} className="cp-spin" /> : <Unplug size={13} />} Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="ai-s-err" role="alert">{error}</p>}

      <div className="ai-s-dev">
        <b>Developer API</b>
        <small>Direct API access for your own tools is planned for the Pro plan. It isn&apos;t available yet.</small>
      </div>
    </div>
  );
}
