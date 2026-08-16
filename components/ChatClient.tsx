"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Hi! I'm your SOCIA strategist. I know your account, your niche, and your numbers — ask me anything about what to post, why something worked, or how to grow.",
};

const SUGGESTIONS = [
  "Why did my last Reel flop?",
  "What should I post Thursday?",
  "Give me 3 hook ideas for a pizza Reel",
  "When's my best time to post?",
];

export default function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "⚠️ Couldn't reach the strategist. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
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
            <div className="chat-bubble typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="chat-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={loading}>
              {s}
            </button>
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
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
