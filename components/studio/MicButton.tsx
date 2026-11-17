"use client";

// The microphone: press to talk, press again when done. While it listens it
// turns red, with the live spinner turning around the stop mark, so it reads as recording.
import { Loader2, Mic, MicOff, Square } from "lucide-react";

export default function MicButton({ supported, listening, disabled, onToggle, size = "small", labelIdle = "Say it" }: {
  supported: boolean; listening: boolean; disabled?: boolean; onToggle: () => void; size?: "small" | "large"; labelIdle?: string;
}) {
  const label = listening ? "Stop listening" : supported ? labelIdle : "Voice needs Chrome, Edge or Safari";
  return (
    <button
      type="button"
      className={`sd-mic sd-mic-${size}${listening ? " is-on" : ""}`}
      aria-label={label}
      aria-pressed={listening}
      title={supported ? (listening ? "Press when you're done talking" : "Press and talk; press again when you're done") : "Voice input needs Chrome, Edge or Safari. Typing works here."}
      disabled={!supported || (disabled && !listening)}
      onClick={onToggle}
    >
      {listening && <span className="sd-mic-live" aria-hidden><Loader2 className="spin" /></span>}
      {listening ? <Square size={size === "large" ? 14 : 11} fill="currentColor" /> : supported ? <Mic size={size === "large" ? 18 : 15} /> : <MicOff size={size === "large" ? 18 : 15} />}
    </button>
  );
}
