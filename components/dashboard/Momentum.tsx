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

type Step = { id: string; label: string; href: string; done: boolean };
type Data = {
  off?: boolean;
  firstWeek?: { show: boolean; steps: Step[]; done: boolean; left: number; rewarded: boolean };
  streak?: { weeks: number; strip: boolean[]; thisWeek: boolean; goal: number; rewarded: boolean };
  perk?: { words: string; buys: string };
};

export default function Momentum() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/perks").then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (alive) setD(j); }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);
  if (!d || d.off || !d.firstWeek || !d.streak || !d.perk) return null;
  const { firstWeek: fw, streak, perk } = d;
  const showStreak = streak.weeks > 0 || streak.strip.some(Boolean);
  if (!fw.show && !showStreak) return null;
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
