"use client";

// An empty Studio screen: a small drawing of what will be here, one
// sentence, and the one thing to do. The drawing is line art of the
// product's own objects (clips, a frame, a note), never a stock figure.
// It rises in once with the rest of the page and never loops.
import type { ReactNode } from "react";
import { Reveal } from "@/components/dashboard/motion";
import "@/app/(app)/studio/studio.css";

export type EmptyArt = "clips" | "video" | "music" | "guide";

function Art({ kind }: { kind: EmptyArt }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="sd-empty-art" viewBox="0 0 120 80" aria-hidden>
      {kind === "clips" && (
        <g {...common}>
          <rect x="8" y="22" width="30" height="46" rx="4" />
          <rect x="45" y="12" width="30" height="56" rx="4" />
          <rect x="82" y="26" width="30" height="42" rx="4" />
          <path d="M8 32h30M8 58h30M45 22h30M45 58h30M82 36h30M82 58h30" opacity="0.5" />
          <path d="M56 36l10 6-10 6z" />
        </g>
      )}
      {kind === "video" && (
        <g {...common}>
          <rect x="40" y="8" width="40" height="64" rx="6" />
          <path d="M40 20h40M40 60h40" opacity="0.5" />
          <path d="M55 34l12 6-12 6z" />
          <path d="M14 40h18M88 40h18" opacity="0.5" />
          <path d="M20 30l6 10-6 10M100 30l-6 10 6 10" opacity="0.5" />
        </g>
      )}
      {kind === "music" && (
        <g {...common}>
          <rect x="16" y="8" width="40" height="64" rx="6" />
          <path d="M16 20h40M16 60h40" opacity="0.5" />
          <path d="M76 52V22l24-6v30" />
          <circle cx="70" cy="54" r="6" />
          <circle cx="94" cy="48" r="6" />
        </g>
      )}
      {kind === "guide" && (
        <g {...common}>
          <rect x="30" y="8" width="60" height="64" rx="6" />
          <path d="M42 24h36M42 36h36M42 48h22" opacity="0.6" />
          <path d="M42 60h12" />
        </g>
      )}
    </svg>
  );
}

export default function StudioEmpty({ art, title, children, action, index = 0, compact }: { art: EmptyArt; title: string; children?: ReactNode; action?: ReactNode; index?: number; /** a smaller frame for a list with nothing in it */ compact?: boolean }) {
  return (
    <Reveal index={index} className={`sd-empty${compact ? " is-compact" : ""}`}>
      <Art kind={art} />
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </Reveal>
  );
}
