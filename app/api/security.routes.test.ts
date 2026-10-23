// Every route handler, called with NO signed-in user, no service role, and
// no cron secret or webhook signature, must refuse: 401/403, a 4xx about the
// request, 503 for something not configured, or a redirect to sign-in or an
// error page. A 200 is allowed only for the public endpoints listed below.
// This proves no route forgot its authentication check.

import { describe, it, expect, vi, beforeAll } from "vitest";

// A Supabase client with no session: no user, empty reads, refused writes.
function anonClient() {
  const empty = { data: null, error: { code: "42501", message: "permission denied" }, count: 0 };
  const chain: Record<string, unknown> = {};
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve(empty).then(res);
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(empty);
      return () => proxy;
    },
  };
  const proxy: object = new Proxy(chain, handler);
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      exchangeCodeForSession: async () => ({ data: null, error: { message: "no" } }),
      signOut: async () => ({ error: null }),
    },
    from: () => proxy,
    rpc: () => proxy,
    storage: { from: () => proxy },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => anonClient(),
  getViewer: async () => ({ supabase: anonClient(), user: null }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null, serviceConfigured: () => false }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => undefined }),
  headers: async () => new Headers(),
}));

/** Public by design: discovery documents, the OAuth machine endpoints (which refuse without valid input). */
const PUBLIC_OK = new Set([
  "/.well-known/oauth-authorization-server GET",
  "/.well-known/oauth-protected-resource GET",
  "/.well-known/oauth-protected-resource/mcp GET",
  // A fixed description of the endpoint for Meta's dashboard; no data.
  "/api/meta/deauthorize GET",
  "/api/meta/data-deletion GET",
  // Signed out these answer an empty result ({ profile: null }, { plans: [] }); checked below.
  "/api/profile GET",
  "/api/plans GET",
  // Browsers post CSP violation reports without cookies; it only logs (lib/cspReport.ts).
  "/api/csp-report POST",
]);

const routes: Record<string, () => Promise<unknown>> = (import.meta as unknown as { glob: (p: string[]) => Record<string, () => Promise<unknown>> }).glob(["../**/route.ts", "../../oauth/**/route.ts", "../../mcp/route.ts", "../../auth/**/route.ts", "../../.well-known/**/route.ts"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// Glob keys are relative to this file: "./x/route.ts" is /api/x, "../../oauth/x/route.ts" is /oauth/x.
const pathOf = (file: string) =>
  (file.startsWith("./") ? `/api/${file.slice(2)}` : file.replace(/^(\.\.\/)+/, "/")).replace(/\/route\.ts$/, "");
const params = Promise.resolve(new Proxy({}, { get: () => "00000000-0000-4000-8000-000000000001" }));

type Result = { route: string; status: number; location: string | null; body?: string };
const results: Result[] = [];

beforeAll(async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.STRIPE_WEBHOOK_SECRET;
  for (const [file, load] of Object.entries(routes)) {
    if (file.includes(".test.")) continue;
    let mod: Record<string, unknown>;
    try {
      mod = (await load()) as Record<string, unknown>;
    } catch (e) {
      results.push({ route: `${file} IMPORT`, status: -1, location: String((e as Error).message).slice(0, 200) });
      continue;
    }
    for (const m of METHODS) {
      const fn = mod[m] as ((req: Request, ctx: { params: Promise<unknown> }) => Promise<Response>) | undefined;
      if (typeof fn !== "function") continue;
      const url = `https://sociaos.com${pathOf(file)}?id=x&code=attacker-code&state=x&media_id=x`;
      const init: RequestInit = { method: m, headers: { "content-type": "application/json", origin: "https://evil.example" } };
      if (m !== "GET") init.body = JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", destinationId: "x", action: "send", text: "hi", path: "victim/x.mp4" });
      let res: Response;
      try {
        res = await fn(new Request(url, init), { params });
      } catch (e) {
        // Next's redirect()/notFound() throw; anything else is a crash we want to see.
        const digest = (e as { digest?: string }).digest ?? "";
        if (digest.startsWith("NEXT_REDIRECT")) {
          results.push({ route: `${pathOf(file)} ${m}`, status: 307, location: digest.split(";")[2] ?? null });
        } else if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404") || digest === "NEXT_NOT_FOUND") {
          results.push({ route: `${pathOf(file)} ${m}`, status: 404, location: null });
        } else {
          results.push({ route: `${pathOf(file)} ${m}`, status: -2, location: String((e as Error).message).slice(0, 200) });
        }
        continue;
      }
      const body = res.status === 200 ? await res.clone().text().catch(() => "") : "";
      results.push({ route: `${pathOf(file)} ${m}`, status: res.status, location: res.headers.get("location"), body });
    }
  }
}, 120_000);

describe("every route without a signed-in user", () => {
  it("found the routes", () => {
    expect(results.length).toBeGreaterThan(80);
  });

  it("imports cleanly", () => {
    expect(results.filter((r) => r.status === -1)).toEqual([]);
  });

  it("refuses, or redirects to sign-in or an error, and never answers 200 outside the public list", () => {
    const allowedRedirect = (loc: string | null) => !loc || /\/login|\/settings\?|\/onboarding\?|\/oauth\/error|[?&](ig|fb|yt|tt)=|error=/.test(loc);
    const bad = results.filter((r) => {
      if (r.status === -2) return true; // crashed
      if (r.status >= 200 && r.status < 300) return !PUBLIC_OK.has(r.route);
      if (r.status >= 300 && r.status < 400) return !allowedRedirect(r.location);
      return false;
    });
    expect(bad).toEqual([]);
  });

  it("returns nothing from the routes that answer 200 when signed out", () => {
    expect(results.find((r) => r.route === "/api/profile GET")?.body).toBe(JSON.stringify({ profile: null }));
    expect(results.find((r) => r.route === "/api/plans GET")?.body).toBe(JSON.stringify({ plans: [] }));
  });

  it("refuses the cron jobs, webhooks and connect callbacks without their secret or state", () => {
    const want = (route: string, ok: (r: Result) => boolean) => {
      const r = results.find((x) => x.route === route);
      expect(r, route).toBeTruthy();
      expect(ok(r!), `${route} -> ${r!.status} ${r!.location}`).toBe(true);
    };
    for (const job of ["/api/sync/daily GET", "/api/jobs/weekly-plan GET", "/api/jobs/studio-purge GET"]) want(job, (r) => r.status === 401);
    want("/api/stripe/webhook POST", (r) => r.status === 400 || r.status === 503);
    want("/api/meta/deauthorize POST", (r) => r.status === 400);
    want("/api/meta/data-deletion POST", (r) => r.status === 400);
    // A forged ?code= without this browser's state cookie never reaches the code exchange.
    want("/api/auth/instagram/callback GET", (r) => r.status >= 300 && r.status < 400 && /ig=error/.test(r.location ?? ""));
    want("/api/auth/facebook/callback GET", (r) => r.status >= 300 && r.status < 400 && /fb=error/.test(r.location ?? ""));
    want("/mcp POST", (r) => r.status === 401);
  });
});
