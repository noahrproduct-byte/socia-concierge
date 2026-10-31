// Approval workflow (Pro). Members submit a post for approval; the owner or
// an Admin approves it, which schedules it, or sends it back with a note.
// One row per round (supabase/approvals.sql), so a post's review history is
// kept. Every write happens here, on the service role, after the caller's
// role and plan were checked; nothing is written from the browser.
//
// Who does what (Noah's decision, 2026-10-15): Members submit; the owner and
// Admins approve and keep publishing directly. Approving is scheduling: any
// time an owner or Admin schedules or publishes a post that is waiting, its
// round is closed as approved, wherever they did it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { can, type Ctx } from "./context";
import { listMembers } from "./team";
import { recordAlerts } from "./alerts";
import { createServiceClient } from "./supabase/service";
import { displayTitle } from "./overview";
import { isMissingTableError } from "./publishing/db";
import { postLabel } from "./publishing/postLabel";
import type { AlertCandidate } from "./alertDetectors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ApprovalStatus = "pending" | "approved" | "changes_requested" | "withdrawn";

export type Approval = {
  id: string;
  postId: string;
  workspaceId: string | null;
  ownerId: string;
  submittedBy: string;
  submittedAt: string;
  requestedAt: string | null;
  submitNote: string | null;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  reviewNote: string | null;
  scheduledFor: string | null;
};

/** How the viewer takes part: Members submit, the owner and Admins approve; nobody when the owner's plan doesn't include it. */
export type ApprovalRole = "submit" | "approve" | null;

export function approvalRole(ctx: Pick<Ctx, "role">, entitled: boolean): ApprovalRole {
  if (!entitled) return null;
  return ctx.role === "member" ? "submit" : "approve";
}

export const NOTE_MAX = 1000;

const COLS = "id, post_id, workspace_id, user_id, submitted_by, submitted_at, requested_at, submit_note, status, decided_by, decided_at, review_note, scheduled_for";

type Row = {
  id: string; post_id: string; workspace_id: string | null; user_id: string; submitted_by: string; submitted_at: string; requested_at: string | null;
  submit_note: string | null; status: ApprovalStatus; decided_by: string | null; decided_at: string | null; review_note: string | null; scheduled_for: string | null;
};

const toApproval = (r: Row): Approval => ({
  id: r.id, postId: r.post_id, workspaceId: r.workspace_id, ownerId: r.user_id, submittedBy: r.submitted_by, submittedAt: r.submitted_at,
  requestedAt: r.requested_at, submitNote: r.submit_note, status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at,
  reviewNote: r.review_note, scheduledFor: r.scheduled_for,
});

let enabledSince: number | null = null;

/** Whether supabase/approvals.sql has run. Sticky once seen. */
export async function approvalsEnabled(client: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await client.from("post_approvals").select("id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** The latest round for a post (any status), or null. */
export async function latestForPost(client: Supa, ownerId: string, postId: string): Promise<Approval | null> {
  const { data, error } = await client.from("post_approvals").select(COLS).eq("user_id", ownerId).eq("post_id", postId).order("submitted_at", { ascending: false }).limit(1);
  if (error || !data?.[0]) return null;
  return toApproval(data[0] as Row);
}

export async function getApproval(client: Supa, ownerId: string, id: string): Promise<Approval | null> {
  const { data, error } = await client.from("post_approvals").select(COLS).eq("user_id", ownerId).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toApproval(data as Row);
}

/** Rounds in a workspace: the waiting queue (approvers) or one person's own submissions (members). */
export async function listApprovals(client: Supa, ownerId: string, workspaceId: string | null, opts: { status?: ApprovalStatus[]; submittedBy?: string; sinceDays?: number; limit?: number } = {}): Promise<Approval[]> {
  let q = client.from("post_approvals").select(COLS).eq("user_id", ownerId);
  if (workspaceId) q = q.eq("workspace_id", workspaceId);
  if (opts.status?.length) q = q.in("status", opts.status);
  if (opts.submittedBy) q = q.eq("submitted_by", opts.submittedBy);
  if (opts.sinceDays) q = q.gte("submitted_at", new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString());
  const { data, error } = await q.order("submitted_at", { ascending: false }).limit(opts.limit ?? 100);
  if (error) return [];
  return ((data ?? []) as Row[]).map(toApproval);
}

export async function insertApproval(svc: Supa, rec: { postId: string; workspaceId: string | null; ownerId: string; submittedBy: string; requestedAt: string | null; submitNote: string | null }): Promise<{ ok: true; approval: Approval } | { ok: false; pending: boolean }> {
  const { data, error } = await svc.from("post_approvals").insert({
    post_id: rec.postId, workspace_id: rec.workspaceId, user_id: rec.ownerId, submitted_by: rec.submittedBy,
    requested_at: rec.requestedAt, submit_note: rec.submitNote, status: "pending",
  }).select(COLS).single();
  if (error || !data) return { ok: false, pending: /duplicate|unique/i.test(error?.message ?? "") };
  return { ok: true, approval: toApproval(data as Row) };
}

/** Close a waiting round. Conditional on it still waiting, so two approvers can't both decide it. */
export async function closeApproval(svc: Supa, ownerId: string, id: string, patch: { status: Exclude<ApprovalStatus, "pending">; decidedBy: string; reviewNote?: string | null; scheduledFor?: string | null; onlySubmitter?: string }): Promise<Approval | null> {
  let q = svc.from("post_approvals").update({
    status: patch.status, decided_by: patch.decidedBy, decided_at: new Date().toISOString(),
    ...(patch.reviewNote !== undefined ? { review_note: patch.reviewNote } : {}),
    ...(patch.scheduledFor !== undefined ? { scheduled_for: patch.scheduledFor } : {}),
  }).eq("user_id", ownerId).eq("id", id).eq("status", "pending");
  if (patch.onlySubmitter) q = q.eq("submitted_by", patch.onlySubmitter);
  const { data, error } = await q.select(COLS);
  if (error || !data?.length) return null;
  return toApproval(data[0] as Row);
}

// ------------------------------------------------------------- notifications

async function postTitle(svc: Supa, ownerId: string, postId: string): Promise<string> {
  const { data } = await svc.from("scheduled_posts").select("caption").eq("user_id", ownerId).eq("id", postId).maybeSingle();
  const t = displayTitle(((data as { caption?: string } | null)?.caption ?? "").trim());
  let title = t;
  if (t === "(no caption)") {
    const { data: ds } = await svc.from("post_destinations").select("platform, settings").eq("user_id", ownerId).eq("post_id", postId);
    title = postLabel(null, (ds ?? []) as { platform: string; settings?: unknown }[]) ?? "Untitled post";
  }
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}

/** The emails SOCIA knows for the workspace's members, for "submitted by". */
export async function memberEmails(svc: Supa, workspaceId: string | null): Promise<Map<string, string>> {
  if (!workspaceId) return new Map();
  const members = await listMembers(svc, workspaceId).catch(() => []);
  return new Map(members.filter((m) => m.email).map((m) => [m.userId, m.email as string]));
}

/** Tell the owner and every Admin that something is waiting. */
export async function notifyApprovers(svc: Supa, a: Approval): Promise<void> {
  try {
    const [title, members] = await Promise.all([postTitle(svc, a.ownerId, a.postId), a.workspaceId ? listMembers(svc, a.workspaceId).catch(() => []) : Promise.resolve([])]);
    const who = members.find((m) => m.userId === a.submittedBy)?.email ?? "A member";
    const recipients = Array.from(new Set([a.ownerId, ...members.filter((m) => m.role === "admin").map((m) => m.userId)])).filter((id) => id !== a.submittedBy);
    const alerts: AlertCandidate[] = recipients.map((rid) => ({
      type: "approval", platform: "", fingerprint: `approval:${a.id}:request:${rid}`, severity: "info",
      title: `Waiting for approval: “${title}”`,
      body: `${who} submitted it${a.submitNote ? `: “${a.submitNote.slice(0, 140)}”` : "."} Approve it to schedule it, or send it back with a note.`,
      evidence: {}, entityRef: "/plan/calendar?view=approvals", recipientId: rid,
    }));
    await recordAlerts(svc, { userId: a.ownerId, workspaceId: a.workspaceId }, alerts);
  } catch (e) {
    console.error("[approvals] notify approvers", (e as Error)?.message ?? e);
  }
}

/** Tell the member what happened to their post. */
export async function notifySubmitter(svc: Supa, a: Approval): Promise<void> {
  if (a.status !== "approved" && a.status !== "changes_requested") return;
  try {
    const title = await postTitle(svc, a.ownerId, a.postId);
    const approved = a.status === "approved";
    await recordAlerts(svc, { userId: a.ownerId, workspaceId: a.workspaceId }, [{
      type: "approval", platform: "", fingerprint: `approval:${a.id}:${a.status}:${a.submittedBy}`, severity: approved ? "good" : "warning",
      title: approved ? `Approved: “${title}”` : `Sent back: “${title}”`,
      body: approved ? "It's scheduled to go out." : `${a.reviewNote ? `“${a.reviewNote.slice(0, 200)}”` : "The reviewer asked for changes."} Make the changes and submit it again.`,
      evidence: {}, entityRef: `/create?post=${encodeURIComponent(a.postId)}`, recipientId: a.submittedBy,
    }]);
  } catch (e) {
    console.error("[approvals] notify submitter", (e as Error)?.message ?? e);
  }
}

// --------------------------------------------------------------- the hooks

/**
 * An owner or Admin just scheduled or published this post: if it was
 * waiting for approval, that was the approval. Best effort; scheduling has
 * already succeeded either way.
 */
export async function approveOnSchedule(ctx: Ctx, postId: string, scheduledFor: string | null): Promise<void> {
  if (!can(ctx, "publish")) return;
  const svc = createServiceClient() as Supa | null;
  if (!svc || !(await approvalsEnabled(svc))) return;
  try {
    const { data } = await svc.from("post_approvals").select("id").eq("user_id", ctx.ownerId).eq("post_id", postId).eq("status", "pending").limit(1);
    const id = (data?.[0] as { id: string } | undefined)?.id;
    if (!id) return;
    const a = await closeApproval(svc, ctx.ownerId, id, { status: "approved", decidedBy: ctx.viewerId, scheduledFor });
    if (a) await notifySubmitter(svc, a);
  } catch (e) {
    console.error("[approvals] approve on schedule", (e as Error)?.message ?? e);
  }
}

/** Why a Member may not change this post right now, or null. */
export async function memberEditBlock(ctx: Ctx, postId: string | null): Promise<string | null> {
  if (ctx.role !== "member" || !postId) return null;
  const svc = (createServiceClient() as Supa | null) ?? ctx.client;
  if (await approvalsEnabled(svc)) {
    const { data } = await svc.from("post_approvals").select("id").eq("user_id", ctx.ownerId).eq("post_id", postId).eq("status", "pending").limit(1);
    if (data?.length) return "This post is waiting for approval. Withdraw it from approval to make changes.";
  }
  const LOCKED = "Scheduled and published posts can only be changed by the owner or an admin.";
  // The post itself: a legacy calendar post has no destinations, so its own
  // status is what says it is going out. Fails closed when it can't be read.
  const { data: post, error: postErr } = await svc.from("scheduled_posts").select("status").eq("user_id", ctx.ownerId).eq("id", postId).maybeSingle();
  if (postErr) return "SOCIA couldn't check this post just now. Try again.";
  if (post && ["scheduled", "publishing", "published"].includes((post as { status: string }).status)) return LOCKED;
  const { data: dests, error: destErr } = await svc.from("post_destinations").select("status").eq("user_id", ctx.ownerId).eq("post_id", postId);
  if (destErr && !isMissingTableError(destErr)) return "SOCIA couldn't check this post just now. Try again.";
  const live = ((dests ?? []) as { status: string }[]).some((d) => ["scheduled", "uploading", "processing", "published"].includes(d.status));
  if (live) return LOCKED;
  return null;
}

// --------------------------------------------------------------- the lists

/** One row of the Calendar's approvals tab. */
export type ApprovalItem = {
  id: string;
  postId: string;
  status: ApprovalStatus;
  title: string;
  excerpt: string;
  thumb: string | null;
  platforms: string[];
  requestedAt: string | null;
  submittedAt: string;
  submittedBy: string | null;
  submitNote: string | null;
  reviewNote: string | null;
  decidedAt: string | null;
  scheduledFor: string | null;
  hasYouTube: boolean;
};

/** The queue (approvers) or the person's own latest rounds (members), with each post's preview. */
export async function approvalItems(svc: Supa, ownerId: string, workspaceId: string | null, view: { role: "approve" } | { role: "submit"; viewerId: string }): Promise<ApprovalItem[]> {
  const rounds = view.role === "approve"
    ? await listApprovals(svc, ownerId, workspaceId, { status: ["pending"] })
    : await listApprovals(svc, ownerId, workspaceId, { submittedBy: view.viewerId, sinceDays: 30 });
  // A member sees each post once, at its latest round.
  const seen = new Set<string>();
  const latest = rounds.filter((r) => (seen.has(r.postId) ? false : (seen.add(r.postId), true)));
  if (!latest.length) return [];
  const ids = latest.map((r) => r.postId);
  const [{ data: posts }, { data: dests }, emails] = await Promise.all([
    svc.from("scheduled_posts").select("id, caption, media, media_url, media_type").eq("user_id", ownerId).in("id", ids),
    svc.from("post_destinations").select("post_id, platform, status, settings").eq("user_id", ownerId).in("post_id", ids),
    memberEmails(svc, workspaceId),
  ]);
  const byPost = new Map(((posts ?? []) as { id: string; caption: string | null; media: { kind?: string; url?: string | null }[] | null; media_url: string | null; media_type: string | null }[]).map((p) => [p.id, p]));
  const NAME: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };
  return latest.map((r) => {
    const p = byPost.get(r.postId);
    const caption = (p?.caption ?? "").trim();
    const title = displayTitle(caption);
    const firstImage = (p?.media ?? []).find((m) => m.kind === "image" && m.url)?.url ?? (p?.media_type === "IMAGE" ? p?.media_url ?? null : null);
    const ds = ((dests ?? []) as { post_id: string; platform: string; status: string; settings?: unknown }[]).filter((d) => d.post_id === r.postId && d.status !== "cancelled");
    return {
      id: r.id, postId: r.postId, status: r.status,
      title: title === "(no caption)" ? postLabel(null, ds) ?? "Untitled post" : title,
      // The caption after its first line (the first line is the title).
      excerpt: (() => { const rest = caption.split("\n").slice(1).join("\n").trim(); return rest.length > 220 ? `${rest.slice(0, 219)}…` : rest; })(),
      thumb: firstImage, platforms: Array.from(new Set(ds.map((d) => NAME[d.platform] ?? d.platform))),
      requestedAt: r.requestedAt, submittedAt: r.submittedAt, submittedBy: emails.get(r.submittedBy) ?? null,
      submitNote: r.submitNote, reviewNote: r.reviewNote, decidedAt: r.decidedAt, scheduledFor: r.scheduledFor,
      hasYouTube: ds.some((d) => d.platform === "youtube"),
    };
  });
}
