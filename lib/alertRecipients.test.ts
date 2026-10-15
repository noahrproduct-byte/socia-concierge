import { describe, it, expect, vi } from "vitest";

// A query recorder: which filters getAlerts puts on alert_events.
function recorder(opts: { recipientsColumn: boolean }) {
  const calls: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "update", "in"]) q[m] = (...a: unknown[]) => { if (m === "select" && String(a[0]).includes("recipient_id") && !opts.recipientsColumn) (q as { __missing?: boolean }).__missing = true; return q; };
  q.or = (s: string) => { calls.push(`or:${s}`); return q; };
  q.is = (k: string, v: unknown) => { calls.push(`is:${k}=${v}`); return q; };
  q.then = (res: (v: unknown) => void) => res((q as { __missing?: boolean }).__missing ? { data: null, error: { message: "column alert_events.recipient_id does not exist" } } : { data: [], error: null, count: 0 });
  return { client: { from: () => { (q as { __missing?: boolean }).__missing = false; return q; } } as never, calls };
}

describe("who sees an alert", () => {
  it("shows a person the workspace's alerts plus the ones addressed to them", async () => {
    const { getAlerts } = await import("./alerts");
    const r = recorder({ recipientsColumn: true });
    await getAlerts(r.client, "owner", 20, "ws", "member-1");
    expect(r.calls).toContain("or:workspace_id.is.null,workspace_id.eq.ws");
    expect(r.calls).toContain("or:recipient_id.is.null,recipient_id.eq.member-1");
  });
  it("shows only workspace-wide alerts when no viewer is named", async () => {
    const { getAlerts } = await import("./alerts");
    const r = recorder({ recipientsColumn: true });
    await getAlerts(r.client, "owner", 20, "ws");
    expect(r.calls).toContain("is:recipient_id=null");
  });
  it("keeps the bell working unchanged before approvals.sql has run", async () => {
    vi.resetModules();
    const { getAlerts } = await import("./alerts");
    const r = recorder({ recipientsColumn: false });
    await getAlerts(r.client, "owner", 20, "ws", "member-1");
    expect(r.calls.filter((c) => c.includes("recipient_id"))).toEqual([]);
  });
});
