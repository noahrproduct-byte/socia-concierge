"use client";

// The scheduling workspace. Posts on the grid are the user's real scheduled
// posts (`scheduled_posts`); the publisher sends each one to Instagram at its
// time. Every intelligence element — best days, best window, the per-day
// audience activity bars — is computed from the user's real Instagram posts in
// the browser's own time zone. With too little data the intelligence simply
// doesn't render. Nothing on this page is a sample.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  ArrowRight,
  Info,
  Star,
  X,
  Upload,
  Film,
  Image as ImageIcon,
  CalendarPlus,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/client";
import {
  draftsFromPlan,
  readiness,
  type ScheduledPost,
  type MediaType,
  type PostStatus,
} from "@/lib/scheduling";
import {
  buildAudience,
  suggestedHour,
  hourLabel,
  mondayOf,
  DOW,
  DAY_MS,
  type Audience,
  type CalPost,
} from "@/lib/audience";

export type { CalPost };
/** What the page knows about the publishing pipeline. `canPublish` is null when
 *  the connection predates scope recording — unknown, not "no". `lastRunAt` is
 *  the publisher's heartbeat; without a recent one, auto-publishing isn't "on". */
export type PublishInfo = { canPublish: boolean | null; configured: boolean; lastRunAt: string | null };

const ago = (ms: number) => {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

const CAPTION_MAX = 2200;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const firstLine = (s: string) =>
  (s.split("\n").find((l) => l.trim()) ?? "").trim() || "Untitled post";
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const byTime = (a: ScheduledPost, b: ScheduledPost) =>
  new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();

async function api<T>(method: string, body?: unknown, path = ""): Promise<T> {
  const res = await fetch(`/api/schedule${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

const lvl = (v: number) => (v <= 0.02 ? "n" : v < 0.28 ? "l" : v < 0.55 ? "m" : v < 0.8 ? "h" : "p");
const LVL_NAME: Record<string, string> = {
  n: "quiet",
  l: "low",
  m: "medium",
  h: "high",
  p: "peak",
};

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusChip({ p }: { p: ScheduledPost }) {
  const label =
    p.status === "draft" && !p.media_url
      ? p.media_type === "IMAGE"
        ? "Needs image"
        : "Needs video"
      : STATUS_LABEL[p.status];
  return (
    <span className={`cal2-chip st-${p.status}`}>
      {p.status === "publishing" && <Loader2 size={10} className="cal2-spin" />}
      {p.status === "published" && <CheckCircle2 size={10} />}
      {p.status === "failed" && <AlertTriangle size={10} />}
      {label}
    </span>
  );
}

function MediaIcon({ type }: { type: MediaType }) {
  return type === "IMAGE" ? <ImageIcon size={11} /> : <Film size={11} />;
}

export default function CalendarBoard({
  posts,
  igUsername,
  connected,
  scheduled,
  userId,
  publish,
}: {
  posts: CalPost[];
  igUsername: string | null;
  connected: boolean;
  scheduled: ScheduledPost[];
  userId: string;
  publish: PublishInfo;
}) {
  // Everything date/timezone-dependent renders after mount so SSR (UTC) and the
  // browser never disagree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const [view, setView] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const [items, setItems] = useState<ScheduledPost[]>(() => [...scheduled].sort(byTime));
  const [composer, setComposer] = useState<{ post: ScheduledPost | null; at: Date; caption?: string } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const aud = useMemo(() => buildAudience(posts), [posts]);

  // Deep link from Analytics → "Follow-up": open a draft for tomorrow at the
  // audience's hour with the original post's first line as a starting caption.
  useEffect(() => {
    if (!now) return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.has("compose")) return;
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(suggestedHour(aud, (d.getDay() + 6) % 7), 0, 0, 0);
    setComposer({ post: null, at: d, caption: sp.get("caption") ?? "" });
    window.history.replaceState(null, "", "/calendar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const upsert = (p: ScheduledPost) =>
    setItems((xs) => {
      if (p.status === "cancelled") return xs.filter((x) => x.id !== p.id);
      const i = xs.findIndex((x) => x.id === p.id);
      return (i < 0 ? [...xs, p] : xs.map((x) => (x.id === p.id ? p : x))).sort(byTime);
    });
  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  // While Instagram is processing a video, refresh so the grid shows the outcome.
  const anyPublishing = items.some((p) => p.status === "publishing");
  useEffect(() => {
    if (!anyPublishing) return;
    const t = setInterval(async () => {
      try {
        const j = await api<{ posts: ScheduledPost[] }>("GET");
        setItems([...j.posts].sort(byTime));
      } catch {
        /* keep what we have */
      }
    }, 10000);
    return () => clearInterval(t);
  }, [anyPublishing]);

  const thisWeek = now
    ? items.filter((p) => {
        const t = new Date(p.scheduled_at).getTime();
        const m = mondayOf(now).getTime();
        return t >= m && t < m + 7 * DAY_MS;
      })
    : [];
  const openDays = now
    ? 7 - new Set(thisWeek.map((p) => (new Date(p.scheduled_at).getDay() + 6) % 7)).size
    : 0;

  // Hours are the viewer's, so this sentence exists only after mount (the
  // server would compute it in UTC and the text wouldn't match).
  const bestLine =
    now && aud.peak != null
      ? `${DOW[aud.peak.day]} around ${hourLabel(aud.peak.hour)} gets the most reach with your audience.`
      : null;

  const openNew = (date: Date, weekdayMonFirst: number) => {
    const d = new Date(date);
    d.setHours(suggestedHour(aud, weekdayMonFirst), 0, 0, 0);
    if (d.getTime() <= Date.now()) {
      // today, and the suggested hour already passed: next full hour
      const n = new Date();
      n.setMinutes(0, 0, 0);
      n.setHours(n.getHours() + 1);
      d.setTime(n.getTime());
    }
    setComposer({ post: null, at: d });
  };

  const drafts = items.filter((p) => p.status === "draft").length;
  const queued = items.filter((p) => p.status === "scheduled").length;
  const failed = items.filter((p) => p.status === "failed").length;

  return (
    <div className="cal2">
      <PageHeader
        title="Calendar"
        sub="Plan your week around when your audience is actually online."
        status={
          aud.enough && aud.peak && now ? (
            <div className="cal2-live">
              <span className="cal2-dot" aria-hidden />
              <b>Audience data</b>
              <span className="cal2-live-sep">·</span>
              <span>from your recent posts</span>
              <em>
                Best window: <b>{DOW[aud.peak.day]} {hourLabel(aud.peak.hour)}</b>
              </em>
            </div>
          ) : connected ? (
            <div className="cal2-live muted">Not enough posts yet to map your audience windows.</div>
          ) : (
            // The auto-publish banner below already carries the connect link;
            // saying it twice on one screen reads like nagging.
            <div className="cal2-live muted">Audience windows appear once your account is connected.</div>
          )
        }
        actions={
          <>
            <button type="button" className="ov-btn ghost" onClick={() => setPlanOpen(true)}>
              <CalendarPlus size={14} /> Schedule from Content Plan
            </button>
            <button
              type="button"
              className="ov-btn primary"
              onClick={() => now && openNew(now, (now.getDay() + 6) % 7)}
            >
              <Plus size={14} /> New post
            </button>
          </>
        }
      />

      {now && (
        <AutoPublishStatus
          now={now}
          connected={connected}
          igUsername={igUsername}
          publish={publish}
          queued={queued}
          drafts={drafts}
          failed={failed}
        />
      )}

      {/* calendar container */}
      <div className="cal2-card">
        {now && (
          <>
            <Toolbar
              now={now}
              view={view}
              setView={setView}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              monthOffset={monthOffset}
              setMonthOffset={setMonthOffset}
            />
            {view === "week" ? (
              <WeekGrid
                now={now}
                weekOffset={weekOffset}
                aud={aud}
                items={items}
                onOpen={(p) => setComposer({ post: p, at: new Date(p.scheduled_at) })}
                onNew={openNew}
              />
            ) : (
              <MonthGrid
                now={now}
                monthOffset={monthOffset}
                aud={aud}
                items={items}
                onOpen={(p) => setComposer({ post: p, at: new Date(p.scheduled_at) })}
                onNew={openNew}
              />
            )}
          </>
        )}
      </div>

      {/* intelligence bar */}
      <div className="cal2-insight">
        <span className="cal2-insight-ico">
          <Lightbulb size={15} />
        </span>
        <div className="cal2-insight-body">
          <b>Optimal times, based on your audience.</b>
          <p>
            {bestLine ??
              "Connect your Instagram and SOCIA maps when your audience actually engages."}
            {bestLine && openDays > 0 && (
              <> {openDays} day{openDays === 1 ? " is" : "s are"} still open this week.</>
            )}
          </p>
        </div>
        <Link href="/analytics" className="cal2-insight-link">
          View audience insights <ArrowRight size={13} />
        </Link>
      </div>

      {/* legend */}
      <div className="cal2-legend">
        <span className="cal2-legend-label">
          Audience activity{aud.enough ? " · est. from your Instagram posts" : ""}
        </span>
        <span className="cal2-key"><i className="l" /> Low</span>
        <span className="cal2-key"><i className="m" /> Medium</span>
        <span className="cal2-key"><i className="h" /> High</span>
        <span className="cal2-key"><i className="p" /> Peak</span>
        <span className="cal2-tz">
          <Info size={11} /> Times shown in your device&apos;s time zone
        </span>
      </div>

      {composer && (
        <Composer
          post={composer.post}
          at={composer.at}
          initialCaption={composer.caption}
          userId={userId}
          connected={connected}
          onClose={() => setComposer(null)}
          onSaved={upsert}
          onRemoved={remove}
          notify={setNotice}
        />
      )}
      {planOpen && now && (
        <PlanModal
          aud={aud}
          now={now}
          onClose={() => setPlanOpen(false)}
          onCreated={(ps) => ps.forEach(upsert)}
          notify={setNotice}
        />
      )}
      {notice && (
        <div className="cal2-notice" role="status">
          {notice}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Whether posts will actually go out by themselves, stated from facts:
 *  connection, granted permission, publisher configured, publisher recently ran. */
function AutoPublishStatus({
  now,
  connected,
  igUsername,
  publish,
  queued,
  drafts,
  failed,
}: {
  now: Date;
  connected: boolean;
  igUsername: string | null;
  publish: PublishInfo;
  queued: number;
  drafts: number;
  failed: number;
}) {
  if (!connected) {
    return (
      <div className="cal2-auto off">
        <AlertTriangle size={14} />
        <span>
          <b>Auto-publishing is off.</b> <Link href="/settings">Connect Instagram</Link> to publish
          from SOCIA.
        </span>
      </div>
    );
  }
  const perm =
    publish.canPublish === true
      ? "ok"
      : publish.canPublish === false
        ? "denied"
        : "unknown";
  const staleMs = publish.lastRunAt ? now.getTime() - new Date(publish.lastRunAt).getTime() : null;
  const running = staleMs !== null && staleMs < 20 * 60_000;
  const ready = perm === "ok" && publish.configured && running;
  return (
    <div className={`cal2-auto ${ready ? "on" : "warn"}`}>
      {ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      <span>
        {ready ? (
          <>
            <b>Auto-publishing is on for @{igUsername}.</b> Publisher last ran {ago(staleMs!)};
            scheduled posts go out within a few minutes of their time.
          </>
        ) : perm === "denied" ? (
          <>
            <b>Instagram hasn&apos;t granted publishing permission.</b>{" "}
            <Link href="/settings">Reconnect Instagram</Link> and approve
            &ldquo;publish content&rdquo; to enable it.
          </>
        ) : perm === "unknown" ? (
          <>
            <b>Publishing permission not confirmed yet.</b>{" "}
            <Link href="/settings">Reconnect Instagram</Link> once to grant
            &ldquo;publish content&rdquo;. You can still try Publish now on any post.
          </>
        ) : !publish.configured ? (
          <>
            <b>The auto-publisher isn&apos;t set up on this deployment yet.</b> Scheduled posts
            wait; Publish now works on any post with a video.
          </>
        ) : staleMs === null ? (
          <>
            <b>The publisher hasn&apos;t run yet.</b> Once its 5-minute schedule is live this turns
            on; until then use Publish now.
          </>
        ) : (
          <>
            <b>The publisher last ran {ago(staleMs)}.</b> It should run every 5 minutes; scheduled
            posts wait until it does.
          </>
        )}
      </span>
      <span className="cal2-auto-counts">
        {queued > 0 && <em>{queued} scheduled</em>}
        {drafts > 0 && <em>{drafts} draft{drafts === 1 ? "" : "s"}</em>}
        {failed > 0 && <em className="bad">{failed} failed</em>}
      </span>
    </div>
  );
}

function Toolbar({
  now,
  view,
  setView,
  weekOffset,
  setWeekOffset,
  monthOffset,
  setMonthOffset,
}: {
  now: Date;
  view: "week" | "month";
  setView: (v: "week" | "month") => void;
  weekOffset: number;
  setWeekOffset: (fn: (n: number) => number) => void;
  monthOffset: number;
  setMonthOffset: (fn: (n: number) => number) => void;
}) {
  let label: string;
  if (view === "week") {
    const start = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY_MS);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    const sameMonth = start.getMonth() === end.getMonth();
    const f = (d: Date, m: boolean) =>
      d.toLocaleDateString("en-US", { month: m ? "short" : undefined, day: "numeric" });
    label = `${f(start, true)} – ${f(end, !sameMonth)}, ${end.getFullYear()}`;
  } else {
    const m = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    label = m.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const nav = (dir: 1 | -1) =>
    view === "week" ? setWeekOffset((n) => n + dir) : setMonthOffset((n) => n + dir);
  const isNow = view === "week" ? weekOffset === 0 : monthOffset === 0;

  return (
    <div className="cal2-toolbar">
      <div className="cal2-tb-left">
        <button className="cal2-nav" onClick={() => nav(-1)} aria-label="Previous" type="button">
          <ChevronLeft size={15} />
        </button>
        <span className="cal2-range">{label}</span>
        <button className="cal2-nav" onClick={() => nav(1)} aria-label="Next" type="button">
          <ChevronRight size={15} />
        </button>
        {!isNow && (
          <button
            className="cal2-today"
            type="button"
            onClick={() => (view === "week" ? setWeekOffset(() => 0) : setMonthOffset(() => 0))}
          >
            Today
          </button>
        )}
      </div>
      <div className="cal2-tb-right">
        <div className="cal2-seg" role="tablist">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
              onClick={() => setView(v)}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostCard({ p, onOpen }: { p: ScheduledPost; onOpen: (p: ScheduledPost) => void }) {
  return (
    <button type="button" className={`cal2-post st-${p.status}`} onClick={() => onOpen(p)}>
      <span className="cal2-time">{fmtTime(p.scheduled_at)}</span>
      <span className="cal2-title">{firstLine(p.caption)}</span>
      <span className="cal2-meta">
        <span className="cal2-plat">
          <MediaIcon type={p.media_type} /> {p.media_type === "IMAGE" ? "Image" : "Reel"}
        </span>
        <StatusChip p={p} />
      </span>
      {p.status === "failed" && p.error && <span className="cal2-err">{p.error}</span>}
    </button>
  );
}

function WeekGrid({
  now,
  weekOffset,
  aud,
  items,
  onOpen,
  onNew,
}: {
  now: Date;
  weekOffset: number;
  aud: Audience;
  items: ScheduledPost[];
  onOpen: (p: ScheduledPost) => void;
  onNew: (date: Date, weekdayMonFirst: number) => void;
}) {
  const monday = new Date(mondayOf(now).getTime() + weekOffset * 7 * DAY_MS);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="cal2-grid" key={weekOffset /* re-run entrance animation per week */}>
      {DOW.map((dow, i) => {
        const date = new Date(monday.getTime() + i * DAY_MS);
        const isToday = sameDay(date, now);
        const isPast = date.getTime() < todayStart.getTime();
        const best = aud.bestDays.includes(i);
        const dayEvents = items.filter((p) => sameDay(new Date(p.scheduled_at), date));
        const bars = aud.days[i];
        const bestHour = aud.bestHour(i);
        const strength = bars[bestHour] ?? 0;

        return (
          <div className={`cal2-col${best ? " best" : ""}${isPast ? " past" : ""}`} key={dow}>
            <div className="cal2-dayhead">
              <span className="cal2-dow">{dow}</span>
              <span className={`cal2-num${isToday ? " today" : ""}`}>{date.getDate()}</span>
              {best && (
                <span className="cal2-best">
                  <Star size={9} fill="currentColor" /> BEST
                </span>
              )}
            </div>

            <div className="cal2-slots">
              {best && aud.enough && !isPast && (
                <div className="cal2-window">
                  <small>Best window</small>
                  <b>{hourLabel(bestHour)}</b>
                  <span className="cal2-meter" aria-hidden>
                    {Array.from({ length: 10 }, (_, s) => (
                      <i key={s} className={s < Math.round(strength * 10) ? "on" : ""} />
                    ))}
                  </span>
                  <em>Peak activity</em>
                </div>
              )}

              {dayEvents.map((p) => (
                <PostCard p={p} key={p.id} onOpen={onOpen} />
              ))}

              {!isPast && (
                <button type="button" className="cal2-add" onClick={() => onNew(date, i)}>
                  <Plus size={14} />
                  <span>{dayEvents.length ? "Add another" : "Schedule post"}</span>
                </button>
              )}
            </div>

            {aud.enough && (
              <div className="cal2-bars">
                <div className="cal2-bars-row">
                  {bars.map((v, h) => (
                    <i
                      key={h}
                      className={`b-${lvl(v)}`}
                      style={{
                        height: `${Math.max(9, Math.round(v * 100))}%`,
                        animationDelay: `${i * 40 + h * 9}ms`,
                      }}
                      title={`${hourLabel(h)} — ${LVL_NAME[lvl(v)]} (est. from your posts)`}
                    />
                  ))}
                </div>
                <div className="cal2-bars-x">
                  <span>12a</span>
                  <span>12p</span>
                  <span>12a</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  now,
  monthOffset,
  aud,
  items,
  onOpen,
  onNew,
}: {
  now: Date;
  monthOffset: number;
  aud: Audience;
  items: ScheduledPost[];
  onOpen: (p: ScheduledPost) => void;
  onNew: (date: Date, weekdayMonFirst: number) => void;
}) {
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const eventByDate = new Map<string, ScheduledPost[]>();
  for (const p of items) {
    const k = new Date(p.scheduled_at).toDateString();
    eventByDate.set(k, [...(eventByDate.get(k) ?? []), p]);
  }

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)
    ),
  ];

  return (
    <div className="cal2-month">
      <div className="cal2-mhead">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal2-mgrid">
        {cells.map((d, i) => {
          if (!d) return <div className="cal2-mcell blank" key={`b${i}`} />;
          const wd = (d.getDay() + 6) % 7;
          const best = aud.bestDays.includes(wd);
          const isPast = d.getTime() < todayStart.getTime();
          const evs = eventByDate.get(d.toDateString()) ?? [];
          return (
            <div className={`cal2-mcell${best ? " best" : ""}${isPast ? " past" : ""}`} key={d.getTime()}>
              <span className={`cal2-mnum${sameDay(d, now) ? " today" : ""}`}>{d.getDate()}</span>
              {evs.map((p) => (
                <button
                  type="button"
                  className={`cal2-mevent st-${p.status}`}
                  key={p.id}
                  title={`${fmtTime(p.scheduled_at)} · ${firstLine(p.caption)} · ${STATUS_LABEL[p.status]}`}
                  onClick={() => onOpen(p)}
                >
                  {firstLine(p.caption)}
                </button>
              ))}
              {!isPast && (
                <button
                  type="button"
                  className="cal2-madd"
                  aria-label={`Schedule a post on ${fmtDay(d)}`}
                  onClick={() => onNew(d, wd)}
                >
                  <Plus size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ modals */

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cal2-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`cal2-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="cal2-modal-head">
          <h2>{title}</h2>
          <button type="button" className="cal2-x" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Create or edit one post: time, caption, media (uploaded to the user's own
 *  folder in the `scheduled-media` bucket), then save, publish now, or remove. */
function Composer({
  post,
  at,
  initialCaption,
  userId,
  connected,
  onClose,
  onSaved,
  onRemoved,
  notify,
}: {
  post: ScheduledPost | null;
  at: Date;
  initialCaption?: string;
  userId: string;
  connected: boolean;
  onClose: () => void;
  onSaved: (p: ScheduledPost) => void;
  onRemoved: (id: string) => void;
  notify: (s: string) => void;
}) {
  const [when, setWhen] = useState(toLocalInput(post ? new Date(post.scheduled_at) : at));
  const [caption, setCaption] = useState(post?.caption ?? initialCaption ?? "");
  const [mediaType, setMediaType] = useState<MediaType>(post?.media_type ?? "REELS");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"save" | "upload" | "publish" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const locked = post?.status === "published" || post?.status === "publishing";
  const hasMedia = Boolean(post?.media_url) || Boolean(file);
  const whenDate = new Date(when);
  const whenValid = !Number.isNaN(whenDate.getTime());
  const missing = readiness({
    media_url: hasMedia ? "x" : null,
    caption,
    scheduled_at: whenValid ? whenDate.toISOString() : new Date(0).toISOString(),
  }).missing;

  const persist = async (): Promise<ScheduledPost> => {
    const body = { scheduled_at: whenDate.toISOString(), caption, media_type: mediaType };
    let cur: ScheduledPost;
    if (!post) {
      cur = (await api<{ posts: ScheduledPost[] }>("POST", body)).posts[0];
    } else {
      cur = (await api<{ post: ScheduledPost }>("PATCH", { id: post.id, ...body })).post;
    }
    if (file) {
      setBusy("upload");
      const supabase = createClient();
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${userId}/${cur.id}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("scheduled-media")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const { data: pub } = supabase.storage.from("scheduled-media").getPublicUrl(path);
      if (cur.media_path) await supabase.storage.from("scheduled-media").remove([cur.media_path]);
      cur = (
        await api<{ post: ScheduledPost }>("PATCH", { id: cur.id, media_path: path, media_url: pub.publicUrl })
      ).post;
    }
    onSaved(cur);
    return cur;
  };

  const save = async () => {
    if (!whenValid) return setErr("Pick a valid date and time.");
    setErr(null);
    setBusy("save");
    try {
      const cur = await persist();
      notify(
        cur.status === "scheduled"
          ? `Scheduled for ${fmtDay(cur.scheduled_at)} at ${fmtTime(cur.scheduled_at)}.`
          : `Saved as a draft. It still needs ${readiness(cur).missing.join(" and ")} before it can go out.`
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const publishNow = async () => {
    if (!whenValid) return setErr("Pick a valid date and time.");
    setErr(null);
    setBusy("save");
    try {
      const cur = await persist();
      setBusy("publish");
      const j = await api<{ result: string; post: ScheduledPost }>("POST", undefined, `/publish?id=${cur.id}`);
      onSaved(j.post);
      if (j.post.status === "published") notify("Published to Instagram.");
      else if (j.post.status === "publishing") notify("Instagram is still processing the video. The calendar updates when it's live.");
      else notify(j.post.error ?? "Instagram didn't publish the post.");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const removePost = async () => {
    if (!post) return onClose();
    setBusy("remove");
    try {
      await api("DELETE", { id: post.id });
      onRemoved(post.id);
      notify("Post removed.");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't remove the post.");
      setBusy(null);
    }
  };

  const accept = mediaType === "IMAGE" ? "image/jpeg" : "video/mp4,video/quicktime";
  const busyLabel =
    busy === "upload" ? "Uploading…" : busy === "publish" ? "Publishing…" : busy === "save" ? "Saving…" : null;

  return (
    <Modal title={post ? "Edit post" : "New post"} onClose={onClose}>
      {post && (
        <div className={`cal2-status st-${post.status}`}>
          <StatusChip p={post} />
          {post.plan_day && <span className="cal2-from-plan">From your Content Plan · {post.plan_day}</span>}
          {post.status === "published" && post.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="cal2-permalink">
              View on Instagram <ExternalLink size={12} />
            </a>
          )}
          {post.status === "failed" && post.error && <p className="cal2-status-err">{post.error}</p>}
        </div>
      )}

      <label className="cal2-field">
        <span>Date and time</span>
        <input
          type="datetime-local"
          value={when}
          disabled={locked}
          onChange={(e) => setWhen(e.target.value)}
        />
      </label>

      <div className="cal2-field">
        <span>Format</span>
        <div className="cal2-seg" role="tablist">
          {(["REELS", "IMAGE"] as MediaType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mediaType === t}
              className={mediaType === t ? "on" : ""}
              disabled={locked}
              onClick={() => setMediaType(t)}
            >
              {t === "REELS" ? "Reel" : "Image"}
            </button>
          ))}
        </div>
      </div>

      <div className="cal2-field">
        <span>{mediaType === "IMAGE" ? "Image (JPG)" : "Video (MP4 or MOV)"}</span>
        {post?.media_url && !file && (
          <div className="cal2-media">
            {post.media_type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.media_url} alt="" />
            ) : (
              <video src={post.media_url} controls preload="metadata" />
            )}
          </div>
        )}
        {!locked && (
          <label className={`cal2-upload${file ? " has" : ""}`}>
            <Upload size={14} />
            <span>{file ? file.name : post?.media_url ? "Replace file" : "Choose file"}</span>
            <input
              type="file"
              accept={accept}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        {!hasMedia && (
          <small className="cal2-hint">The post stays a draft until a file is attached.</small>
        )}
      </div>

      <label className="cal2-field">
        <span>
          Caption <em>{caption.length}/{CAPTION_MAX}</em>
        </span>
        <textarea
          rows={6}
          maxLength={CAPTION_MAX}
          value={caption}
          disabled={locked}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="First line is the hook. Hashtags go at the end."
        />
      </label>

      {err && <p className="cal2-form-err">{err}</p>}

      <div className="cal2-modal-actions">
        {post && !locked && (
          <button type="button" className="cal2-btn danger" disabled={busy !== null} onClick={removePost}>
            <Trash2 size={13} /> Remove
          </button>
        )}
        <span className="cal2-grow" />
        {!locked && (
          <>
            <button
              type="button"
              className="cal2-btn ghost"
              disabled={busy !== null || !connected || !hasMedia}
              title={!connected ? "Connect Instagram first" : !hasMedia ? "Attach a file first" : "Send this post to Instagram right now"}
              onClick={publishNow}
            >
              {busy === "publish" ? <Loader2 size={13} className="cal2-spin" /> : null} Publish now
            </button>
            <button type="button" className="cal2-btn primary" disabled={busy !== null} onClick={save}>
              {busyLabel ?? (missing.length === 0 ? "Schedule" : "Save draft")}
            </button>
          </>
        )}
        {locked && (
          <button type="button" className="cal2-btn primary" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      {!locked && missing.length > 0 && (
        <p className="cal2-hint center">Needs {missing.join(" and ")} to be scheduled.</p>
      )}
    </Modal>
  );
}

type PlanRow = {
  id: string;
  client_handle: string | null;
  niche: string | null;
  platform: string | null;
  created_at: string;
  data: { weeklyPlan?: { day: string; concept: string; hook: string; format: string }[] } | null;
};

/** Turn a saved Content Plan's week into dated drafts. Each draft lands on its
 *  weekday at the audience's best hour for that day (noon when unknown). */
function PlanModal({
  aud,
  now,
  onClose,
  onCreated,
  notify,
}: {
  aud: Audience;
  now: Date;
  onClose: () => void;
  onCreated: (ps: ScheduledPost[]) => void;
  notify: (s: string) => void;
}) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  // Thursday or later (or Sunday): most of this week is gone, default to next.
  const [week, setWeek] = useState<"this" | "next">(() =>
    now.getDay() === 0 || now.getDay() >= 4 ? "next" : "this"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((j: { plans?: PlanRow[] }) => {
        const rows = (j.plans ?? []).filter((p) => (p.data?.weeklyPlan?.length ?? 0) > 0);
        setPlans(rows);
        setPick(rows[0]?.id ?? null);
      })
      .catch(() => setPlans([]));
  }, []);

  const plan = plans?.find((p) => p.id === pick) ?? null;
  const weekStart = new Date(mondayOf(now).getTime() + (week === "next" ? 7 : 0) * DAY_MS);
  const { drafts, skipped } = draftsFromPlan(
    plan?.data?.weeklyPlan ?? [],
    weekStart,
    (wd) => suggestedHour(aud, (wd + 6) % 7)
  );
  const usable = drafts.filter((d) => new Date(d.scheduled_at).getTime() > now.getTime());
  const passed = drafts.length - usable.length;

  const create = async () => {
    if (!plan || usable.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ posts: ScheduledPost[] }>("POST", {
        items: usable.map((d) => ({ ...d, plan_id: plan.id })),
      });
      onCreated(j.posts);
      notify(
        `${j.posts.length} draft${j.posts.length === 1 ? "" : "s"} added for the week of ${fmtDay(weekStart)}. Open each day to attach its video.`
      );
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the drafts.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Schedule from Content Plan" onClose={onClose} wide>
      {plans === null ? (
        <p className="cal2-hint">Loading your plans…</p>
      ) : plans.length === 0 ? (
        <div className="cal2-empty">
          <p>No saved Content Plan with a weekly schedule yet.</p>
          <Link href="/tool" className="cal2-btn primary">
            Build a plan
          </Link>
        </div>
      ) : (
        <>
          <div className="cal2-field">
            <span>Plan</span>
            <div className="cal2-planlist">
              {plans.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`cal2-planrow${p.id === pick ? " on" : ""}`}
                  onClick={() => setPick(p.id)}
                >
                  <b>{p.client_handle ? `@${p.client_handle.replace(/^@/, "")}` : p.niche || "Content Plan"}</b>
                  <span>
                    {p.data?.weeklyPlan?.length} posts · {p.niche || "—"} ·{" "}
                    {new Date(p.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="cal2-field">
            <span>Week</span>
            <div className="cal2-seg" role="tablist">
              {(["this", "next"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={week === w}
                  className={week === w ? "on" : ""}
                  onClick={() => setWeek(w)}
                >
                  {w === "this" ? "This week" : "Next week"}
                </button>
              ))}
            </div>
          </div>

          {plan && (
            <div className="cal2-field">
              <span>
                What gets added{" "}
                <em>
                  {aud.enough ? "at your audience's best hour" : "at 12 PM (no audience data yet)"}
                </em>
              </span>
              <ul className="cal2-preview">
                {drafts.map((d) => {
                  const past = new Date(d.scheduled_at).getTime() <= now.getTime();
                  return (
                    <li key={d.plan_day + d.scheduled_at} className={past ? "past" : ""}>
                      <b>{fmtDay(d.scheduled_at)}</b>
                      <span>{fmtTime(d.scheduled_at)}</span>
                      <span className="cal2-plat">
                        <MediaIcon type={d.media_type} /> {d.media_type === "IMAGE" ? "Image" : "Reel"}
                      </span>
                      <i>{firstLine(d.caption)}</i>
                      {past && <em>already passed</em>}
                    </li>
                  );
                })}
              </ul>
              {skipped.length > 0 && (
                <small className="cal2-hint">
                  Not placed (no weekday in the plan): {skipped.join(", ")}.
                </small>
              )}
              {passed > 0 && (
                <small className="cal2-hint">
                  {passed} day{passed === 1 ? " has" : "s have"} already passed this week and won&apos;t be added.
                </small>
              )}
              <small className="cal2-hint">
                Each post is created as a draft with the plan&apos;s hook and concept as its caption. Attach a video to
                each one and it&apos;s scheduled.
              </small>
            </div>
          )}

          {err && <p className="cal2-form-err">{err}</p>}

          <div className="cal2-modal-actions">
            <span className="cal2-grow" />
            <button type="button" className="cal2-btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="cal2-btn primary"
              disabled={busy || !plan || usable.length === 0}
              onClick={create}
            >
              {busy ? "Adding…" : `Add ${usable.length} draft${usable.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
