"use client";

// The week's posts one at a time (Noah, 2026-11-14, after a reference that
// shows one post as a storyboard): a strip of the week's days to move
// between posts, then the chosen post's timed beats. Pure presentation; the
// Content Plan report (components/ContentPlanClient.tsx) owns the data and
// the actions.
import { Check, Film, Video, X } from "lucide-react";
import type { PlanBeat } from "@/lib/schema";
import type { ReelRef } from "@/lib/trendSignals";

export type StripItem = {
  index: number;
  /** Mon, Tue... */
  day: string;
  time: string | null;
  title: string;
  animated: boolean;
  state: "approved" | "rejected" | "calendar" | null;
};

export function WeekStrip({ items, selected, onSelect }: { items: StripItem[]; selected: number; onSelect: (index: number) => void }) {
  return (
    <div className="pf-strip" role="tablist" aria-label="This week's posts">
      {items.map((it) => {
        const on = it.index === selected;
        return (
          <button
            key={it.index}
            type="button"
            role="tab"
            aria-selected={on}
            className={`pf-chip${on ? " on" : ""}${it.state === "rejected" ? " off" : ""}`}
            onClick={() => onSelect(it.index)}
          >
            <span className="pf-chip-top">
              <b>{it.day}</b>
              {it.time && <small>{it.time}</small>}
              {it.state === "approved" || it.state === "calendar" ? <Check size={12} aria-label="On the Calendar" /> : it.state === "rejected" ? <X size={12} aria-label="Turned down" /> : null}
            </span>
            <span className="pf-chip-kind">
              {it.animated ? <Film size={11} aria-hidden /> : <Video size={11} aria-hidden />} {it.animated ? "Animated" : "On camera"}
            </span>
            <span className="pf-chip-title">{it.title}</span>
          </button>
        );
      })}
    </div>
  );
}

const sec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The post's timed beats as a row of cards. Text only: SOCIA never shows a made-up picture of a shot. */
export function Storyboard({ beats }: { beats: PlanBeat[] }) {
  return (
    <ol className="pf-board" aria-label="The video, beat by beat">
      {beats.map((b, k) => (
        <li key={k} className="pf-beat">
          <span className="pf-beat-head">
            <span className="pf-beat-n">{String(k + 1).padStart(2, "0")}</span>
            <span className="pf-beat-time">{sec(b.from)} to {sec(b.to)}</span>
          </span>
          <b>{b.label}</b>
          <p>{b.show}</p>
          {b.say && <p className="pf-beat-say"><span className="sr-only">Said: </span>&ldquo;{b.say}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}

/** The length the beats add up to, for the format chip ("about 25 seconds"). */
export const beatsLength = (beats?: PlanBeat[]): string | null => {
  const end = beats?.length ? beats[beats.length - 1].to : null;
  return end ? `${end} seconds` : null;
};

/** What a post is built on, said with the numbers SOCIA read, never a score of its own. */
export function builtOn(ref?: ReelRef | null): string | null {
  if (!ref) return null;
  const who = ref.account?.trim() || "another account";
  return `Built on ${who}'s Reel${ref.track ? `, track record ${ref.track.score}/100` : ""}`;
}
