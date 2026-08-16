import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Calendar — SOCIA" };

const WEEK = [
  {
    day: "Mon",
    date: 16,
    posts: [{ time: "8:00 AM", title: "Dough-tossing Reel", fmt: "Reel", plat: "ig" }],
  },
  {
    day: "Tue",
    date: 17,
    best: true,
    posts: [
      { time: "12:00 PM", title: "Behind the scenes: oven", fmt: "Reel", plat: "tt" },
      { time: "7:00 PM", title: '"3 mistakes" carousel', fmt: "Carousel", plat: "ig" },
    ],
  },
  { day: "Wed", date: 18, posts: [] },
  {
    day: "Thu",
    date: 19,
    best: true,
    posts: [{ time: "7:00 PM", title: "Weekly special drop", fmt: "Story", plat: "ig" }],
  },
  {
    day: "Fri",
    date: 20,
    posts: [{ time: "6:00 PM", title: "Friday night pies", fmt: "Reel", plat: "ig" }],
  },
  { day: "Sat", date: 21, posts: [] },
  {
    day: "Sun",
    date: 22,
    posts: [{ time: "11:00 AM", title: "Sunday brunch menu", fmt: "Carousel", plat: "ig" }],
  },
];

const PLAT_LABEL: Record<string, string> = { ig: "Instagram", tt: "TikTok" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="calendar" userEmail={user.email}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Scheduling</div>
          <h1>Calendar</h1>
          <p className="page-sub">
            Your week at a glance. Green days are your audience&apos;s best times.
          </p>
        </div>
        <button className="head-btn">+ New post</button>
      </div>

      <div className="cal-toolbar">
        <button className="cal-nav">‹</button>
        <span className="cal-range">Aug 16 – 22, 2026</span>
        <button className="cal-nav">›</button>
        <span className="cal-week-tag">This week</span>
      </div>

      <div className="cal-grid">
        {WEEK.map((d) => (
          <div className={`cal-col${d.best ? " best" : ""}`} key={d.day}>
            <div className="cal-day">
              <span className="cal-dow">{d.day}</span>
              <span className="cal-date">{d.date}</span>
              {d.best && <span className="cal-best">Best</span>}
            </div>
            <div className="cal-slots">
              {d.posts.length === 0 ? (
                <button className="cal-add">+</button>
              ) : (
                d.posts.map((p, i) => (
                  <div className={`cal-post ${p.plat}`} key={i}>
                    <span className="cal-time">{p.time}</span>
                    <span className="cal-title">{p.title}</span>
                    <span className="cal-tags">
                      <span className="tag fmt">{p.fmt}</span>
                      <span className="cal-plat">{PLAT_LABEL[p.plat]}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="cal-hint">
        <b>💡 Optimal times</b> — based on your audience, Tue &amp; Thu at 7PM get
        the most reach. Two slots are still open this week.
      </div>
    </AppShell>
  );
}
