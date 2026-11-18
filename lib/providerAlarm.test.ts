import { describe, expect, it, vi, beforeEach } from "vitest";

const recorded: unknown[] = [];
vi.mock("./supabase/service", () => ({
  createServiceClient: () => ({
    auth: { admin: { listUsers: async () => ({ data: { users: [{ id: "admin-1", email: "boss@example.com" }, { id: "u2", email: "someone@example.com" }] }, error: null }) } },
  }),
}));
vi.mock("./alerts", () => ({ recordAlerts: async (_svc: unknown, owner: unknown, c: unknown[]) => { recorded.push({ owner, c }); return 1; } }));

import { adminEmails, isAnthropicNoCredit, providerAlarmFingerprint, raiseProviderAlarm, watchedAnthropicFetch } from "./providerAlarm";

describe("provider balance alarm", () => {
  beforeEach(() => { recorded.length = 0; process.env.ADMIN_EMAILS = "Boss@example.com"; vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("recognises Anthropic's empty credit answer and nothing else", () => {
    expect(isAnthropicNoCredit(400, '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}')).toBe(true);
    expect(isAnthropicNoCredit(400, '{"error":{"message":"max_tokens: too large"}}')).toBe(false);
    expect(isAnthropicNoCredit(500, "credit balance")).toBe(false);
  });

  it("keys one alert per service per day and reads the admins' emails", () => {
    expect(providerAlarmFingerprint("higgsfield", new Date("2026-11-17T23:00:00Z"))).toBe("provider-empty:higgsfield:2026-11-17");
    expect(adminEmails(" A@x.com, ,b@y.com ")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("alerts only the admins, linked to the spend page, and waits ten minutes before trying again", async () => {
    const t = new Date("2026-11-17T10:00:00Z");
    raiseProviderAlarm("higgsfield", "insufficient balance", t);
    await vi.waitFor(() => expect(recorded).toHaveLength(1));
    expect(recorded[0]).toMatchObject({ owner: { userId: "admin-1", workspaceId: null }, c: [{ type: "provider", platform: "higgsfield", severity: "warning", entityRef: "/admin/spend" }] });
    raiseProviderAlarm("higgsfield", "again", new Date(t.getTime() + 60_000));
    await new Promise((r) => setTimeout(r, 20));
    expect(recorded).toHaveLength(1);
  });

  it("passes Claude's answer through untouched and raises the alarm on an empty balance", async () => {
    const body = '{"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}';
    const f = watchedAnthropicFetch((async () => new Response(body, { status: 400 })) as unknown as typeof fetch);
    const res = await f("https://api.anthropic.com/v1/messages");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(body);
    await vi.waitFor(() => expect(recorded.some((r) => (r as { c: { platform: string }[] }).c[0].platform === "anthropic")).toBe(true));
  });
});
