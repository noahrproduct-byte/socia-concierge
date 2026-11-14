"use client";

// "Tell SOCIA what to change": one box at the top of the editor where the
// person types, or presses the microphone and says, what they want done to
// the cut ("mute the background sound", "make the captions bigger", "cut the
// second shot", "add 'come see this rug' over the close-ups"). The words go
// to /api/studio/builds/[id]/instruct, the changed cut comes back as one
// undoable change in the editor, and SOCIA says what it did and what it
// could not. Speech is the browser's own recognition (Chrome, Edge, Safari);
// where it isn't there the microphone says so and typing works the same.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Mic, MicOff, Send } from "lucide-react";
import type { Edl, RegenerateDirective } from "@/lib/studioClips/types";

export type InstructReply = { edl: Edl; reply: string; done: string[]; skipped: string[]; regenerate: RegenerateDirective | null; changed: boolean };

type Recognition = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const recognizer = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const EXAMPLES = ["mute the background sound", "captions bigger", "cut the second shot", "no transitions", "add “come see this rug” over the close-ups", "make it shorter"];

export default function AskPanel({ buildId, edl, canEdit, busy, fixture, onApply, onRegenerate }: {
  buildId: string;
  edl: Edl;
  canEdit: boolean;
  busy: boolean;
  fixture: boolean;
  /** The changed cut, to commit as one undoable step. */
  onApply: (next: Edl, reply: InstructReply) => void;
  /** A structural re-cut asked for in words: the editor's own Make it again. */
  onRegenerate: (directive: RegenerateDirective) => void;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<{ reply: string; done: string[]; skipped: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const edlRef = useRef(edl);
  useEffect(() => { edlRef.current = edl; }, [edl]);
  const canSpeak = Boolean(recognizer());
  useEffect(() => () => rec.current?.abort(), []);

  const send = async (words: string) => {
    const instruction = words.trim();
    if (!instruction || sending) return;
    setSending(true); setErr(null); setLast(null);
    try {
      if (fixture) {
        // The lab has no model: the box shows what a reply looks like.
        setLast({ reply: "In the lab nothing is sent; on SOCIA this applies the change to the cut.", done: [], skipped: [] });
        return;
      }
      const res = await fetch(`/api/studio/builds/${buildId}/instruct`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction, edl: edlRef.current }) }).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as (InstructReply & { error?: string }) | null) : null;
      if (!res) { setErr("SOCIA couldn't be reached. Check your connection and try again; the cut is unchanged."); return; }
      if (!res.ok || !j) { setErr(j?.error ?? "Couldn't apply that. Try saying it another way."); return; }
      setLast({ reply: j.reply, done: j.done, skipped: j.skipped });
      if (j.changed) onApply(j.edl, j);
      if (j.regenerate) onRegenerate(j.regenerate);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const toggleMic = () => {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = recognizer();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript; }
      setText((finalText + interim).trim());
    };
    r.onerror = (e) => { setListening(false); if (e.error !== "aborted" && e.error !== "no-speech") setErr(e.error === "not-allowed" ? "The microphone is blocked for this site. Allow it in the browser's site settings, or type instead." : "Couldn't hear that. Try again, or type it."); };
    r.onend = () => { setListening(false); rec.current = null; const said = finalText.trim(); if (said) void send(said); };
    rec.current = r;
    setErr(null); setListening(true);
    try { r.start(); } catch { setListening(false); setErr("Couldn't start the microphone. Type it instead."); }
  };

  const locked = !canEdit || busy || sending;
  return (
    <section className="ov-card sd-ask" aria-label="Tell SOCIA what to change">
      <div className="sd-ask-head"><b>Tell SOCIA what to change</b><small>Type it or say it. SOCIA edits this cut; Undo takes it back.</small></div>
      <form className="sd-ask-row" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <textarea
          className="sd-ask-input"
          rows={2}
          value={text}
          placeholder={listening ? "Listening…" : `For example: ${EXAMPLES[Math.floor(Date.now() / 60000) % EXAMPLES.length]}`}
          disabled={locked && !listening}
          aria-label="What to change"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
        />
        <div className="sd-ask-btns">
          <button type="button" className={`sd-iconbtn sd-ask-mic${listening ? " is-on" : ""}`} aria-label={listening ? "Stop listening" : canSpeak ? "Say what to change" : "Voice needs Chrome, Edge or Safari"} aria-pressed={listening} disabled={!canSpeak || (locked && !listening)} title={canSpeak ? undefined : "Voice input needs Chrome, Edge or Safari. Typing works here."} onClick={toggleMic}>{canSpeak ? <Mic size={15} /> : <MicOff size={15} />}</button>
          <button type="submit" className="ov-btn primary small" disabled={locked || !text.trim()}>{sending ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Do it</button>
        </div>
      </form>
      {err && <p className="sd-ask-err" role="alert"><AlertTriangle size={12} aria-hidden /> {err}</p>}
      {last && (
        <div className="sd-ask-reply" role="status">
          <p><Check size={12} aria-hidden /> {last.reply}</p>
          {last.done.length > 0 && <ul>{last.done.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          {last.skipped.length > 0 && <ul className="is-off">{last.skipped.map((d, i) => <li key={i}>Not done: {d}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
