import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deliverable } from "./schema";

// The AI: answers by the schema it was asked for, and remembers each request.
const calls: { params: Record<string, unknown> }[] = [];
let ideaN = 0;
vi.mock("@/lib/anthropic", () => ({
  MODEL: "claude-opus-5-5",
  effortFor: (_m: string, effort = "high") => ({ effort }),
  anthropic: {
    messages: {
      stream: (params: Record<string, unknown>) => ({
        finalMessage: async () => {
          calls.push({ params });
          const schema = (params.output_config as { format: { schema: { properties: Record<string, unknown> } } }).format.schema;
          let answer: unknown;
          if (schema.properties.post) {
            answer = { post: { day: "x", concept: "Full concept", hook: "Opening line", format: "Reel", rationale: "Why", evidence: "", predictedPerformance: "Experiment", title: "Written title", purpose: "p", audience: "a", platform: "Instagram", direction: "d", production: "p", successMetric: "s", experiment: "", beats: [{ label: "Hook", from: 0, to: 3, show: "Face", say: "Hi" }, { label: "End", from: 3, to: 6, show: "Door", say: "Bye" }], maker: "you", reference: "", filmReference: "", filmLike: "", cta: "Follow", editing: "e", ownRefs: [], fromIdea: 0, evidenceSplit: { observed: [], reading: "r", expect: "e", basis: "thin" } } };
          } else if (schema.properties.headline) {
            answer = { headline: "Show the oven more", auditSummary: "Summary", strengths: ["s"], problems: [], topFixes: [{ fix: "f", why: "w", expectedImpact: "i" }], competitorInsights: [] };
          } else {
            ideaN++;
            answer = { title: `Idea ${ideaN}`, pillar: "Craft", description: "What it shows", format: "Reel", template: "counter", hook: "One oven" };
          }
          return { model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 900 }, content: [{ type: "text", text: JSON.stringify(answer) }] };
        },
      }),
    },
  },
}));
vi.mock("@/lib/aiUsage", () => ({ recordAiUsage: () => {} }));
vi.mock("@/lib/planContext", () => ({
  loadPlanContext: async () => ({ brand: null, evidence: null }),
  planMixFor: async (_c: unknown, input: Record<string, unknown>) => ({ ...input, onCamera: 2, animated: 1 }),
}));
const released: number[] = [];
vi.mock("@/lib/planGuard", () => ({ requireUsage: async () => ({ denied: null, usage: { used: 1, limit: 4 }, release: async () => { released.push(1); } }) }));
vi.mock("@/lib/workspaces", () => ({ scopeToWorkspace: (q: unknown) => q }));

// A tiny plans table.
type Row = { id: string; user_id: string; data: Deliverable; created_at: string; client_handle: string | null; niche: string | null; platform: string | null };
let rows: Row[] = [];
function table() {
  let filters: ((r: Row) => boolean)[] = [];
  let patch: Partial<Row> | null = null;
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      if (k === "data->build->>rev") filters.push((r) => String(r.data.build?.rev) === v);
      else filters.push((r) => r[k as keyof Row] === v);
      return q;
    },
    gte: (k: keyof Row, v: string) => { filters.push((r) => String(r[k]) >= v); return q; },
    not: () => { filters.push((r) => Boolean(r.data.build)); return q; },
    order: () => q,
    update: (p: Partial<Row>) => { patch = p; return q; },
    insert: (r: Omit<Row, "id" | "created_at">) => {
      const row = { ...r, id: `00000000-0000-4000-8000-00000000000${rows.length + 1}`, created_at: new Date().toISOString() } as Row;
      rows.push(row);
      return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
    },
    maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) hit.forEach((r) => Object.assign(r, structuredClone(patch)));
      filters = [];
      return Promise.resolve({ data: hit, error: null }).then(res);
    },
  };
  return q;
}
const ctx = { ownerId: "owner-1", viewerId: "owner-1", workspace: null, role: "owner", isOwner: true, client: { from: () => table() } } as never;

import { acceptStep, retryStep, startStepPlan } from "./planStepsServer";

const form = { clientHandle: "@salvos", niche: "Pizza", platform: "Instagram", brandVoice: "", recentPosts: "", competitors: "", goal: "", ideas: "Saturday rush" };

beforeEach(() => { rows = []; calls.length = 0; ideaN = 0; released.length = 0; });

describe("a plan built one day at a time", () => {
  it("writes only the first idea at the start, with the context cached", async () => {
    const { plan } = await startStepPlan(ctx, form);
    const b = plan.data.build!;
    expect(b.slots.map((s) => s.key)).toEqual(["Monday", "Monday (animated)", "Thursday"]);
    expect(b.slots[0]).toMatchObject({ state: "reviewing", idea: { title: "Idea 1", fromIdea: 1 } });
    expect(b.slots.slice(1).every((s) => s.state === "waiting")).toBe(true);
    expect(plan.data.weeklyPlan).toEqual([]);
    expect(calls).toHaveLength(1);
    const p = calls[0].params as { system: { cache_control: unknown }[]; messages: { content: { cache_control?: unknown; text: string }[] }[]; output_config: { effort: string } };
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(p.messages[0].content[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(p.messages[0].content[1].cache_control).toBeUndefined();
    expect(p.messages[0].content[1].text).toContain("Saturday rush");
    expect(p.output_config.effort).toBe("medium");
  });

  it("accepting writes the post in the background and shows the next idea; the last day brings the week's read", async () => {
    const { plan } = await startStepPlan(ctx, form);
    let r = await acceptStep(ctx, plan.id, 0);
    expect(r.plan.data.build!.slots[1]).toMatchObject({ state: "reviewing", idea: { template: "counter", hook: "One oven" } });
    await r.writing;
    let d = rows[0].data;
    expect(d.build!.slots[0].state).toBe("done");
    expect(d.weeklyPlan.map((p) => [p.day, p.title, p.source])).toEqual([["Monday", "Written title", "own"]]);

    r = await acceptStep(ctx, plan.id, 1);
    await r.writing;
    r = await acceptStep(ctx, plan.id, 2);
    await r.writing;
    d = rows[0].data;
    expect(d.build!.status).toBe("done");
    expect(d.build!.audit).toBe("done");
    expect(d.headline).toBe("Show the oven more");
    expect(d.weeklyPlan.map((p) => p.day)).toEqual(["Monday", "Monday (animated)", "Thursday"]);
    expect(d.weeklyPlan[1]).toMatchObject({ animated: true, hook: "One oven", format: "Animated video" });
    // 3 ideas, 2 filmed posts (the animated one needs no call), 1 week read.
    expect(calls).toHaveLength(6);
  });

  it("a day's other ideas stop at two", async () => {
    const { plan } = await startStepPlan(ctx, form);
    await retryStep(ctx, plan.id, 0);
    const after = await retryStep(ctx, plan.id, 0);
    expect(after.data.build!.slots[0].earlier.map((i) => i.title)).toEqual(["Idea 1", "Idea 2"]);
    await expect(retryStep(ctx, plan.id, 0)).rejects.toThrow(/2 other ideas/);
  });

  it("allows two new plans in seven days", async () => {
    await startStepPlan(ctx, form);
    await startStepPlan(ctx, form);
    await expect(startStepPlan(ctx, form)).rejects.toThrow(/started 2 plans this week/);
    expect(released).toEqual([]);
  });
});
