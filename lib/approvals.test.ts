import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory stand-in for the three tables approvals touch.
type Rec = Record<string, unknown>;
const db: { post_approvals: Rec[]; post_destinations: Rec[]; scheduled_posts: Rec[] } = { post_approvals: [], post_destinations: [], scheduled_posts: [] };
const alerts: Rec[][] = [];
let members: { userId: string; role: "admin" | "member"; email: string | null; createdAt: null }[] = [];

function table(name: keyof typeof db) {
  const filters: ((r: Rec) => boolean)[] = [];
  let patch: Rec | null = null;
  let limit = Infinity;
  const q: Record<string, unknown> = {};
  const rows = () => db[name].filter((r) => filters.every((f) => f(r)));
  const done = () => {
    if (patch) { const hit = rows(); for (const r of hit) Object.assign(r, patch); return { data: hit.map((r) => ({ ...r })), error: null }; }
    return { data: rows().slice(0, limit).map((r) => ({ ...r })), error: null };
  };
  Object.assign(q, {
    select: () => q,
    update: (p: Rec) => { patch = p; return q; },
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
    in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return q; },
    gte: () => q,
    order: () => q,
    limit: (n: number) => { limit = n; return q; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => void) => res(done()),
  });
  return q;
}
const svc = { from: (name: keyof typeof db) => table(name) };

vi.mock("./supabase/service", () => ({ createServiceClient: () => svc }));
vi.mock("./team", () => ({ listMembers: async () => members }));
vi.mock("./alerts", () => ({ recordAlerts: async (_svc: unknown, _owner: unknown, list: Rec[]) => { alerts.push(list); return list.length; } }));

const { approvalRole, approveOnSchedule, memberEditBlock, notifyApprovers, notifySubmitter } = await import("./approvals");

const ctx = (role: "owner" | "admin" | "member", viewerId = role === "owner" ? "owner" : `${role}-1`) =>
  ({ viewerId, ownerId: "owner", workspace: { id: "ws" }, role, client: svc, isOwner: role === "owner" }) as never;
const round = (over: Rec = {}): Rec => ({
  id: "ap-1", post_id: "p1", workspace_id: "ws", user_id: "owner", submitted_by: "member-1", submitted_at: "2026-10-15T10:00:00Z",
  requested_at: null, submit_note: null, status: "pending", decided_by: null, decided_at: null, review_note: null, scheduled_for: null, ...over,
});

beforeEach(() => {
  db.post_approvals = [];
  db.post_destinations = [];
  db.scheduled_posts = [{ id: "p1", user_id: "owner", caption: "Fall menu drop\n\n#coffee" }];
  alerts.length = 0;
  members = [
    { userId: "member-1", role: "member", email: "mia@example.com", createdAt: null },
    { userId: "admin-1", role: "admin", email: "ali@example.com", createdAt: null },
    { userId: "member-2", role: "member", email: "max@example.com", createdAt: null },
  ];
});

describe("who does what", () => {
  it("lets Members submit and the owner and Admins approve, only on a plan with approvals", () => {
    expect(approvalRole({ role: "member" }, true)).toBe("submit");
    expect(approvalRole({ role: "admin" }, true)).toBe("approve");
    expect(approvalRole({ role: "owner" }, true)).toBe("approve");
    expect(approvalRole({ role: "member" }, false)).toBeNull();
  });
});

describe("notifications", () => {
  it("tells the owner and every Admin, not the submitter or other Members", async () => {
    await notifyApprovers(svc as never, {
      id: "ap-1", postId: "p1", workspaceId: "ws", ownerId: "owner", submittedBy: "member-1", submittedAt: "", requestedAt: null,
      submitNote: "For Friday's special", status: "pending", decidedBy: null, decidedAt: null, reviewNote: null, scheduledFor: null,
    });
    const sent = alerts[0];
    expect(sent.map((a) => a.recipientId).sort()).toEqual(["admin-1", "owner"]);
    expect(sent[0]).toMatchObject({ type: "approval", title: "Waiting for approval: “Fall menu drop”", entityRef: "/calendar?view=approvals" });
    expect(String(sent[0].body)).toContain("mia@example.com submitted it: “For Friday's special”");
  });

  it("tells the submitter the outcome, with the reviewer's note when sent back", async () => {
    const base = { id: "ap-1", postId: "p1", workspaceId: "ws", ownerId: "owner", submittedBy: "member-1", submittedAt: "", requestedAt: null, submitNote: null, decidedBy: "owner", decidedAt: "", scheduledFor: null };
    await notifySubmitter(svc as never, { ...base, status: "changes_requested", reviewNote: "Use the new logo" });
    await notifySubmitter(svc as never, { ...base, status: "approved", reviewNote: null });
    await notifySubmitter(svc as never, { ...base, status: "withdrawn", reviewNote: null });
    expect(alerts).toHaveLength(2);
    expect(alerts[0][0]).toMatchObject({ recipientId: "member-1", severity: "warning", title: "Sent back: “Fall menu drop”", entityRef: "/create?post=p1" });
    expect(String(alerts[0][0].body)).toContain("“Use the new logo”");
    expect(alerts[1][0]).toMatchObject({ recipientId: "member-1", severity: "good", title: "Approved: “Fall menu drop”" });
  });
});

describe("approving by scheduling", () => {
  it("closes the waiting round when the owner or an Admin schedules the post, and tells the member", async () => {
    db.post_approvals = [round()];
    await approveOnSchedule(ctx("admin"), "p1", "2026-10-17T18:00:00.000Z");
    expect(db.post_approvals[0]).toMatchObject({ status: "approved", decided_by: "admin-1", scheduled_for: "2026-10-17T18:00:00.000Z" });
    expect(alerts[0][0]).toMatchObject({ recipientId: "member-1", title: "Approved: “Fall menu drop”" });
  });

  it("does nothing for a Member, or when nothing is waiting", async () => {
    db.post_approvals = [round()];
    await approveOnSchedule(ctx("member"), "p1", null);
    expect(db.post_approvals[0].status).toBe("pending");
    db.post_approvals = [round({ status: "changes_requested" })];
    await approveOnSchedule(ctx("owner"), "p1", null);
    expect(db.post_approvals[0].status).toBe("changes_requested");
    expect(alerts).toHaveLength(0);
  });
});

describe("what a Member may change", () => {
  it("blocks editing while it waits for approval, and once it is scheduled or published", async () => {
    expect(await memberEditBlock(ctx("member"), "p1")).toBeNull();
    db.post_approvals = [round()];
    expect(await memberEditBlock(ctx("member"), "p1")).toContain("waiting for approval");
    db.post_approvals = [round({ status: "changes_requested" })];
    expect(await memberEditBlock(ctx("member"), "p1")).toBeNull();
    db.post_destinations = [{ post_id: "p1", user_id: "owner", status: "scheduled" }];
    expect(await memberEditBlock(ctx("member"), "p1")).toContain("only be changed by the owner or an admin");
  });
  it("never blocks the owner or an Admin", async () => {
    db.post_approvals = [round()];
    db.post_destinations = [{ post_id: "p1", user_id: "owner", status: "scheduled" }];
    expect(await memberEditBlock(ctx("owner"), "p1")).toBeNull();
    expect(await memberEditBlock(ctx("admin"), "p1")).toBeNull();
  });
});
