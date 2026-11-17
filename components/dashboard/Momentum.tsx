"use client";

// Dashboard: the first-week list for a new account and the posting streak
// (lib/perks). Both are counted on the server from what the account has
// really done. The list is four real tasks with a link to each, shown only
// until they are done; it stands in for nothing else on the page, and there
// is no animation or score attached to it. Renders nothing when there is
// nothing to show.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Card, CardHeader } from "@/components/system";
import Sio from "@/components/sio/Sio";

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
  next: { days: number; from: string } | null;
  platforms: string[];
  breaks: { thisWeek: boolean; nextWeek: boolean; canPlanThis: boolean; canPlanNext: boolean };
};

const STATE_WORD = { hit: "target met", miss: "target missed", break: "planned break", open: "this week, still open" } as const;
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");
const dayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** The streak against the person's own posting target: this week first, then the weeks behind it, with the rules in view. */
function PostingStreakCard({ p, perk, onChange }: { p: Posting; perk: { words: string; buys: string }; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toGo = Math.max(0, p.goal - p.weeks);
  const t = p.thisWeek;
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
      <CardHeader title="Posting streak" period={p.weeks === 1 ? "1 week in a row" : `${p.weeks} weeks in a row`} />
      <div className="mom-sio">
        <Sio size={48} shadow={false} expression={t.qualified ? "happy" : "neutral"} />
        <p>{p.line}</p>
      </div>
      {!t.is_break && (
        <ol className="mom-days" aria-label={`${t.days} of ${t.target} posting days this week`}>
          {Array.from({ length: Math.max(t.target, Math.min(7, t.days)) }, (_, i) => <li key={i} className={i < t.days ? "is-on" : undefined} aria-hidden />)}
        </ol>
      )}
      <ol className="mom-strip" aria-label={`The last ${p.strip.length} weeks, oldest first: ${p.strip.map((x) => STATE_WORD[x.state]).join(", ")}`}>
        {p.strip.map((x) => <li key={x.week_start} className={`is-${x.state}`} aria-hidden />)}
      </ol>
      <p className="mom-note">
        {p.rewarded
          ? `${p.goal} weeks in a row: ${perk.words} were added to your balance.`
          : toGo > 0 ? `${toGo} more ${toGo === 1 ? "week" : "weeks"} in a row at your target and you get ${perk.words}.` : "Keep meeting your target to keep it going."}
        {p.longest > p.weeks ? ` Your longest so far is ${p.longest} weeks.` : ""}
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
