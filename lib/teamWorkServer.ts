// Working as a team, the server side (supabase/team-work.sql).
//   - who made each post (scheduled_posts.created_by, stamped after a save)
//   - ready for review: a Member marks a draft ready; the owner and Admins
//     get a bell; scheduling or publishing it clears the mark
//   - plan tasks: the owner or an Admin hands a plan post to one person with
//     a day to film by; that person gets a bell and a list on the Dashboard;
//     saving the post they made from it (or marking it done) tells whoever
//     handed it out
//   - the Team activity list, read back from those rows and post_approvals
// Included on every plan with a team (the owner's `team` feature). Every
// write is the service role, after the caller's role, plan and workspace were
// checked here; nothing is written from the browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import { can, type Ctx } from "./context";
import { listMembers } from "./team";
import { recordAlerts } from "./alerts";
import { createServiceClient } from "./supabase/service";
import { getEntitlements, canUseFeature } from "./entitlements";
import { approveOnSchedule, postTitle } from "./approvals";
import { isItemId } from "./planItems";
import type { AlertCandidate } from "./alertDetectors";
import {
  READY_NOTE_MAX, TASK_NOTE_MAX, isYmd, personLabel, sortTasks, taskForPost,
  type ActivityEvent, type MyTask, type Person, type PlanTask,
} from "./teamWork";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const svcClient = () => createServiceClient() as Supa | null;
const clip = (v: unknown, n: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/—/g, ",").slice(0, n);
  return t || null;
};

let enabledSince: number | null = null;

/** Whether supabase/team-work.sql has run. Sticky once seen. */
export async function teamWorkEnabled(client: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await client.from("plan_tasks").select("id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * The service client when team work is on for this workspace: the migration
 * has run, the viewer is in a Brand Workspace, and the owner's plan includes a
 * team. null otherwise, and every caller then shows nothing.
 */
export async function teamWorkFor(ctx: Ctx): Promise<Supa | null> {
  const svc = svcClient();
  if (!svc || !ctx.workspace || !(await teamWorkEnabled(svc))) return null;
  const ent = await getEntitlements(svc, ctx.ownerId).catch(() => null);
  return ent && canUseFeature(ent, "team") ? svc : null;
}

/** The owner and everyone invited into the active workspace, named for the viewer. */
export async function workspacePeople(svc: Supa, ctx: Ctx, viewerEmail?: string | null): Promise<Person[]> {
  if (!ctx.workspace) return [];
  const members = await listMembers(svc, ctx.workspace.id).catch(() => []);
  let ownerEmail: string | null = ctx.isOwner ? (viewerEmail ?? null) : null;
  if (!ctx.isOwner) {
    try {
      const { data } = await svc.auth.admin.getUserById(ctx.ownerId);
      ownerEmail = data.user?.email ?? null;
    } catch {
      ownerEmail = null;
    }
  }
  return [
    { userId: ctx.ownerId, role: "owner" as const, label: personLabel({ email: ownerEmail, role: "owner" }, ctx.viewerId === ctx.ownerId), isYou: ctx.viewerId === ctx.ownerId },
    ...members.map((m) => ({ userId: m.userId, role: m.role, label: personLabel({ email: m.email, role: m.role }, m.userId === ctx.viewerId), isYou: m.userId === ctx.viewerId })),
  ];
}

/** The owner and Admins, the people who review, minus whoever acted. */
const reviewers = (people: Person[], actorId: string) => people.filter((p) => p.role !== "member" && p.userId !== actorId).map((p) => p.userId);

async function bell(svc: Supa, ctx: Ctx, alerts: AlertCandidate[]): Promise<void> {
  if (!alerts.length) return;
  try {
    await recordAlerts(svc, { userId: ctx.ownerId, workspaceId: ctx.workspace?.id ?? null }, alerts);
  } catch (e) {
    console.error("[team-work] bell", (e as Error)?.message ?? e);
  }
}

const nameOf = (people: Person[], id: string) => {
  const p = people.find((x) => x.userId === id);
  return !p ? "Someone" : p.isYou ? "You" : p.label;
};
// A bell names the person who acted to someone else, so never "You".
const actorName = (people: Person[], id: string) => {
  const p = people.find((x) => x.userId === id);
  if (!p) return "Someone";
  if (!p.isYou) return p.label;
  return personLabel({ email: null, role: p.role }, false);
};

// ------------------------------------------------------------ authorship

/** Record who made a new post. Best effort: only a post without an author is stamped, and before the migration the column is missing and the error is ignored. */
export async function stampPostAuthor(client: Supa, ownerId: string, postId: string, authorId: string): Promise<void> {
  try {
    await client.from("scheduled_posts").update({ created_by: authorId }).eq("id", postId).eq("user_id", ownerId).is("created_by", null);
  } catch {
    // the post is saved either way
  }
}

// ------------------------------------------------------------ the tasks

const TASK_COLS = "id, workspace_id, plan_id, plan_item_id, day, title, assignee_id, assigned_by, due_on, note, status, post_id, done_at, done_by, done_note, created_at, updated_at";
type TaskRow = {
  id: string; workspace_id: string; plan_id: string; plan_item_id: string; day: string | null; title: string; assignee_id: string;
  assigned_by: string | null; due_on: string | null; note: string | null; status: "open" | "done"; post_id: string | null;
  done_at: string | null; done_by: string | null; done_note: string | null; created_at: string; updated_at: string;
};
const toTask = (r: TaskRow): PlanTask => ({
  id: r.id, workspaceId: r.workspace_id, planId: r.plan_id, itemId: r.plan_item_id, day: r.day, title: r.title, assigneeId: r.assignee_id,
  assignedBy: r.assigned_by, dueOn: r.due_on, note: r.note, status: r.status, postId: r.post_id, doneAt: r.done_at, doneBy: r.done_by,
  doneNote: r.done_note, createdAt: r.created_at,
});

/** Tasks in the active workspace: one plan's, or one person's. */
export async function listTasks(svc: Supa, ctx: Ctx, opts: { planId?: string; assigneeId?: string; status?: "open" | "done"; sinceDays?: number; limit?: number } = {}): Promise<PlanTask[]> {
  if (!ctx.workspace) return [];
  let q = svc.from("plan_tasks").select(TASK_COLS).eq("user_id", ctx.ownerId).eq("workspace_id", ctx.workspace.id);
  if (opts.planId) q = q.eq("plan_id", opts.planId);
  if (opts.assigneeId) q = q.eq("assignee_id", opts.assigneeId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.sinceDays) q = q.gte("updated_at", new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString());
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) return [];
  return sortTasks(((data ?? []) as TaskRow[]).map(toTask));
}

async function getTask(svc: Supa, ctx: Ctx, id: string): Promise<PlanTask | null> {
  if (!ctx.workspace) return null;
  const { data, error } = await svc.from("plan_tasks").select(TASK_COLS).eq("user_id", ctx.ownerId).eq("workspace_id", ctx.workspace.id).eq("id", id).maybeSingle();
  return error || !data ? null : toTask(data as TaskRow);
}

type PlanPost = { id?: string; day?: string; title?: string; concept?: string; hook?: string; direction?: string };

/** The plan post as stored: it must be this workspace's plan and still hold the post. */
async function planPost(svc: Supa, ctx: Ctx, planId: string, itemId: string): Promise<PlanPost | null> {
  const { data } = await svc.from("plans").select("id, data, workspace_id").eq("user_id", ctx.ownerId).eq("id", planId).maybeSingle();
  const row = data as { data?: { weeklyPlan?: PlanPost[] }; workspace_id?: string | null } | null;
  if (!row) return null;
  // A plan made before workspaces has no workspace; only the default brand may use it.
  if (row.workspace_id ? row.workspace_id !== ctx.workspace?.id : !ctx.workspace?.isDefault) return null;
  return (row.data?.weeklyPlan ?? []).find((p) => p.id === itemId) ?? null;
}

const titleForPost = (p: PlanPost) => clip(p.title, 80) ?? clip(p.hook, 80) ?? clip(p.concept, 80) ?? "A video from the plan";

export type AssignResult = { ok: true; task: PlanTask } | { ok: false; status: number; error: string };

/** Hand a plan post to someone (or to yourself). Replaces whoever had it. */
export async function assignTask(svc: Supa, ctx: Ctx, input: { planId: unknown; itemId: unknown; assigneeId: unknown; dueOn?: unknown; note?: unknown }): Promise<AssignResult> {
  if (!can(ctx, "assign_work")) return { ok: false, status: 403, error: "Only the workspace owner or an admin can hand out the plan's videos." };
  if (!ctx.workspace) return { ok: false, status: 400, error: "Create a Brand Workspace first." };
  if (typeof input.planId !== "string" || !isItemId(input.itemId) || typeof input.assigneeId !== "string") return { ok: false, status: 400, error: "Invalid request." };
  const people = await workspacePeople(svc, ctx);
  if (!people.some((p) => p.userId === input.assigneeId)) return { ok: false, status: 400, error: "That person isn't in this workspace." };
  if (input.dueOn != null && input.dueOn !== "" && !isYmd(input.dueOn)) return { ok: false, status: 400, error: "Pick a day to film it by." };
  const post = await planPost(svc, ctx, input.planId, input.itemId);
  if (!post) return { ok: false, status: 404, error: "That post isn't in this plan any more. Reload the plan." };

  const now = new Date().toISOString();
  const row = {
    user_id: ctx.ownerId, workspace_id: ctx.workspace.id, plan_id: input.planId, plan_item_id: input.itemId,
    day: clip(post.day, 20), title: titleForPost(post), assignee_id: input.assigneeId, assigned_by: ctx.viewerId,
    due_on: isYmd(input.dueOn) ? input.dueOn : null, note: clip(input.note, TASK_NOTE_MAX),
    status: "open", post_id: null, done_at: null, done_by: null, done_note: null, created_at: now, updated_at: now,
  };
  const { data, error } = await svc.from("plan_tasks").upsert(row, { onConflict: "plan_id,plan_item_id" }).select(TASK_COLS).single();
  if (error || !data) return { ok: false, status: 500, error: "SOCIA couldn't save that. Try again." };
  const task = toTask(data as TaskRow);

  if (task.assigneeId !== ctx.viewerId) {
    await bell(svc, ctx, [{
      type: "team", platform: "", severity: "info", recipientId: task.assigneeId,
      fingerprint: `task:${task.id}:assigned:${task.assigneeId}:${now}`,
      title: `For you to film: “${task.title}”`,
      body: `${actorName(people, ctx.viewerId)} gave you ${task.day ? `${task.day}'s video` : "a video"} from the plan.${task.note ? ` Their note: “${task.note.slice(0, 160)}”` : ""} It's on your Dashboard with where to film each shot.`,
      evidence: {}, entityRef: "/dashboard#your-tasks",
    }]);
  }
  return { ok: true, task };
}

/** Take a plan post back from whoever had it. */
export async function unassignTask(svc: Supa, ctx: Ctx, id: string): Promise<boolean> {
  if (!can(ctx, "assign_work") || !ctx.workspace) return false;
  const { data, error } = await svc.from("plan_tasks").delete().eq("user_id", ctx.ownerId).eq("workspace_id", ctx.workspace.id).eq("id", id).select("id");
  return !error && Boolean(data?.length);
}

/** Tell whoever handed it out, and the owner, that a task is done. */
async function notifyDone(svc: Supa, ctx: Ctx, task: PlanTask): Promise<void> {
  const people = await workspacePeople(svc, ctx);
  const to = Array.from(new Set([task.assignedBy, ctx.ownerId].filter((id): id is string => Boolean(id)))).filter((id) => id !== ctx.viewerId);
  const made = task.postId ? " and added the footage to a post. Open it to review it." : ".";
  await bell(svc, ctx, to.map((rid) => ({
    type: "team", platform: "", severity: "good", recipientId: rid,
    fingerprint: `task:${task.id}:done:${rid}:${task.doneAt}`,
    title: `Filmed: “${task.title}”`,
    body: `${actorName(people, ctx.viewerId)} finished ${task.day ? `${task.day}'s video` : "the video"}${made}${task.doneNote ? ` Their note: “${task.doneNote.slice(0, 160)}”` : ""}`,
    evidence: {}, entityRef: task.postId ? `/create?post=${encodeURIComponent(task.postId)}` : "/plan",
  })));
}

export type TaskUpdate = { ok: true; task: PlanTask } | { ok: false; status: number; error: string };

/** Mark a task done or open again. The assignee, the owner and Admins may. */
export async function setTaskStatus(svc: Supa, ctx: Ctx, id: string, status: "open" | "done", note?: unknown): Promise<TaskUpdate> {
  const cur = await getTask(svc, ctx, id);
  if (!cur) return { ok: false, status: 404, error: "That task isn't here any more." };
  if (cur.assigneeId !== ctx.viewerId && !can(ctx, "assign_work")) return { ok: false, status: 403, error: "Only the person it's for, the owner or an admin can change it." };
  const now = new Date().toISOString();
  const patch = status === "done"
    ? { status, done_at: now, done_by: ctx.viewerId, done_note: clip(note, TASK_NOTE_MAX), updated_at: now }
    : { status, done_at: null, done_by: null, done_note: null, post_id: null, updated_at: now };
  const { data, error } = await svc.from("plan_tasks").update(patch).eq("user_id", ctx.ownerId).eq("id", id).select(TASK_COLS).single();
  if (error || !data) return { ok: false, status: 500, error: "SOCIA couldn't save that. Try again." };
  const task = toTask(data as TaskRow);
  if (status === "done" && cur.status !== "done") await notifyDone(svc, ctx, task);
  return { ok: true, task };
}

/**
 * The viewer just saved a post. When it was made from a plan post they were
 * given (Create this post carries the plan and the day) and it now holds the
 * footage, that task is done and points at the post. A draft with only the
 * caption doesn't count: the composer saves as people type. Best effort: the
 * save has succeeded either way.
 */
export async function finishTaskForPost(ctx: Ctx, post: { id: string; planId: string | null; planDay: string | null; hasMedia: boolean }): Promise<void> {
  if (!post.planId || !post.planDay || !post.hasMedia) return;
  try {
    const svc = await teamWorkFor(ctx);
    if (!svc) return;
    const open = await listTasks(svc, ctx, { planId: post.planId, assigneeId: ctx.viewerId, status: "open" });
    const t = taskForPost(open, post, ctx.viewerId);
    if (!t) return;
    const now = new Date().toISOString();
    const { data } = await svc.from("plan_tasks").update({ status: "done", done_at: now, done_by: ctx.viewerId, post_id: post.id, updated_at: now })
      .eq("user_id", ctx.ownerId).eq("id", t.id).eq("status", "open").select(TASK_COLS);
    const done = (data as TaskRow[] | null)?.[0];
    if (done) await notifyDone(svc, ctx, toTask(done));
  } catch (e) {
    console.error("[team-work] finish task", (e as Error)?.message ?? e);
  }
}

/** Everything a new post needs after it is saved: its author, and the task it may finish. */
export async function afterPostSaved(ctx: Ctx, post: { id: string; isNew: boolean; planId: string | null; planDay: string | null; hasMedia: boolean }): Promise<void> {
  if (post.isNew) await stampPostAuthor(ctx.client, ctx.ownerId, post.id, ctx.viewerId);
  await finishTaskForPost(ctx, post);
}

// ------------------------------------------------------------ ready for review

export type ReadyState = { at: string; byId: string | null; byLabel: string | null; mine: boolean; note: string | null };

async function readyRow(svc: Supa, ctx: Ctx, postId: string): Promise<{ status: string; ready_at: string | null; ready_by: string | null; ready_note: string | null } | null> {
  let q = svc.from("scheduled_posts").select("status, ready_at, ready_by, ready_note").eq("user_id", ctx.ownerId).eq("id", postId);
  if (ctx.workspace) q = q.eq("workspace_id", ctx.workspace.id);
  const { data, error } = await q.maybeSingle();
  return error || !data ? null : (data as { status: string; ready_at: string | null; ready_by: string | null; ready_note: string | null });
}

export async function readyState(svc: Supa, ctx: Ctx, postId: string, people?: Person[]): Promise<ReadyState | null> {
  const row = await readyRow(svc, ctx, postId);
  if (!row?.ready_at) return null;
  const ps = people ?? (await workspacePeople(svc, ctx));
  return { at: row.ready_at, byId: row.ready_by, byLabel: row.ready_by ? nameOf(ps, row.ready_by) : null, mine: row.ready_by === ctx.viewerId, note: row.ready_note };
}

export type ReadyResult = { ok: true; ready: ReadyState | null } | { ok: false; status: number; error: string };

/** A Member marks a saved draft ready; the owner and every Admin get a bell. */
export async function markReady(svc: Supa, ctx: Ctx, postId: string, note: unknown): Promise<ReadyResult> {
  const row = await readyRow(svc, ctx, postId);
  if (!row) return { ok: false, status: 404, error: "Post not found." };
  if (row.status !== "draft") return { ok: false, status: 409, error: "Only drafts can be marked ready for review." };
  const now = new Date().toISOString();
  const { error } = await svc.from("scheduled_posts").update({ ready_at: now, ready_by: ctx.viewerId, ready_note: clip(note, READY_NOTE_MAX) })
    .eq("user_id", ctx.ownerId).eq("id", postId);
  if (error) return { ok: false, status: 500, error: "SOCIA couldn't save that. Try again." };
  const people = await workspacePeople(svc, ctx);
  const title = await postTitle(svc, ctx.ownerId, postId).catch(() => "A draft");
  const n = clip(note, 160);
  await bell(svc, ctx, reviewers(people, ctx.viewerId).map((rid) => ({
    type: "team", platform: "", severity: "info", recipientId: rid,
    fingerprint: `ready:${postId}:${rid}:${now}`,
    title: `Ready for review: “${title}”`,
    body: `${actorName(people, ctx.viewerId)} marked it ready${n ? `: “${n}”` : "."} Open it to check it, then schedule it.`,
    evidence: {}, entityRef: `/create?post=${encodeURIComponent(postId)}`,
  })));
  return { ok: true, ready: await readyState(svc, ctx, postId, people) };
}

/** Take the mark off: the person who marked it, or a reviewer. */
export async function unmarkReady(svc: Supa, ctx: Ctx, postId: string): Promise<ReadyResult> {
  const row = await readyRow(svc, ctx, postId);
  if (!row) return { ok: false, status: 404, error: "Post not found." };
  if (row.ready_by !== ctx.viewerId && !can(ctx, "publish")) return { ok: false, status: 403, error: "Only the person who marked it, the owner or an admin can change this." };
  const { error } = await svc.from("scheduled_posts").update({ ready_at: null, ready_by: null, ready_note: null }).eq("user_id", ctx.ownerId).eq("id", postId);
  if (error) return { ok: false, status: 500, error: "SOCIA couldn't save that. Try again." };
  return { ok: true, ready: null };
}

/**
 * The owner or an Admin just scheduled or published a post: that closes any
 * approval round waiting on it (lib/approvals) and any ready mark, and the
 * person who marked it is told. Best effort; scheduling has succeeded.
 */
export async function onScheduledByReviewer(ctx: Ctx, postId: string, scheduledFor: string | null): Promise<void> {
  await approveOnSchedule(ctx, postId, scheduledFor);
  if (!can(ctx, "publish")) return;
  try {
    const svc = await teamWorkFor(ctx);
    if (!svc) return;
    const { data } = await svc.from("scheduled_posts").update({ ready_at: null, ready_by: null, ready_note: null })
      .eq("user_id", ctx.ownerId).eq("id", postId).not("ready_at", "is", null).select("ready_by");
    const by = (data as { ready_by: string | null }[] | null)?.[0]?.ready_by;
    if (!by || by === ctx.viewerId) return;
    const [people, title] = await Promise.all([workspacePeople(svc, ctx), postTitle(svc, ctx.ownerId, postId).catch(() => "Your draft")]);
    await bell(svc, ctx, [{
      type: "team", platform: "", severity: "good", recipientId: by,
      fingerprint: `ready:${postId}:scheduled:${by}:${new Date().toISOString()}`,
      title: `Scheduled: “${title}”`,
      body: `${actorName(people, ctx.viewerId)} ${scheduledFor ? "scheduled" : "published"} the draft you marked ready.`,
      evidence: {}, entityRef: `/create?post=${encodeURIComponent(postId)}`,
    }]);
  } catch (e) {
    console.error("[team-work] scheduled", (e as Error)?.message ?? e);
  }
}

// ------------------------------------------------------------ activity

/**
 * What people did in the workspace over the last `days`, read back from the
 * rows: posts with an author, ready marks, approval rounds and tasks. Nothing
 * is logged separately, so a step SOCIA has no row for doesn't appear.
 */
export async function teamActivity(svc: Supa, ctx: Ctx, days = 30): Promise<ActivityEvent[]> {
  if (!ctx.workspace) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const ws = ctx.workspace.id;
  const [posts, ready, rounds, tasks] = await Promise.all([
    svc.from("scheduled_posts").select("id, caption, created_by, created_at").eq("user_id", ctx.ownerId).eq("workspace_id", ws).not("created_by", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(60),
    svc.from("scheduled_posts").select("id, caption, ready_by, ready_at").eq("user_id", ctx.ownerId).eq("workspace_id", ws).not("ready_at", "is", null).gte("ready_at", since).limit(30),
    svc.from("post_approvals").select("post_id, submitted_by, submitted_at, status, decided_by, decided_at").eq("user_id", ctx.ownerId).eq("workspace_id", ws).gte("submitted_at", since).limit(60),
    svc.from("plan_tasks").select("id, title, assignee_id, assigned_by, created_at, status, done_by, done_at, post_id").eq("user_id", ctx.ownerId).eq("workspace_id", ws).gte("updated_at", since).limit(60),
  ]);
  const label = (caption: string | null) => {
    const first = (caption ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    return first ? (first.length > 60 ? `${first.slice(0, 59)}…` : first) : "Untitled post";
  };
  const href = (id: string) => `/create?post=${encodeURIComponent(id)}`;
  const out: ActivityEvent[] = [];
  const captions = new Map<string, string>();
  for (const p of (posts.data ?? []) as { id: string; caption: string | null; created_by: string; created_at: string }[]) {
    captions.set(p.id, label(p.caption));
    out.push({ kind: "added", at: p.created_at, actorId: p.created_by, title: label(p.caption), href: href(p.id) });
  }
  for (const p of (ready.data ?? []) as { id: string; caption: string | null; ready_by: string | null; ready_at: string }[]) {
    captions.set(p.id, label(p.caption));
    if (p.ready_by) out.push({ kind: "ready", at: p.ready_at, actorId: p.ready_by, title: label(p.caption), href: href(p.id) });
  }
  const roundRows = (rounds.data ?? []) as { post_id: string; submitted_by: string; submitted_at: string; status: string; decided_by: string | null; decided_at: string | null }[];
  // Approval rounds carry the post id only; their titles come from the posts.
  const missing = roundRows.map((r) => r.post_id).filter((id) => !captions.has(id));
  if (missing.length) {
    const { data } = await svc.from("scheduled_posts").select("id, caption").eq("user_id", ctx.ownerId).in("id", Array.from(new Set(missing)).slice(0, 60));
    for (const p of (data ?? []) as { id: string; caption: string | null }[]) captions.set(p.id, label(p.caption));
  }
  for (const r of roundRows) {
    const title = captions.get(r.post_id) ?? "A post";
    out.push({ kind: "submitted", at: r.submitted_at, actorId: r.submitted_by, title, href: href(r.post_id) });
    if (r.decided_by && r.decided_at && (r.status === "approved" || r.status === "changes_requested")) {
      out.push({ kind: r.status === "approved" ? "approved" : "sent_back", at: r.decided_at, actorId: r.decided_by, title, href: href(r.post_id) });
    }
  }
  for (const t of (tasks.data ?? []) as { id: string; title: string; assignee_id: string; assigned_by: string | null; created_at: string; status: string; done_by: string | null; done_at: string | null; post_id: string | null }[]) {
    if (t.assigned_by && t.created_at >= since) out.push({ kind: "assigned", at: t.created_at, actorId: t.assigned_by, otherId: t.assignee_id, title: t.title, href: "/plan" });
    if (t.status === "done" && t.done_by && t.done_at) out.push({ kind: "finished", at: t.done_at, actorId: t.done_by, title: t.title, href: t.post_id ? href(t.post_id) : "/plan" });
  }
  return out;
}

/** Open tasks for the viewer, for the Dashboard, with each plan post's filming direction. */
export async function myTasks(ctx: Ctx): Promise<{ tasks: MyTask[]; enabled: boolean }> {
  const svc = await teamWorkFor(ctx).catch(() => null);
  if (!svc) return { tasks: [], enabled: false };
  const tasks = (await listTasks(svc, ctx, { assigneeId: ctx.viewerId, status: "open", limit: 20 })).slice(0, 8);
  const planIds = Array.from(new Set(tasks.map((t) => t.planId)));
  const plans = new Map<string, PlanPost[]>();
  if (planIds.length) {
    const { data } = await svc.from("plans").select("id, data").eq("user_id", ctx.ownerId).in("id", planIds);
    for (const p of (data ?? []) as { id: string; data?: { weeklyPlan?: PlanPost[] } }[]) plans.set(p.id, p.data?.weeklyPlan ?? []);
  }
  return {
    enabled: true,
    tasks: tasks.map((t) => {
      const items = plans.get(t.planId) ?? [];
      const i = items.findIndex((p) => p.id === t.itemId);
      const post = i >= 0 ? items[i] : null;
      const q = new URLSearchParams();
      q.set("caption", [post?.hook?.trim(), post?.concept?.trim()].filter(Boolean).join("\n\n"));
      q.set("planId", t.planId);
      if (t.day) q.set("planDay", t.day);
      q.set("from", "plan");
      return {
        ...t,
        hook: clip(post?.hook, 300),
        direction: clip(post?.direction, 400),
        studioHref: i >= 0 ? `/studio?mode=guide&plan=${encodeURIComponent(t.planId)}&i=${i}` : null,
        createHref: `/create?${q.toString()}`,
      };
    }),
  };
}
