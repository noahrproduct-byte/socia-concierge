// The Overview's intelligence sections (lib/intel/overview.ts): the growth
// briefing, what is working, the next three actions, goal progress and
// recent learning. Each line shows where it came from; nothing here is a
// sample, and an empty section says what it is waiting for.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardSource, Empty, ButtonLink } from "@/components/system";
import { GOAL_PLATFORM_NAME } from "@/lib/growth";
import type { GrowthBriefing, LearningLine, NextAction, WorkRow } from "@/lib/intel/overview";

export type GoalRow = {
  id: string;
  primary: boolean;
  label: string;
  current: string | null;
  target: string;
  start: string | null;
  share: number | null;
  remaining: string | null;
  due: string | null;
  daysLeft: number | null;
  reached: boolean;
  note: string | null;
};

export type IntelData = {
  briefing: GrowthBriefing;
  works: WorkRow[];
  themes: { name: string; posts: number; example: string }[];
  postsRead: number;
  actions: NextAction[];
  goals: GoalRow[];
  goalsReady: boolean;
  learning: LearningLine[];
  storeReady: boolean;
};

/** A. The briefing: a few sourced sentences, then what's missing. */
export function GrowthBriefingBand({ b }: { b: GrowthBriefing }) {
  if (!b.lines.length && !b.missing.length) return null;
  return (
    <section className="dash-brief" aria-labelledby="dash-brief-title">
      <h2 id="dash-brief-title">Briefing</h2>
      <ul className="dash-brief-lines">
        {b.lines.map((l, i) => (
          <li key={i}>
            <span>{l.text}</span>
            <small>{l.source}</small>
          </li>
        ))}
      </ul>
      {b.missing.length > 0 && <p className="dash-brief-missing">{b.missing.join(" ")}</p>}
    </section>
  );
}

/** D. Your next three actions. */
export function NextActionsCard({ actions }: { actions: NextAction[] }) {
  return (
    <Card className="dash-actions">
      <CardHeader title="Your next three actions" />
      {actions.length ? (
        <ol className="dash-action-list">
          {actions.map((a, i) => (
            <li key={i}>
              <div className="dash-action-body">
                <b>{a.title}</b>
                <p>{a.reason}</p>
                {a.evidence && <p className="dash-action-ev"><span>Evidence</span> {a.evidence}</p>}
                {a.learning && <p className="dash-action-ev"><span>What it will show</span> {a.learning}</p>}
              </div>
              <Link href={a.href} className="dash-action-go" aria-label={`Open: ${a.title}`}>
                <ArrowRight aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>
          <b>Nothing to act on yet.</b> Actions appear once SOCIA has findings from your posts or something is missing from your setup.
        </Empty>
      )}
      <CardSource>From SOCIA&apos;s findings on your own posts, then gaps in your setup. Findings first, by how sure SOCIA is.</CardSource>
    </Card>
  );
}

/** C. What is working: formats against the account's own median, plus recurring themes (named, not yet measured). */
export function WhatsWorkingCard({ works, themes, postsRead }: { works: WorkRow[]; themes: IntelData["themes"]; postsRead: number }) {
  const max = Math.max(1, ...works.map((w) => w.multiple));
  return (
    <Card className="dash-works">
      <CardHeader title="What's working" />
      {works.length ? (
        <ul className="dash-works-list">
          {works.slice(0, 5).map((w) => (
            <li key={`${w.platform}-${w.format}`}>
              <span className="dash-works-name">
                <b>{w.format}s</b>
                <small>{GOAL_PLATFORM_NAME[w.platform]}, {w.posts} posts</small>
              </span>
              <span className="dash-bar" aria-hidden>
                <i style={{ width: `${Math.round((w.multiple / max) * 100)}%` }} className={w.multiple >= 1 ? "dash-works-up" : undefined} />
              </span>
              <b className="dash-works-num">{w.multiple}x</b>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          <b>Not enough to compare yet.</b> A format needs 3 posts, and the account 6 with numbers, before SOCIA compares them.
        </Empty>
      )}
      {themes.length > 0 && (
        <p className="dash-works-themes">
          <span>Recurring themes</span> {themes.map((t) => `${t.name} (${t.posts})`).join(", ")}. Named from your captions, not yet measured.
        </p>
      )}
      <CardSource>Median {works[0]?.metric ?? "result"} per post for each format, against the account&apos;s own median, from the {postsRead} most recent posts SOCIA read.</CardSource>
    </Card>
  );
}

/** G. Goal progress. */
export function GoalProgressCard({ goals, ready }: { goals: GoalRow[]; ready: boolean }) {
  return (
    <Card>
      <CardHeader title="Goal progress" actions={<Link href="/settings#growth" className="s-link">Goals</Link>} />
      {goals.length ? (
        <ul className="dash-goal-rows">
          {goals.map((g) => (
            <li key={g.id}>
              <div className="dash-goal-top">
                <b>{g.label}</b>
                {g.primary && <small>Main goal</small>}
              </div>
              <div className="dash-goal-figs">
                <span><b>{g.current ?? "\u2014"}</b> now</span>
                <span>target {g.target}{g.due ? ` by ${g.due}` : ""}</span>
              </div>
              {g.share != null && (
                <span className="dash-goal-track" role="img" aria-label={`${Math.round(Math.min(1, Math.max(0, g.share)) * 100)}% of the way from the starting point`}>
                  <i style={{ width: `${Math.round(Math.min(1, Math.max(0, g.share)) * 100)}%` }} />
                </span>
              )}
              <small className="dash-goal-note">
                {g.reached ? "Target reached." : g.note ?? [g.start ? `Started at ${g.start}` : null, g.remaining ? `${g.remaining} to go` : null, g.daysLeft != null && g.daysLeft >= 0 ? `${g.daysLeft} days left` : null].filter(Boolean).join(", ")}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <Empty action={ready ? <ButtonLink href="/settings#growth" size="sm">Set a goal</ButtonLink> : undefined}>
          <b>No measurable goal yet.</b> {ready ? "Set one with a target and SOCIA tracks it from where you start." : "Goals can be saved once SOCIA's database update for goals has run."}
        </Empty>
      )}
    </Card>
  );
}

/** H. Recent learning. */
export function RecentLearningCard({ lines, storeReady }: { lines: LearningLine[]; storeReady: boolean }) {
  return (
    <Card>
      <CardHeader title="Recent learning" period="Last 7 days" />
      {lines.length ? (
        <ul className="dash-learn">
          {lines.map((l, i) => (
            <li key={i} className={`dash-learn-${l.kind}`}>
              <span>{l.text}</span>
              {l.when && <small>{new Date(l.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          <b>Nothing new this week.</b> {storeReady ? "SOCIA lists what it learned here as posts go out and findings change." : "Findings appear once SOCIA's database update for insights has run."}
        </Empty>
      )}
    </Card>
  );
}
