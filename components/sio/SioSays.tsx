"use client";

// SIO asking or telling the person something: the character beside the
// screen's heading, so it is clear who is speaking. Used for every onboarding
// step. Not a chat bubble: SIO's words are the page's own heading and lead.
// The words come out in the rhythm of speech while SIO's mouth moves with
// them (components/sio/useSioSpeech.ts), and its face follows the sentence: a
// question looks curious, an exclamation pleased. A click on the words shows
// them all.
import { Children, type ReactNode, type RefObject } from "react";
import Sio, { type SioExpression } from "./Sio";
import SioWords from "./SioWords";
import { useSioSpeech } from "./useSioSpeech";

/** Children as plain text when they are only text; null when they hold elements (then they are shown as they are). */
function plain(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  return parts.every((p) => typeof p === "string" || typeof p === "number") ? parts.join("").replace(/\s+/g, " ").trim() : null;
}

export default function SioSays({
  expression = "neutral",
  speakAs = "neutral",
  title,
  children,
  headRef,
  large = false,
  compact = false,
  ack,
  still = false,
}: {
  /** How SIO looks once it has finished speaking. */
  expression?: SioExpression;
  /** How SIO looks while saying a plain sentence. Questions and exclamations bring their own look. */
  speakAs?: SioExpression;
  title: string;
  /** The supporting line under the heading. */
  children?: ReactNode;
  headRef?: RefObject<HTMLHeadingElement | null>;
  /** The first meeting: SIO larger, above the words. */
  large?: boolean;
  /** In the corner of an app page: a small SIO, and the line as text, not the page's heading. */
  compact?: boolean;
  /** A short line acknowledging the last answer, said before the next question. */
  ack?: string | null;
  /** Show the words at once, with no speaking. */
  still?: boolean;
}) {
  const sub = plain(children);
  const speech = useSioSpeech([ack ?? null, title, sub], still);
  const face: SioExpression = !speech.speaking ? expression : speech.mood === "ask" ? "curious" : speech.mood === "bright" ? "happy" : speakAs;
  // As a sentence starts SIO looks at its words: beside it, or below it on the first screen.
  const look = speech.glance ? (large ? "down" : "right") : undefined;
  return (
    <div className={`sio-says${large ? " is-large" : ""}${compact ? " is-compact" : ""}`}>
      <Sio expression={face} speaking={speech.speaking} mouth={speech.mouth} nods={speech.nods} mood={speech.mood} look={look} size={large ? 200 : compact ? 72 : 124} shadow={!compact} priority={large} still={still} />
      {/* The click is a shortcut for people watching the words arrive; the whole text is already in the page for everyone else. */}
      <div className="sio-says-text" onClick={speech.speaking ? speech.skip : undefined}>
        {ack && <p className="sio-says-ack"><SioWords text={ack} shown={speech.shown[0]} /></p>}
        {compact
          ? <p className="sio-says-line"><SioWords text={title} shown={speech.shown[1]} /></p>
          : <h1 ref={headRef} tabIndex={-1}><SioWords text={title} shown={speech.shown[1]} /></h1>}
        {children != null && children !== false && (
          <p className="sio-says-sub">{sub != null ? <SioWords text={sub} shown={speech.shown[2]} /> : children}</p>
        )}
      </div>
    </div>
  );
}
