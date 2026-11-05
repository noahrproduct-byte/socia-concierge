// Working as a team, the parts the browser and the server share (pure):
//   - plan tasks: one plan post handed to one person, with a day to film by
//   - ready for review: a Member's draft the owner and Admins should look at
//   - the Team activity list, built from what the rows already record
// The server side (storage, permissions, bells) is lib/teamWorkServer.ts.

import { weekdayIndex } from "./scheduling";

export type TaskStatus = "open" | "done";

export type PlanTask = {
  id: string;
  workspaceId: string;
  planId: string;
  itemId: string;
  day: string | null;
  title: string;
  assigneeId: string;
  assignedBy: string | null;
  /** YYYY-MM-DD, the day to have it filmed by */
  dueOn: string | null;
  note: string | null;
  status: TaskStatus;
  postId: string | null;
  doneAt: string | null;
  doneBy: string | null;
  doneNote: string | null;
  createdAt: string;
};

/** Someone in the workspace, as the screens name them. */
export type Person = { userId: string; role: "owner" | "admin" | "member"; label: string; isYou: boolean };

export const TASK_NOTE_MAX = 500;
export const READY_NOTE_MAX = 500;

/** "umar" from "umar@example.com": short enough for a Calendar cell. The full address goes in a title. */
export function shortName(label: string): string {
  const at = label.indexOf("@");
  return at > 0 ? label.slice(0, at) : label;
}

/** How a person is named on screen: "You", their email, or their role when SOCIA has no email for them. */
export function personLabel(p: { email: string | null; role: Person["role"] }, isYou: boolean): string {
  if (isYou) return "You";
  if (p.email) return p.email;
  return p.role === "owner" ? "The owner" : p.role === "admin" ? "An admin" : "A member";
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The next date (today included) that falls on a plan day ("Thursday"), as
 * YYYY-MM-DD in the viewer's own calendar. null when the day isn't a weekday name.
 */
export function nextDateFor(day: string | null | undefined, now: Date = new Date()): string | null {
  const wd = weekdayIndex(day ?? "");
  if (wd == null) return null;
  // weekdayIndex counts like Date#getDay: Sunday = 0.
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
  return ymd(d);
}

export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** "Film by Thu, Nov 6", "Film by today", "Was due Mon, Nov 3". */
export function dueLabel(dueOn: string | null, now: Date = new Date()): { text: string; late: boolean } | null {
  if (!dueOn || !isYmd(dueOn)) return null;
  const [y, m, d] = dueOn.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const name = due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (days < 0) return { text: `Was due ${name}`, late: true };
  if (days === 0) return { text: "Film by today", late: false };
  if (days === 1) return { text: "Film by tomorrow", late: false };
  return { text: `Film by ${name}`, late: false };
}

/** Open tasks first, the soonest due first, then the newest. */
export function sortTasks<T extends Pick<PlanTask, "status" | "dueOn" | "createdAt">>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) =>
    (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1)
    || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999")
    || b.createdAt.localeCompare(a.createdAt));
}

/**
 * The open task a saved post finishes: the viewer's own task for the same
 * plan and day. A post made from a plan post carries plan_id and plan_day
 * (Create this post on the plan), which is the only link SOCIA has.
 */
export function taskForPost<T extends Pick<PlanTask, "planId" | "day" | "assigneeId" | "status">>(
  tasks: T[], post: { planId: string | null; planDay: string | null }, viewerId: string,
): T | null {
  if (!post.planId || !post.planDay) return null;
  const day = post.planDay.trim().toLowerCase();
  return tasks.find((t) => t.status === "open" && t.assigneeId === viewerId && t.planId === post.planId && (t.day ?? "").trim().toLowerCase() === day) ?? null;
}

// ------------------------------------------------------------ the activity

export type ActivityKind = "added" | "ready" | "submitted" | "approved" | "sent_back" | "assigned" | "finished";

export type ActivityEvent = {
  kind: ActivityKind;
  at: string;
  actorId: string;
  /** the post or task, as the screens name it */
  title: string;
  /** who the task went to (assigned) */
  otherId?: string | null;
  href?: string | null;
};

export type ActivityLine = { at: string; text: string; href: string | null };

const VERB: Record<ActivityKind, string> = {
  added: "added",
  ready: "marked ready for review",
  submitted: "submitted for approval",
  approved: "approved",
  sent_back: "sent back",
  assigned: "gave",
  finished: "finished",
};

/** The events as sentences, newest first. People SOCIA can't name are left as their role. */
export function activityLines(events: ActivityEvent[], people: Map<string, Person>, limit = 30): ActivityLine[] {
  const name = (id: string | null | undefined) => (id && people.get(id)?.label) || "Someone who left";
  return [...events]
    .filter((e) => e.actorId && !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((e) => {
      const who = name(e.actorId);
      const title = `“${e.title}”`;
      const text = e.kind === "assigned"
        ? `${who} gave ${e.otherId === e.actorId ? (who === "You" ? "yourself" : "themselves") : name(e.otherId)} ${title}`
        : `${who} ${VERB[e.kind]} ${title}`;
      return { at: e.at, text, href: e.href ?? null };
    });
}

/**
 * The viewer's part in "ready for review": a Member marks drafts ready, the
 * owner and Admins see the marks. On a plan with approvals (Pro) Members
 * submit for approval instead, so they don't mark.
 */
export function readyRoleFor(role: Person["role"], approvalsOn: boolean): "mark" | "review" {
  return role === "member" && !approvalsOn ? "mark" : "review";
}

/** A task on the assignee's Dashboard, with what the plan says about filming it. */
export type MyTask = PlanTask & {
  hook: string | null;
  direction: string | null;
  /** the Studio production guide for the plan post, when the post is still in the plan */
  studioHref: string | null;
  /** Create post with the plan post's hook and concept, linked to the plan and day */
  createHref: string;
};
