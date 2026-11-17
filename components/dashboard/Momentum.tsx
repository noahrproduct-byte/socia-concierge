"use client";

// Dashboard: the first-week list for a new account and the posting streak
// (lib/perks). Both are counted on the server from what the account has
// really done. The list is four real tasks with a link to each, shown only
// until they are done; it stands in for nothing else on the page, and there
// is no animation or score attached to it. Renders nothing when there is
// nothing to show.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Minus, Pause } from "lucide-react";
import { Card, CardHeader } from "@/components/system";
import Sio from "@/components/sio/Sio";
import { weekDayCells } from "@/lib/postingStreak";

type Step = { id: string; label: string; href: string; done: boolean };
type Data = {
  off?: boolean;
  firstWeek?: { show: boolean; steps: Step[]; done: boolean; left: number; rewarded: boolean };
  streak?: { weeks: number; strip: boolean[]; thisWeek: boolean; goal: number; rewarded: boolean };
  /** The streak by posting days against the person's own target (lib/postingStreak.ts); null until its tables exist. */
  posting?: Posting | null;
  perk?: { words: string; buys: string };
};
type Posting = {
  weeks: number; longest: number; goal: number; rewarded: boolean; line: string;
  strip: { week_start: string; state: "hit" | "miss" | "break" | "open" }[];
  thisWeek: { days: number; target: number; qualified: boolean; is_break: boolean };
  /** This week on the calendar: its Monday, today, and the days with a post so far. */
  week?: { start: string; today: string; posted: string[] };
  next: { days: number; from: string } | null;
  platforms: string[];
  breaks: { thisWeek: boolean; nextWeek: boolean; canPlanThis: boolean; canPlanNext: boolean };
};

const STATE_WORD = { hit: "target met", miss: "target missed", break: "planned break", open: "this week, still open" } as const;
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");
const DAY_WORD = { posted: "posted", today: "today, no post yet", past: "no post", later: "still to come" } as const;
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const weekdayOf = (iso: string, width: "narrow" | "long") => at(iso).toLocaleDateString("en-US", { weekday: width, timeZone: "UTC" });
const shortDate = (iso: string) => at(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** The streak against the person's own posting target: this week first, then the weeks behind it, with the rules in view. */
function PostingStreakCard({ p, perk, onChange }: { p: Posting; perk: { words: string; buys: string }; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toGo = Math.max(0, p.goal - p.weeks);
  const t = p.thisWeek;
  const cells = p.week ? weekDayCells(p.week.start, p.week.today, p.week.posted) : null;
  async function setBreak(week: "this" | "next", on: boolean) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/streak/break", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, on }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "SOCIA couldn't save that just now. Try again."); return; }
    onChange();
  }
  return (
    <Card className="dash-lift">
      <CardHeader title="Posting streak" />
      <div className="mom-sio">
        <Sio size={48} shadow={false} expression={t.qualified ? "happy" : "neutral"} />
        <p>{p.line}</p>
      </div>
      <div className="pst">
        <div className="pst-count">
          <span className="pst-n">{p.weeks}</span>
          <span className="pst-of">{p.weeks === 1 ? "week in a row" : "weeks in a row"}</span>
          {p.longest > p.weeks && <span className="pst-best">Longest {p.longest} {p.longest === 1 ? "week" : "weeks"}</span>}
        </div>
        <div className="pst-block">
          <p className="pst-head">
            <span>This week</span>
            <span>{t.is_break ? "Planned break" : `${t.days} of ${t.target} posting ${t.target === 1 ? "day" : "days"}`}</span>
          </p>
          {cells ? (
            <ol className="pst-cells is-days">
              {cells.map((c) => (
                <li key={c.date} className={`is-${c.state}${t.is_break ? " is-break" : ""}`} title={`${weekdayOf(c.date, "long")}, ${shortDate(c.date)}: ${DAY_WORD[c.state]}`}>
                  <span className="pst-box" aria-hidden>{c.state === "posted" ? <Check size={14} /> : null}</span>
                  <span className="pst-tag" aria-hidden>{weekdayOf(c.date, "narrow")}</span>
                  <span className="sr-only">{weekdayOf(c.date, "long")}: {DAY_WORD[c.state]}</span>
                </li>
              ))}
            </ol>
          ) : (
            // An older reply without the calendar days: the count alone.
            <ol className="pst-cells" aria-label={`${t.days} of ${t.target} posting days this week`}>
              {Array.from({ length: Math.max(t.target, Math.min(7, t.days)) }, (_, i) => (
                <li key={i} className={i < t.days ? "is-posted" : "is-later"}><span className="pst-box" aria-hidden>{i < t.days ? <Check size={14} /> : null}</span></li>
              ))}
            </ol>
          )}
        </div>
        <div className="pst-block">
          <p className="pst-head"><span>Last {p.strip.length} weeks</span></p>
          <ol className="pst-cells is-weeks">
            {p.strip.map((x) => (
              <li key={x.week_start} className={`is-${x.state}`} title={`Week of ${shortDate(x.week_start)}: ${STATE_WORD[x.state]}`}>
                <span className="pst-box" aria-hidden>{x.state === "hit" ? <Check size={14} /> : x.state === "miss" ? <Minus size={14} /> : x.state === "break" ? <Pause size={12} /> : null}</span>
                <span className="sr-only">Week of {shortDate(x.week_start)}: {STATE_WORD[x.state]}</span>
              </li>
            ))}
          </ol>
          {p.strip.length > 1 && (
            <p className="pst-ends" aria-hidden><span>{shortDate(p.strip[0].week_start)}</span><span>This week</span></p>
          )}
          <p className="pst-key" aria-hidden>
            <span><span className="pst-box is-hit"><Check size={10} /></span> Target met</span>
            <span><span className="pst-box is-miss"><Minus size={10} /></span> Missed</span>
            {p.strip.some((x) => x.state === "break") && <span><span className="pst-box is-break"><Pause size={9} /></span> Break</span>}
          </p>
        </div>
      </div>
      <p className="mom-note">
        {p.rewarded
          ? `${p.goal} weeks in a row: ${perk.words} were added to your balance.`
          : toGo > 0 ? `${toGo} more ${toGo === 1 ? "week" : "weeks"} in a row at your target and you get ${perk.words}.` : "Keep meeting your target to keep it going."}
      </p>
      {p.next && <p className="mom-note">Your new target of {p.next.days} posting {p.next.days === 1 ? "day" : "days"} a week starts {dayOf(p.next.from)}. This week keeps the target it began with.</p>}
      <details className="mom-rules">
        <summary>How the streak counts</summary>
        <ul>
          <li>A posting day is a day with at least one published post{p.platforms.length ? ` on ${list(p.platforms)}` : " on a connected account"}. Several posts on one day are one posting day.</li>
          <li>A week runs Monday to Sunday in your own time zone, and qualifies when you reach your target of posting days.</li>
          <li>Scheduled posts count once they are published. If SOCIA fails to publish one, that day still counts.</li>
          <li>A change of target starts the following Monday. Weeks already finished are never counted again.</li>
          <li>A planned break week neither counts nor breaks the streak. You can plan two in any twelve weeks.</li>
        </ul>
      </details>
      <div className="mom-breaks">
        {p.breaks.thisWeek
          ? <button type="button" className="ob-linkbtn" disabled={busy} onClick={() => void setBreak("this", false)}>Cancel this week&apos;s break</button>
          : p.breaks.canPlanThis && <button type="button" className="ob-linkbtn" disabled={busy} onClick={() => void setBreak("this", true)}>Make this week a break</button>}
        {p.breaks.nextWeek
          ? <button type="button" className="ob-linkbtn" disabled={busy} onClick={() => void setBreak("next", false)}>Cancel next week&apos;s break</button>
          : p.breaks.canPlanNext && <button type="button" className="ob-linkbtn" disabled={busy} onClick={() => void setBreak("next", true)}>Plan a break next week</button>}
      </div>
      {err && <p className="mom-note" role="alert">{err}</p>}
    </Card>
  );
}

export default function Momentum() {
  const [d, setD] = useState<Data | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/perks").then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (alive) setD(j); }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, [tick]);
  if (!d || d.off || !d.firstWeek || !d.streak || !d.perk) return null;
  const { firstWeek: fw, streak, perk } = d;
  const posting = d.posting ?? null;
  // The streak by posting days shows once the person has a target of their own (even one that starts next week) or has posted; before its tables exist, the older streak does.
  const showPosting = Boolean(posting) && (posting!.thisWeek.target > 1 || Boolean(posting!.next) || posting!.weeks > 0 || posting!.thisWeek.days > 0 || posting!.strip.some((x) => x.state === "hit" || x.state === "break"));
  const showStreak = !posting && (streak.weeks > 0 || streak.strip.some(Boolean));
  if (!fw.show && !showStreak && !showPosting) return null;
  const toGo = Math.max(0, streak.goal - streak.weeks);
  return (
    <div className="mom">
      {fw.show && (
        <Card className="dash-lift">
          <CardHeader title="Your first week" period={fw.done ? "All four done" : `${fw.steps.length - fw.left} of ${fw.steps.length} done`} />
          <ul className="mom-steps">
            {fw.steps.map((s) => (
              <li key={s.id} className={s.done ? "is-done" : undefined}>
                <span className="mom-tick" aria-hidden>{s.done ? <Check size={13} /> : null}</span>
                {s.done ? <span>{s.label} <span className="sr-only">(done)</span></span> : <Link href={s.href} className="s-link">{s.label}</Link>}
              </li>
            ))}
          </ul>
          <p className="mom-note">
            {fw.done && fw.rewarded
              ? `All four are done, so ${perk.words} were added to your balance.`
              : `Finish all four and you get ${perk.words} (${perk.buys}).`}
          </p>
        </Card>
      )}
      {showPosting && <PostingStreakCard p={posting!} perk={perk} onChange={() => setTick((n) => n + 1)} />}
      {showStreak && (
        <Card className="dash-lift">
          <CardHeader title="Posting streak" period={streak.weeks === 1 ? "1 week in a row" : `${streak.weeks} weeks in a row`} />
          <ol className="mom-strip" aria-label={`The last ${streak.strip.length} weeks, oldest first: ${streak.strip.map((x) => (x ? "posted" : "no post")).join(", ")}`}>
            {streak.strip.map((x, i) => <li key={i} className={x ? "is-on" : undefined} aria-hidden />)}
          </ol>
          <p className="mom-note">
            A week counts when at least one post is published through SOCIA.{" "}
            {streak.rewarded
              ? `${streak.goal} in a row: ${perk.words} were added to your balance.`
              : streak.weeks >= streak.goal
                ? streak.thisWeek ? "Keep it going next week." : "Post this week to keep it going."
                : !streak.thisWeek && streak.weeks > 0
                  ? `Post this week to keep it going. ${toGo} more ${toGo === 1 ? "week" : "weeks"} and you get ${perk.words}.`
                  : `${toGo} more ${toGo === 1 ? "week" : "weeks"} in a row and you get ${perk.words}.`}
          </p>
        </Card>
      )}
    </div>
  );
}
