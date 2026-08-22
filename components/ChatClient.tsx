"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Sparkles,
  Send,
  TrendingUp,
  Target,
  Compass,
  Activity,
  Clock,
  ArrowRight,
  Zap,
} from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string | null; messages: Msg[]; updated_at: string };

export type StrategistContext = {
  name: string | null;
  goal: string | null;
  niche: string | null;
  subNiche: string | null;
  username: string | null;
  mediaCount: number;
  engRate: string | null;
  bestTime: string | null;
  insights: { tone: "green" | "blue" | "amber"; text: string; sub: string }[];
};

const SUGGESTIONS = [
  {
    n: "01",
    title: "What should I post this week?",
    desc: "Get ideas based on what's working right now.",
  },
  {
    n: "02",
    title: "What's working in my niche?",
    desc: "See the trends and formats gaining momentum.",
  },
  {
    n: "03",
    title: "Why did my performance change?",
    desc: "Understand what moved and what to do next.",
  },
];

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function ChatClient({ context }: { context: StrategistContext }) {
  const welcome: Msg = {
    role: "assistant",
    content: `Hi${context.name ? ` ${context.name}` : ""}! I'm your SOCIA strategist. I already know your ${
      context.niche ? `niche (${context.subNiche || context.niche}), ` : "niche, "
    }your performance, and what's moving right now. What do you want to figure out?`,
  };

  const [messages, setMessages] = useState<Msg[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((j) => setConversations(j.conversations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function save(finalMessages: Msg[]) {
    const firstUser = finalMessages.find((m) => m.role === "user");
    const title = (firstUser?.content ?? "New chat").slice(0, 48);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentId, title, messages: finalMessages }),
      });
      const json = await res.json();
      const id = json.id as string | undefined;
      if (!id) return;
      setCurrentId(id);
      setConversations((cur) => {
        const entry: Conversation = { id, title, messages: finalMessages, updated_at: new Date().toISOString() };
        return [entry, ...cur.filter((c) => c.id !== id)];
      });
    } catch {
      // saving is best-effort
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      const reply = json.reply ?? `⚠️ ${json.error ?? "Something went wrong."}`;
      const final = [...next, { role: "assistant" as const, content: reply }];
      setMessages(final);
      save(final);
    } catch {
      setMessages([...next, { role: "assistant", content: "⚠️ Couldn't reach the strategist. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setMessages([welcome]);
    setCurrentId(null);
    setInput("");
  }

  function openConversation(c: Conversation) {
    setMessages(c.messages?.length ? c.messages : [welcome]);
    setCurrentId(c.id);
    setInput("");
  }

  const fresh = messages.length <= 1;
  const chips = [
    context.niche && { Ico: Compass, value: context.subNiche || context.niche },
    context.username && { Ico: Activity, value: "Live account data" },
    { Ico: TrendingUp, value: "Niche intelligence" },
    context.goal && { Ico: Target, value: `Goal: ${context.goal}` },
  ].filter(Boolean) as { Ico: typeof Compass; value: string }[];
  const trending = context.insights.find((i) => i.tone === "green");

  return (
    <div className="ch2">
      {/* header */}
      <div className="ch2-head">
        <div>
          <small className="ch2-eyebrow">Ask anything</small>
          <h1>
            AI Strategist <Sparkles size={20} className="ch2-spark" />
          </h1>
          <p>A strategist that already knows your account, niche, and numbers.</p>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="ch2-strip">
          {chips.map(({ Ico, value }) => (
            <span className="ch2-status" key={value}>
              <Ico size={12} /> {value}
            </span>
          ))}
        </div>
      )}

      <div className="ch2-cols">
        {/* history */}
        <aside className="ch2-side">
          <button className="btn-primary db2-ask ch2-new" onClick={newChat} type="button">
            <Plus size={15} /> New chat
          </button>
          <small className="ch2-side-label">Recent chats</small>
          <div className="ch2-list">
            {conversations.length === 0 && <p className="ch2-list-empty">No saved chats yet.</p>}
            {conversations.map((c) => (
              <button
                key={c.id}
                className={`ch2-item${c.id === currentId ? " on" : ""}`}
                onClick={() => openConversation(c)}
                type="button"
              >
                <b>{c.title || "Untitled chat"}</b>
                <small>{ago(c.updated_at)}</small>
              </button>
            ))}
          </div>
        </aside>

        {/* conversation */}
        <div className="ch2-main">
          <div className="ch2-scroll" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`ch2-msg ${m.role}`}>
                {m.role === "assistant" && <span className="ch2-avatar">S</span>}
                <div className="ch2-bubble">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="ch2-msg assistant">
                <span className="ch2-avatar">S</span>
                <div className="ch2-bubble ch2-typing"><span /><span /><span /></div>
              </div>
            )}

            {fresh && !loading && (
              <div className="ch2-suggest">
                <small className="ch2-suggest-label">Suggested for you</small>
                <div className="ch2-suggest-grid">
                  {SUGGESTIONS.map(({ n, title, desc }) => (
                    <button key={title} className="ch2-sug" onClick={() => send(title)} type="button">
                      <span className="ch2-sug-num">{n}</span>
                      <span className="ch2-sug-meta">
                        <b>{title}</b>
                        <small>{desc}</small>
                      </span>
                      <ArrowRight size={15} className="ch2-sug-arrow" />
                    </button>
                  ))}
                </div>
                <p className="ch2-powered">
                  <Sparkles size={12} /> The strategist uses your live account data and niche signals.
                </p>
              </div>
            )}
          </div>

          <form
            className="ch2-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your strategist anything…"
              disabled={loading}
              aria-label="Message the strategist"
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send">
              <Send size={15} />
            </button>
          </form>
          <p className="ch2-disclaimer">SOCIA can make mistakes. Always review before publishing.</p>
        </div>

        {/* one compact live-context panel */}
        <aside className="ch2-rail">
          <section className="ch2-panel">
            <small className="ch2-panel-label">Live context</small>
            <div className="ch2-ctx">
              {context.niche && (
                <div><span><Compass size={13} /> Niche</span><b>{context.subNiche || context.niche}</b></div>
              )}
              {context.engRate && (
                <div><span><Activity size={13} /> Engagement</span><b>{context.engRate}</b></div>
              )}
              {context.bestTime && (
                <div><span><Clock size={13} /> Best time</span><b>{context.bestTime}</b></div>
              )}
              {context.goal && (
                <div><span><Target size={13} /> Goal</span><b>{context.goal}</b></div>
              )}
            </div>
            {trending && (
              <div className="ch2-trending">
                <span className="ch2-ins-ico green"><Zap size={12} /></span>
                <span className="ch2-ins-meta">
                  <small className="ch2-trending-label">Trending now</small>
                  <p>{trending.text}</p>
                  <small className="green">{trending.sub}</small>
                </span>
              </div>
            )}
            <Link href="/analytics" className="ch2-rail-link">
              View account snapshot <ArrowRight size={12} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
