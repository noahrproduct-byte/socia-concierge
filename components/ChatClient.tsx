"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Sparkles,
  Send,
  Lightbulb,
  TrendingUp,
  LineChart,
  CalendarDays,
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
    Ico: Lightbulb,
    title: "What should I post this week?",
    desc: "Get 3–5 content ideas tailored to your niche.",
  },
  {
    Ico: TrendingUp,
    title: "What's working in my niche right now?",
    desc: "See the top trends, hooks, and formats moving fast.",
  },
  {
    Ico: LineChart,
    title: "Why did my engagement change this week?",
    desc: "Analyze the shift and get exact ways to respond.",
  },
  {
    Ico: CalendarDays,
    title: "Give me a 7-day content plan",
    desc: "A day-by-day plan designed around your audience.",
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
    content: `Hi${context.name ? ` ${context.name}` : ""}! I'm your SOCIA strategist. I know your ${
      context.niche ? `niche (${context.subNiche || context.niche}), ` : "niche, "
    }goals, and what's working (and what's not). Ask me anything about content, strategy, or growth.`,
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
    context.niche && { Ico: Compass, label: "Knows your niche", value: context.subNiche || context.niche },
    context.username && {
      Ico: Activity,
      label: "Tracks your numbers",
      value: `Live from @${context.username}`,
    },
    { Ico: TrendingUp, label: "Watches your niche", value: "Trend & format intelligence" },
    context.goal && { Ico: Target, label: "Understands your goals", value: context.goal },
  ].filter(Boolean) as { Ico: typeof Compass; label: string; value: string }[];

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
        <div className="ch2-chips">
          {chips.map(({ Ico, label, value }) => (
            <div className="ch2-chip" key={label}>
              <span className="ch2-chip-ico"><Ico size={14} /></span>
              <span className="ch2-chip-meta">
                <b>{label}</b>
                <small>{value}</small>
              </span>
            </div>
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
                  {SUGGESTIONS.map(({ Ico, title, desc }) => (
                    <button key={title} className="ch2-sug" onClick={() => send(title)} type="button">
                      <span className="ch2-sug-ico"><Ico size={15} /></span>
                      <b>{title}</b>
                      <small>{desc}</small>
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

        {/* intelligence rail */}
        <aside className="ch2-rail">
          <section className="ch2-panel">
            <small className="ch2-panel-label">Your account context</small>
            <div className="ch2-ctx">
              {context.goal && (
                <div><span><Target size={13} /> Primary goal</span><b>{context.goal}</b></div>
              )}
              {context.niche && (
                <div><span><Compass size={13} /> Niche</span><b>{context.subNiche || context.niche}</b></div>
              )}
              {context.engRate && (
                <div><span><Activity size={13} /> Avg. engagement</span><b>{context.engRate}</b></div>
              )}
              {context.bestTime && (
                <div><span><Clock size={13} /> Best time to post</span><b>{context.bestTime}</b></div>
              )}
            </div>
            <Link href="/analytics" className="ch2-rail-link">
              View full account snapshot <ArrowRight size={12} />
            </Link>
          </section>

          <section className="ch2-panel">
            <small className="ch2-panel-label">Recent insights</small>
            {context.insights.length > 0 ? (
              <div className="ch2-insights">
                {context.insights.map((ins) => (
                  <div className="ch2-ins" key={ins.text.slice(0, 24)}>
                    <span className={`ch2-ins-ico ${ins.tone}`}><Zap size={12} /></span>
                    <span className="ch2-ins-meta">
                      <p>{ins.text}</p>
                      <small className={ins.tone}>{ins.sub}</small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ch2-ins-empty">Your niche briefing builds insights here.</p>
            )}
            <Link href="/niche" className="ch2-rail-link">
              Explore Niche Trends <ArrowRight size={12} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
