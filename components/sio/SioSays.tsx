"use client";

// SIO asking or telling the person something: the character beside the
// screen's heading, so it is clear who is speaking. Used for every onboarding
// step. Not a chat bubble: SIO's words are the page's own heading and lead.
import type { ReactNode, RefObject } from "react";
import Sio, { type SioExpression } from "./Sio";

export default function SioSays({
  expression = "neutral",
  title,
  children,
  headRef,
  large = false,
  ack,
}: {
  expression?: SioExpression;
  title: ReactNode;
  /** The supporting line under the heading. */
  children?: ReactNode;
  headRef?: RefObject<HTMLHeadingElement | null>;
  /** The first meeting: SIO larger, above the words. */
  large?: boolean;
  /** A short line acknowledging the last answer, said before the next question. */
  ack?: string | null;
}) {
  return (
    <div className={`sio-says${large ? " is-large" : ""}`}>
      <Sio expression={expression} size={large ? 200 : 124} priority={large} />
      <div className="sio-says-text">
        {ack && <p className="sio-says-ack">{ack}</p>}
        <h1 ref={headRef} tabIndex={-1}>{title}</h1>
        {children && <p className="sio-says-sub">{children}</p>}
      </div>
    </div>
  );
}
