"use client";

// The Overview's intelligence pieces (lib/intel/overview.ts), drawn to be
// read at a glance: three action chips that open to their reasoning, format
// bars, slim goal bars, the briefing's sourced lines and the week's learning.
// Nothing here is a sample; an empty piece says what it is waiting for.

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, Plug, Target } from "lucide-react";
import { Empty, ButtonLink } from "@/components/system";
import { GOAL_PLATFORM_NAME } from "@/lib/growth";
import type { GrowthBriefing, LearningLine, NextAction, WorkRow } from "@/lib/intel/overview";
import type { AngleRow, NicheTry } from "@/lib/intel/angles";
import { Bar, useMotionOk } from "./motion";
import { TREND_LEADS_AT as LEADS_AT } from "@/lib/trendSignals";

const DASH = String.fromCharCode(0x2014);

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
  /** Why works is empty, from the account's own counts (lib/intel/overview.ts worksGap). */
  worksGap?: string;
  /** Hooks and topics against the account's median, with the niche's read of each (lib/intel/angles.ts). */
  angles: AngleRow[];
  anglesGap?: string;
  /** Hooks and topics leading in the niche that none of the account's posts use. */
  nicheToTry: NicheTry[];
  /** How much of the niche the trends rest on; null when nothing is stored yet. */
  nicheRead: { reels: number; accounts: number } | null;
  /** The plan includes niche trends. */
  nicheOn: boolean;
  themes: { name: string; posts: number; example: string }[];
  postsRead: number;
  actions: NextAction[];
  goals: GoalRow[];
  goalsReady: boolean;
  learning: LearningLine[];
  storeReady: boolean;
};

/** The briefing's sourced lines, behind the hero's Details. */
export function BriefingLines({ b }: { b: GrowthBriefing }) {
  if (!b.lines.length && !b.missing.length) return null;
  return (
    <div className="dash-brief">
      <ul className="dash-brief-lines">
        {b.lines.map((l, i) => (
          <li key={i}>
            <span>{l.text}</span>
            <small>{l.source}</small>
          </li>
        ))}
      </ul>
      {b.missing.length > 0 && <p className="dash-brief-missing">{b.missing.join(" ")}</p>}
    </div>
  );
}

/** One action as a chip: icon and verb phrase; opens to the reason, the evidence and what it will show. */
function ActionChip({ a, n }: { a: NextAction; n: number }) {
  const ok = useMotionOk();
  const [open, setOpen] = useState(false);
  const id = useId();
  const Icon = a.from === "setup" ? Plug : Target;
  return (
    <li className={`dash-chip${open ? " is-open" : ""}`}>
      <button type="button" className="dash-chip-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="dash-chip-n" aria-hidden>{n}</span>
        <Icon aria-hidden />
        <span className="dash-chip-title">{a.title}</span>
        <ChevronDown aria-hidden className={`dash-chip-chev${open ? " is-open" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} key="p" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={ok ? { duration: 0.25, ease: [0.23, 1, 0.32, 1] } : { duration: 0 }} style={{ overflow: "hidden" }}>
            <div className="dash-chip-body">
              <p>{a.reason}</p>
              {a.evidence && <p className="dash-chip-ev"><span>Evidence</span> {a.evidence}</p>}
              {a.learning && <p className="dash-chip-ev"><span>What it will show</span> {a.learning}</p>}
              <Link href={a.href} className="s-link dash-chip-go">Open <ArrowRight aria-hidden /></Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** The next three actions as chips. */
export function ActionChips({ actions }: { actions: NextAction[] }) {
  if (!actions.length) {
    return (
      <Empty>
        <b>Nothing to act on yet.</b> Actions appear once SOCIA has findings from your posts.
      </Empty>
    );
  }
  return (
    <ol className="dash-chips">
      {actions.slice(0, 3).map((a, i) => <ActionChip key={`${a.href}-${i}`} a={a} n={i + 1} />)}
    </ol>
  );
}

/** Formats against the account's own median, as bars. */
export function WorksBars({ works, gap }: { works: WorkRow[]; gap?: string }) {
  const max = Math.max(1, ...works.map((w) => w.multiple));
  if (!works.length) {
    return (
      <Empty>
        <b>No format comparison yet.</b> {gap ?? "It starts once a platform has 6 posts in two formats, 3 posts each."}
      </Empty>
    );
  }
  return (
    <ul className="dash-bars" aria-label="Formats against your median">
      {works.slice(0, 4).map((w) => (
        <li key={`${w.platform}-${w.format}`} role="img" aria-label={`${w.format}s on ${GOAL_PLATFORM_NAME[w.platform]}: ${w.multiple} times your median, ${w.posts} posts`}>
          <span className="dash-bars-name"><b>{w.format}s</b><small>{GOAL_PLATFORM_NAME[w.platform]}</small></span>
          <Bar share={w.multiple / max} tone={w.multiple >= 1 ? "data" : "muted"} />
          <b className="dash-bars-num">{w.multiple}x</b>
        </li>
      ))}
    </ul>
  );
}

const nicheLine = (n: NonNullable<AngleRow["niche"]>) =>
  n.leads && n.multiple != null ? `Leads in your niche, ${n.multiple}x` : "Not ahead in your niche";

function AngleBars({ title, rows, label }: { title: string; rows: AngleRow[]; label: string }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => r.multiple));
  return (
    <>
      <span className="dash-mini-label">{title}</span>
      <ul className="dash-bars is-wrap" aria-label={label}>
        {rows.map((r) => (
          <li key={`${r.platform}-${r.kind}-${r.label}`} role="img" aria-label={`${r.label} on ${GOAL_PLATFORM_NAME[r.platform]}: ${r.multiple} times your median, ${r.posts} posts${r.niche ? `. ${nicheLine(r.niche)}` : ""}`}>
            <span className="dash-bars-name">
              <b>{r.label}</b>
              <small>{r.posts} posts</small>
              {r.niche && <small className={r.niche.leads ? "dash-bars-lead" : undefined}>{nicheLine(r.niche)}</small>}
            </span>
            <Bar share={r.multiple / max} tone={r.multiple >= 1 ? "data" : "muted"} />
            <b className="dash-bars-num">{r.multiple}x</b>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * "What's working" beyond formats: the account's hooks and topics against its
 * own median (so a Reels-only account has a comparison too), and what leads in
 * the niche that it hasn't tried. Every number is counted (lib/intel/angles.ts).
 */
export function AngleSections({ intel }: { intel: IntelData }) {
  const hooks = intel.angles.filter((a) => a.kind === "hook").slice(0, 3);
  const topics = intel.angles.filter((a) => a.kind === "topic").slice(0, 3);
  const toTry = intel.nicheToTry;
  return (
    <>
      <AngleBars title="How your posts open" rows={hooks} label="Hooks against your median" />
      <AngleBars title="What they're about" rows={topics} label="Topics against your median" />
      {!intel.angles.length && intel.anglesGap && <p className="dash-note">{intel.anglesGap}</p>}
      {intel.nicheOn && (
        toTry.length > 0 ? (
          <>
            <span className="dash-mini-label">Trending in your niche, not in your posts yet</span>
            <ul className="dash-notes">
              {toTry.map((t) => (
                <li key={`${t.kind}-${t.label}`}>
                  <span>
                    <b>{t.label}</b> {t.kind === "hook" ? "openings" : "posts"}{t.multiple != null ? ` reach ${t.multiple}x their creators' usual` : " lead"}, across {t.posts} Reels from {t.accounts} accounts.
                  </span>{" "}
                  <Link className="s-link" href={`/plan?note=${encodeURIComponent(`Try a ${t.kind === "hook" ? `"${t.label}" opening` : `post about ${t.label.toLowerCase()}`}: it leads in my niche (${t.multiple ?? "?"}x their creators' usual across ${t.posts} Reels from ${t.accounts} accounts) and I haven't used it yet.`)}`}>Add to plan</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dash-note">
            {intel.nicheRead
              ? `Nothing leads in your niche that your posts don't already use, from ${intel.nicheRead.reels} recent Reels by ${intel.nicheRead.accounts} accounts.`
              : "No niche Reels stored yet."}{" "}
            <Link className="s-link" href="/discover">Open Discover</Link>
          </p>
        )
      )}
    </>
  );
}

/** What the works bars rest on, for the card's Details. */
export function WorksNotes({ works, themes, postsRead, nicheRead = null }: { works: WorkRow[]; themes: IntelData["themes"]; postsRead: number; nicheRead?: IntelData["nicheRead"] }) {
  return (
    <>
      {themes.length > 0 && (
        <p className="dash-note">
          <span>Recurring themes</span> {themes.map((t) => `${t.name} (${t.posts})`).join(", ")}. Named from your captions, not yet measured.
        </p>
      )}
      {works.length > 0 && <p className="dash-note">Median {works[0].metric} per post for each format, against the account&apos;s own median, from the {postsRead} most recent posts SOCIA read.</p>}
      <p className="dash-note">Hooks and topics are named from your captions with SOCIA&apos;s tag list. Each needs 3 posts on a platform with 6, and is compared with your median the same way.</p>
      {nicheRead && <p className="dash-note">Niche trends come from {nicheRead.reels} recent Reels by {nicheRead.accounts} accounts that SOCIA last read for Discover. &ldquo;Leads&rdquo; means their median is {LEADS_AT}x their own creators&apos; usual. Other accounts&apos; results, not a forecast for yours.</p>}
    </>
  );
}

/** Each goal as one line and one bar. */
export function GoalBars({ goals, ready }: { goals: GoalRow[]; ready: boolean }) {
  if (!goals.length) {
    return (
      <Empty action={ready ? <ButtonLink href="/settings#growth" size="sm">Set a goal</ButtonLink> : undefined}>
        <b>No measurable goal yet.</b> {ready ? "Set one and SOCIA tracks it." : "Goals need SOCIA's database update first."}
      </Empty>
    );
  }
  return (
    <ul className="dash-goals">
      {goals.map((g) => {
        const pct = g.share != null ? Math.round(Math.min(1, Math.max(0, g.share)) * 100) : null;
        return (
          <li key={g.id} role="img" aria-label={`${g.label}: ${g.current ?? "not measured"} of ${g.target}${pct != null ? `, ${pct}% of the way` : ""}${g.reached ? ", reached" : ""}`}>
            <span className="dash-goal-line">
              <b>{g.label}</b>
              <span>{g.current ?? DASH} <small>of {g.target}</small></span>
            </span>
            {pct != null ? <Bar share={pct / 100} tone={g.reached ? "data" : "you"} /> : <small className="dash-goal-note">{g.note ?? "Not measured yet"}</small>}
            {g.reached && <small className="dash-goal-note">Target reached</small>}
          </li>
        );
      })}
    </ul>
  );
}

/** The goals' dates and distances, for the card's Details. */
export function GoalNotes({ goals }: { goals: GoalRow[] }) {
  return (
    <ul className="dash-notes">
      {goals.map((g) => (
        <li key={g.id}>
          <b>{g.label}</b>{g.primary ? " (main goal)" : ""}.{" "}
          {g.reached ? "Target reached." : g.note ?? [g.start ? `Started at ${g.start}` : null, g.remaining ? `${g.remaining} to go` : null, g.due ? `due ${g.due}` : null, g.daysLeft != null && g.daysLeft >= 0 ? `${g.daysLeft} days left` : null].filter(Boolean).join(", ") + "."}
        </li>
      ))}
    </ul>
  );
}

/** What changed in the last 7 days. */
export function LearningLines({ lines, storeReady }: { lines: LearningLine[]; storeReady: boolean }) {
  if (!lines.length) {
    return (
      <Empty>
        <b>Nothing new this week.</b> {storeReady ? "SOCIA lists what it learned here as posts go out." : "Findings appear once SOCIA's database update has run."}
      </Empty>
    );
  }
  return (
    <ul className="dash-learn">
      {lines.map((l, i) => (
        <li key={i} className={`is-${l.kind}`}>
          <span>{l.text}</span>
          {l.when && <small>{new Date(l.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>}
        </li>
      ))}
    </ul>
  );
}
