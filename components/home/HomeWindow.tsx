"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Calendar,
  CalendarClock,
  Clapperboard,
  ClipboardList,
  Clock,
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

// The product as the page's main image: SOCIA's Dashboard, rebuilt as an app
// window with its own chrome, sidebar and Today card. The whole window is
// labelled as example data in its title bar. Each Today row is a control:
// open it and it shows the evidence the real card is built from, with the
// baseline and the window every number is measured against, then the real
// next step. Signed out, that step is the signup; signed in, the real screen.

type Row = {
  icon: LucideIcon;
  title: string;
  sub: string;
  key: string;
  why: string;
  action: string;
  href: string;
};

const ROWS: Row[] = [
  {
    icon: CalendarClock,
    title: "Today's post goes out at 6:30 PM",
    sub: "Instagram Reel, from Friday on this week's plan",
    key: "Open",
    why: "This is Friday's item on this week's Content Plan. It is an educational Reel because your Reels got 1.8× the median views of your other posts over the last 90 days, across 64 posts. 6:30 PM is your best Friday window over the same 90 days.",
    action: "Open the Calendar",
    href: "/calendar",
  },
  {
    icon: Clock,
    title: "Your best window today: 5 to 7 PM",
    sub: "1.6× your median post, from 38 Tuesday posts in the last 90 days",
    key: "Why",
    why: "Your median post is the middle value of views across everything you posted in the last 90 days. The posts you published on Tuesdays between 5 and 7 PM, in your own time zone, got 1.6× that median, across 38 posts. When a window has fewer than 20 posts behind it, SOCIA says there is not enough history instead of guessing.",
    action: "See posting times",
    href: "/analytics",
  },
  {
    icon: MessageSquare,
    title: "3 comments waiting for a reply",
    sub: "Each has a reply drafted, ready to review",
    key: "Reply",
    why: "Three comments arrived since you last opened the inbox. SOCIA drafted a reply to each from the way you have replied before. Nothing is sent until you approve it, and you can edit every word.",
    action: "Open the Comments inbox",
    href: "/comments",
  },
  {
    icon: TrendingUp,
    title: "Your Instagram Reel is taking off",
    sub: "2.4× your median post, 48 hours after it went out",
    key: "Plan it",
    why: "48 hours after publishing, this Reel has 2.4× the median views your last 20 posts had at the same age. A breakout alert fires above 2×. Next week's plan will suggest a follow-up on the same concept.",
    action: "Draft the follow-up",
    href: "/create",
  },
];

const SIDE: { icon: LucideIcon; label: string; on?: boolean }[] = [
  { icon: LayoutDashboard, label: "Dashboard", on: true },
  { icon: BarChart3, label: "Analytics" },
  { icon: ClipboardList, label: "Content Plan" },
  { icon: Calendar, label: "Calendar" },
  { icon: Clapperboard, label: "Content Studio" },
  { icon: Users, label: "Competitors" },
];

export default function HomeWindow({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <div className="hm-app">
      <div className="hm-app-bar">
        <span className="hm-app-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="hm-app-url">sociaos.com/dashboard</span>
        <span className="hm-example">Example data</span>
      </div>
      <div className="hm-app-body">
        <nav className="hm-app-side" aria-label="Example of SOCIA's navigation">
          <span className="hm-app-ws">
            <i aria-hidden>N</i>
            Northside Roasters
          </span>
          {SIDE.map((s) => {
            const Icon = s.icon;
            return (
              <span key={s.label} className={`hm-app-nav${s.on ? " is-on" : ""}`}>
                <Icon aria-hidden />
                {s.label}
              </span>
            );
          })}
        </nav>
        <div className="hm-app-main">
          <div className="hm-window-bar">
            <h3>Today</h3>
            <span className="hm-caption">Tue, Oct 27, 4 things</span>
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
                    <Link href={signedIn ? r.href : "/signup"} className="hm-btn hm-btn--outline hm-btn--sm">
                      {signedIn ? r.action : "Get started free to see yours"}
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
          </div>
        </div>
      </div>
    </div>
  );
}
