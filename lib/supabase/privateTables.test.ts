import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { PRIVATE_TABLES, withPrivateTables } from "./privateTables";

describe("withPrivateTables", () => {
  const session = { from: vi.fn((t: string) => ({ via: "session", t })), auth: { getUser: vi.fn(async () => "me") }, storage: { from: vi.fn() } };
  const service = { from: vi.fn((t: string) => ({ via: "service", t })) };
  const client = withPrivateTables(session as never, () => service as never) as unknown as typeof session;

  it("reaches token tables through the server role and everything else through the session", () => {
    expect(client.from("instagram_connections")).toEqual({ via: "service", t: "instagram_connections" });
    expect(client.from("facebook_pending_tokens")).toEqual({ via: "service", t: "facebook_pending_tokens" });
    expect(client.from("scheduled_posts")).toEqual({ via: "session", t: "scheduled_posts" });
  });

  it("keeps the session's auth and storage", async () => {
    expect(await client.auth.getUser()).toBe("me");
    expect(client.storage).toBe(session.storage);
  });

  it("falls back to the session (and so fails closed in the database) without a service key", () => {
    const local = withPrivateTables(session as never, () => null) as unknown as typeof session;
    expect(local.from("youtube_connections")).toEqual({ via: "session", t: "youtube_connections" });
  });
});

// Every query on a token table runs with the service role on the request
// path, so each one must say whose rows it means. This scans the code: a
// query with no owner filter within the next lines fails here.
describe("every token-table query names its owner", () => {
  const ROOT = process.cwd();
  // Jobs that run for every account on purpose (service role, cron or a
  // signed Meta callback), and their reason.
  const ALL_ACCOUNTS = new Set([
    "lib/youtubeSnapshots.ts", // daily snapshot job, every channel
    "lib/platformSnapshots.ts", // daily snapshot job, every Page
    "lib/snapshotJob.ts", // daily Instagram snapshot job
    "lib/metaDeletion.ts", // Meta's signed deletion callback, by app-scoped id
  ]);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(join(ROOT, d))) {
      const p = join(d, n);
      if (statSync(join(ROOT, p)).isDirectory()) { if (n !== "node_modules") walk(p); }
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) files.push(p);
    }
  };
  walk("app"); walk("lib"); walk("components");

  it("finds the queries", () => {
    const hits = files.filter((f) => [...PRIVATE_TABLES].some((t) => readFileSync(join(ROOT, f), "utf8").includes(`"${t}"`)));
    expect(hits.length).toBeGreaterThan(20);
  });

  it("filters by the owner (or is a job that runs for every account)", () => {
    const missing: string[] = [];
    for (const f of files) {
      if (ALL_ACCOUNTS.has(f)) continue;
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (![...PRIVATE_TABLES].some((t) => line.includes(`from("${t}")`) || line.includes(`from(\`${t}\`)`))) return;
        // The whole statement: to the first line that ends it (at most 30 lines).
        let end = i;
        while (end < Math.min(lines.length - 1, i + 30) && !/;\s*$/.test(lines[end])) end++;
        // An insert's or upsert's owner is the user_id inside the row it
        // writes, usually built just above; reads, updates and deletes must
        // carry the filter in the statement itself.
        const stmt = lines.slice(i, end + 1).join("\n");
        const window = /\.(upsert|insert)\(/.test(stmt) ? lines.slice(Math.max(0, i - 25), end + 1).join("\n") : stmt;
        if (!/user_id|fb_user_id|ownerId|userId|scope\(|scopeFb\(|connCtx\.ownerId/.test(window)) missing.push(`${f}:${i + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });

  it("is never touched by browser code", () => {
    const client = files.filter((f) => readFileSync(join(ROOT, f), "utf8").trimStart().startsWith('"use client"'));
    const offenders = client.filter((f) => [...PRIVATE_TABLES].some((t) => readFileSync(join(ROOT, f), "utf8").includes(`"${t}"`)));
    expect(offenders).toEqual([]);
  });
});
