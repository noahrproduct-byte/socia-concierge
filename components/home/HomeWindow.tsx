"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CalendarClock, Clock, MessageSquare, TrendingUp, type LucideIcon } from "lucide-react";

// The product as the hero image: the Dashboard's Today card as an app window.
// Each row is a real control. Open it and it shows the evidence SOCIA would
// show, the way the real card does, then offers the real next step. Every
// number is an illustrative example and says what it is compared with.

type Row = {
  icon: LucideIcon;
  title: string;
  sub: string;
  key: string;
  why: string;
  action: string;
};

const ROWS: Row[] = [
  {
    icon: CalendarClock,
    title: "Today's post goes out at 6:30 PM",
    sub: "Instagram Reel, scheduled from this week's plan",
    key: "Open",
    why: "This is Friday's item on the Content Plan: an educational Reel, because your Reels have done 1.8× your posts over the last 90 days. The time is your best Friday window.",
    action: "See the plan in the Calendar",
  },
  {
    icon: Clock,
    title: "Your best window today: 5 to 7 PM",
    sub: "Your Tuesday posts in this window did 1.6× your typical post, over 38 posts",
    key: "Why",
    why: "Posting-time analysis, in your own time zone. It only shows a window when there are enough posts behind it; with fewer than 20 it says so instead.",
    action: "See posting times",
  },
  {
    icon: MessageSquare,
    title: "3 comments waiting for a reply",
    sub: "Drafts ready to review in the Comments inbox",
    key: "Reply",
    why: "SOCIA drafts a reply for each new comment in your voice. Nothing is sent until you approve it, and you can edit every word.",
    action: "Open the Comments inbox",
  },
  {
    icon: TrendingUp,
    title: "Your Instagram Reel is taking off",
    sub: "2.4× your median post after 48 hours. Worth a follow-up this week.",
    key: "Plan it",
    why: "A breakout alert: this Reel is beating the median of your last 20 posts by more than 2× inside its first 48 hours. The next plan will suggest a follow-up on the same concept.",
    action: "Draft the follow-up",
  },
];

export default function HomeWindow({ startHref }: { startHref: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <div className="hm-window">
      <div className="hm-window-bar">
        <h3>Today</h3>
        <span className="hm-caption">Tue, Oct 27</span>
      </div>
      <div className="hm-window-body">
        {ROWS.map((r, i) => {
          const Icon = r.icon;
          const on = open === i;
          const panel = `${base}-why-${i}`;
          return (
            <div key={r.title} className={`hm-row-wrap${on ? " is-open" : ""}`}>
              <button
                type="button"
                className={`hm-row-item${on || (open === null && i === 0) ? " is-selected" : ""}`}
                aria-expanded={on}
                aria-controls={panel}
                onClick={() => setOpen(on ? null : i)}
              >
                <Icon aria-hidden />
                <span>
                  <b>{r.title}</b>
                  <span>{r.sub}</span>
                </span>
                <kbd>{on ? "Close" : r.key}</kbd>
              </button>
              <div id={panel} className="hm-row-why" hidden={!on}>
                <p>{r.why}</p>
                <Link href={startHref} className="hm-btn hm-btn--outline hm-btn--sm">
                  {r.action}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hm-window-foot">
        <span>
          <b>Next:</b> &ldquo;Three mistakes quietly killing your reach&rdquo; goes out tomorrow at 6:30 PM
        </span>
        <span className="hm-example">Example</span>
      </div>
    </div>
  );
}
