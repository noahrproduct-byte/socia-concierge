"use client";

// Speaking to SOCIA: the browser's own speech recognition (Chrome, Edge and
// Safari have it), kept listening until the person presses stop. Chrome ends
// a session on its own after a pause; while the person hasn't stopped, it is
// started again and the words carry on, so a long instruction or a whole
// brief can be said in one go (the owner, 2026-11-16: "it doesn't stop the
// voice itself; I press it when I'm done talking").
import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const recognizer = (): (new () => Recognition) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(Boolean(recognizer())); }, []);
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const finals = useRef("");
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    wanted.current = false;
    try { rec.current?.stop(); } catch { /* not started */ }
    rec.current = null;
    setListening(false);
  }, []);

  const begin = useCallback(() => {
    const Ctor = recognizer();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) finals.current += res[0].transcript + " "; else interim += res[0].transcript; }
      onTextRef.current((finals.current + interim).replace(/\s+/g, " ").trim());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false; setListening(false); rec.current = null;
      setError(e.error === "not-allowed" ? "The microphone is blocked for this site. Allow it in the browser's site settings, or type instead." : e.error === "network" ? "Speech recognition needs a connection. Type instead for now." : "Couldn't hear that. Try again, or type it.");
    };
    // The browser ends a session on its own after a pause: while the person hasn't pressed stop, listen on.
    r.onend = () => { if (wanted.current) { try { begin(); } catch { setListening(false); } } };
    rec.current = r;
    r.start();
  }, []);

  const start = useCallback(() => {
    if (!recognizer()) return;
    setError(null);
    finals.current = "";
    wanted.current = true;
    setListening(true);
    try { begin(); } catch { wanted.current = false; setListening(false); setError("Couldn't start the microphone. Type it instead."); }
  }, [begin]);

  useEffect(() => () => { wanted.current = false; try { rec.current?.abort(); } catch { /* not started */ } }, []);
  return { supported, listening, error, start, stop, toggle: () => (listening ? stop() : start()) };
}
