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
import { Bar, useMotionOk } from "./motion";

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
export function WorksBars({ works }: { works: WorkRow[] }) {
  const max = Math.max(1, ...works.map((w) => w.multiple));
  if (!works.length) {
    return (
      <Empty>
        <b>Not enough to compare yet.</b> A format needs 3 posts, the account 6.
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

/** What the works bars rest on, for the card's Details. */
export function WorksNotes({ works, themes, postsRead }: { works: WorkRow[]; themes: IntelData["themes"]; postsRead: number }) {
  return (
    <>
      {themes.length > 0 && (
        <p className="dash-note">
          <span>Recurring themes</span> {themes.map((t) => `${t.name} (${t.posts})`).join(", ")}. Named from your captions, not yet measured.
        </p>
      )}
      <p className="dash-note">Median {works[0]?.metric ?? "result"} per post for each format, against the account&apos;s own median, from the {postsRead} most recent posts SOCIA read.</p>
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
