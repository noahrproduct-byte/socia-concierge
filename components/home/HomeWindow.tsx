"use client";

import { useId, useState } from "react";
import Image from "next/image";
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
// labelled as example data in its title bar, and names the fictional account. Each Today row is a control:
// open it and it shows the evidence the real card is built from, with the
// baseline and the window every number is measured against, then the real
// next step. Signed out, that step is the signup; signed in, the real screen.

type Row = {
  icon: LucideIcon;
  title: string;
  sub: string;
  /** The poster of the example post this row is about. */
  thumb?: string;
  why: string;
  action: string;
  href: string;
};

const ROWS: Row[] = [
  {
    icon: CalendarClock,
    title: "Today's post goes out at 6:30 PM",
    sub: "Instagram Reel, Tuesday's slot on this week's plan",
    thumb: "/landing/cafe/pour-over.jpg",
    why: "“Three ways to order that aren't on the menu” is Tuesday's slot on this week's Content Plan. It is an educational Reel because your Reels got 1.8× the median views of your other posts over the last 90 days, across 64 posts. 6:30 PM falls inside your best posting window, 5 to 7 PM.",
    action: "Open the Calendar",
    href: "/plan/calendar",
  },
  {
    icon: Clock,
    title: "Your best posting window: 5 to 7 PM",
    sub: "1.6× your median post, across 31 posts, last 90 days",
    why: "Your median post is the middle value of views across everything you posted in the last 90 days. SOCIA splits those posts into two-hour windows in your own time zone. The 31 posts published between 5 and 7 PM had a median 1.6× your overall one; the next best window, 11 AM to 1 PM, was 1.2×. Windows with fewer than 20 posts are left out instead of guessed.",
    action: "See posting times",
    href: "/analytics",
  },
  {
    icon: MessageSquare,
    title: "3 comments waiting for a reply",
    sub: "Each has a reply drafted, ready to review",
    why: "Three comments arrived since you last opened the inbox. SOCIA drafted a reply to each from the way you have replied before. Nothing is sent until you approve it, and you can edit every word.",
    action: "Open the Comments inbox",
    href: "/comments",
  },
  {
    icon: TrendingUp,
    title: "Your Instagram Reel is taking off",
    sub: "2.4× your median views at the same age, two days in",
    thumb: "/landing/reel.jpg",
    why: "Two days after Sunday's publish, this Reel has 2.4× the median views your last 20 posts had at the same age. A breakout alert fires above 2×. Friday's slot on the plan is a follow-up on the same concept.",
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
        <span className="hm-app-url">Example account: Northside Roasters, a fictional café</span>
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
            <span className="hm-mono hm-app-date">Tue | 4 things</span>
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
                    className={`hm-row-item${on ? " is-selected" : ""}`}
                    aria-expanded={on}
                    aria-controls={panel}
                    onClick={() => setOpen(on ? null : i)}
                  >
                    <Icon aria-hidden />
                    <span>
                      <b>{r.title}</b>
                      <span>{r.sub}</span>
                    </span>
                    {r.thumb ? (
                      <Image className="hm-row-thumb" src={r.thumb} alt="" width={28} height={50} sizes="28px" />
                    ) : (
                      <i className="hm-row-thumb is-empty" aria-hidden />
                    )}
                    <kbd>{on ? "Close" : "Why"}</kbd>
                  </button>
                  <div id={panel} className="hm-row-why" hidden={!on}>
                    <p>{r.why}</p>
                    <Link href={signedIn ? r.href : "/signup"} className="hm-btn hm-btn--primary hm-btn--sm">
                      {signedIn ? r.action : "Sign up free to see yours"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hm-window-foot">
            <span>
              <b>Next on the Calendar:</b> &ldquo;The roast we almost didn&apos;t sell&rdquo;, Wednesday 12:00 PM, waiting for approval
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
