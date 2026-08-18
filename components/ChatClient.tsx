"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, MessageSquare } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = { id: string; title: string | null; messages: Msg[]; updated_at: string };

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Hi! I'm your SOCIA strategist. I know your niche and goals — ask me anything about what to post, why something worked, or how to grow.",
};

const SUGGESTIONS = [
  "What should I post this week?",
  "Give me 3 hook ideas for my niche",
  "What's working in my niche right now?",
  "When's the best time to post?",
];

export default function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
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
    setMessages([WELCOME]);
    setCurrentId(null);
    setInput("");
  }

  function openConversation(c: Conversation) {
    setMessages(c.messages?.length ? c.messages : [WELCOME]);
    setCurrentId(c.id);
    setInput("");
  }

  return (
    <div className="chat-layout">
      <aside className="chat-side">
        <button className="chat-new" onClick={newChat}>
          <Plus size={15} /> New chat
        </button>
        <div className="chat-list">
          {conversations.length === 0 && <p className="chat-list-empty">No saved chats yet.</p>}
          {conversations.map((c) => (
            <button
              key={c.id}
              className={`chat-list-item${c.id === currentId ? " on" : ""}`}
              onClick={() => openConversation(c)}
            >
              <MessageSquare size={14} />
              <span>{c.title || "Untitled chat"}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="chat-wrap">
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === "assistant" && <span className="chat-avatar">S</span>}
              <div className="chat-bubble">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg assistant">
              <span className="chat-avatar">S</span>
              <div className="chat-bubble typing"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="chat-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={loading}>{s}</button>
            ))}
          </div>
        )}

        <form
          className="chat-input"
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
          />
          <button type="submit" disabled={loading || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}
