"use client";

// The week's posts one at a time (Noah, 2026-11-14, after a reference that
// shows one post as a storyboard): a strip of the week's days to move
// between posts, then the chosen post's timed beats. Pure presentation; the
// Content Plan report (components/ContentPlanClient.tsx) owns the data and
// the actions.
import { Check, ExternalLink, Film, Video, X } from "lucide-react";
import Link from "next/link";
import type { PlanBeat } from "@/lib/schema";
import { refResult, type ReelRef } from "@/lib/trendSignals";
import { MOVE_LABEL, shotMove } from "@/lib/shotMove";
import { shotProps, statedAmount } from "@/lib/shotProps";
import { PLAN_STEPS, type PlanStage } from "@/lib/planStage";
import ShotDiagram from "./ShotDiagram";
import "./plan-flow.css";

export type StripItem = {
  index: number;
  /** Mon, Tue... */
  day: string;
  time: string | null;
  title: string;
  animated: boolean;
  state: "approved" | "rejected" | "calendar" | null;
  /** How many of plan, film, edit, post are done. */
  stage?: PlanStage;
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
            {it.stage && it.state !== "rejected" && (
              <span className="pl-dots" role="img" aria-label={`Step ${it.stage} of 4: ${PLAN_STEPS[it.stage - 1]}`}>{PLAN_STEPS.map((_, k) => <i key={k} className={k < it.stage! ? "on" : undefined} />)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const sec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** A shot's picture when "Draw the storyboard" has run (components/plan/DrawStoryboard.tsx): a link to the drawing, or still drawing. */
export type ShotFrame = { url: string | null; drawing: boolean };

/**
 * The post's timed beats as a row of cards, each with a drawing of its camera move and what's in the shot
 * (the kind of move and the things named, not the scene), or the AI-drawn still once one has been drawn.
 */
export function Storyboard({ beats, frames }: { beats: PlanBeat[]; frames?: (ShotFrame | null)[] }) {
  const end = beats.length ? beats[beats.length - 1].to : 0;
  return (
    <>
      {end > 0 && (
        <div className="pl-time" aria-hidden>
          <span className="pl-time-bar">{beats.map((b, k) => <i key={k} className={`is-${k % 4}`} style={{ flexGrow: Math.max(1, b.to - b.from) }} />)}</span>
          <span className="pl-time-marks"><small>{sec(0)}</small>{beats.map((b, k) => <small key={k}>{sec(b.to)}</small>)}</span>
        </div>
      )}
      <ol className="pf-board pl-board" aria-label="The video, shot by shot">
        {beats.map((b, k) => {
          const move = shotMove(b.show);
          return (
            <li key={k} className={`pf-beat pl-beat is-${k % 4}`}>
              <span className="pf-beat-head">
                <span className="pf-beat-n">{String(k + 1).padStart(2, "0")}</span>
                <span className="pf-beat-time">{sec(b.from)} to {sec(b.to)}</span>
              </span>
              {frames?.[k]?.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="pl-frame" src={frames[k]!.url!} alt={`AI drawing of shot ${k + 1}: ${b.show}`} />
                : frames?.[k]?.drawing
                  ? <span className="pl-frame pl-frame-wait" role="status">Drawing this shot</span>
                  : <ShotDiagram move={move} props={shotProps(b.show)} amount={statedAmount(`${b.show} ${b.say}`)} />}
              <span className="pl-beat-name"><span className="pl-move">{MOVE_LABEL[move]}</span><b>{b.label}</b></span>
              <p>{b.show}</p>
              {b.say && <p className="pf-beat-say"><span className="sr-only">Said: </span>&ldquo;{b.say}&rdquo;</p>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Plan, film, edit, post as one track: the steps done, the one in hand, the ones to come. */
export function PlanTrack({ stage }: { stage: PlanStage }) {
  return (
    <ol className="pl-track" aria-label={`Step ${Math.min(4, stage + 1)} of 4`}>
      {PLAN_STEPS.map((name, k) => {
        const state = k < stage ? "done" : k === stage ? "now" : "todo";
        return (
          <li key={name} className={`is-${state}`} aria-current={state === "now" ? "step" : undefined}>
            <i aria-hidden>{state === "done" ? <Check size={14} /> : k + 1}</i>
            <span>{name}</span>
          </li>
        );
      })}
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

const PLATFORM: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook" };

/**
 * For a post the person films: a real Reel to look at before filming, and what to copy from it (Noah,
 * 2026-11-23: "first it gives an example of what the video should look like, so the user has a reference of
 * how they can film the video"). The Reel is the one the plan is built on; without one, the post's own
 * direction stands in and Discover is where to find one.
 */
export function FilmExample({ r, filmLike, direction }: { r?: ReelRef | null; filmLike?: string; direction?: string }) {
  const how = (filmLike || direction || "").trim();
  if (!r && !how) return null;
  const platform = r ? PLATFORM[r.platform] ?? r.platform : "";
  const result = r ? refResult(r) : "";
  return (
    <section className="pf-example" aria-label="Example to film from">
      <h3 className="pf-example-h">Film it like this</h3>
      {r && (
        <a className="pf-example-reel" href={r.url} target="_blank" rel="noopener noreferrer" title="Opens the example Reel. Its numbers are another account's result, not a prediction">
          {r.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.hidden = true; }} />
          )}
          <span className="pf-example-meta">
            <b>{r.account}</b>
            {r.title && <span>&ldquo;{r.title}&rdquo;</span>}
            <small>{[result, `Watch it on ${platform}`].filter(Boolean).join(", ")} <ExternalLink size={11} aria-hidden /></small>
          </span>
        </a>
      )}
      {how && <p className="pf-example-how">{filmLike ? <><b>Copy:</b> {filmLike}</> : how}</p>}
      {!r && <p className="pf-example-none">None of the Reels SOCIA read was filmed this way, so there&apos;s no example to show yet. <Link href="/discover" className="s-link">Add accounts that film like this on Discover</Link></p>}
    </section>
  );
}
