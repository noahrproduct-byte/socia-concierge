import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for the few table calls submitSignup makes.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let plan = true;

function query(table: string) {
  const rows = () => (tables[table] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: Row | null = null;
  let head = false;
  let single = false;
  const run = () => {
    if (op === "insert") {
      const row = { id: `id${rows().length + 1}`, ...payload };
      rows().push(row);
      return { data: single ? { id: row.id } : [row], error: null };
    }
    if (op === "upsert") { rows().push({ ...payload }); return { data: null, error: null }; }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") { for (const r of hit) Object.assign(r, payload); return { data: null, error: null }; }
    return head ? { count: hit.length, data: null, error: null } : { data: hit, error: null };
  };
  const q = {
    select: (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return q; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
    limit: () => q,
    single: () => { single = true; return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    insert: (p: Row) => { op = "insert"; payload = p; return q; },
    upsert: (p: Row) => { op = "upsert"; payload = p; return q; },
    then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
  };
  return q;
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: query }) }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async () => ({}), canUseFeature: () => plan }));
vi.mock("@/lib/instagramSync", () => ({ getIgSnapshot: async () => null }));
vi.mock("@/lib/comments", () => ({ fetchInstagramComments: async () => [] }));

const { submitSignup, publicSignupPage } = await import("./server");

const page = { id: "p1", slug: "salvos", title: "Join us", intro: null, button: "Sign up", ask_handle: true, tag: null, active: true, user_id: "owner", workspace_id: null };
const contacts = () => tables.contacts ?? [];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.signup_pages = [{ ...page }];
  plan = true;
});

describe("public sign-ups", () => {
  it("never replaces an email a contact already has", async () => {
    tables.contacts = [{ id: "c1", user_id: "owner", workspace_id: null, platform: "instagram", handle: "realcustomer", email: "real@x.com", tags: [] }];
    expect(await submitSignup("salvos", { email: "attacker@x.com", handle: "@realcustomer", consent: true })).toEqual({ ok: true });
    expect(contacts().find((c) => c.id === "c1")?.email).toBe("real@x.com");
    // The new email is its own contact, without the handle it claimed.
    expect(contacts().find((c) => c.email === "attacker@x.com")).toMatchObject({ handle: null });
  });

  it("joins a commenter who has no email yet", async () => {
    tables.contacts = [{ id: "c1", user_id: "owner", workspace_id: null, platform: "instagram", handle: "mia", email: null, tags: [] }];
    await submitSignup("salvos", { email: "mia@x.com", handle: "mia", consent: true });
    expect(contacts()).toHaveLength(1);
    expect(contacts()[0].email).toBe("mia@x.com");
  });

  it("takes nothing, and shows no page, once the owner's plan no longer includes contacts", async () => {
    plan = false;
    expect(await submitSignup("salvos", { email: "a@x.com", consent: true })).toMatchObject({ ok: false });
    expect(contacts()).toHaveLength(0);
    expect(await publicSignupPage("salvos")).toBeNull();
  });

  it("reads the page by its real address however it is spelled", async () => {
    expect(await submitSignup("SALVOS", { email: "b@x.com", consent: true })).toEqual({ ok: true });
  });
});
