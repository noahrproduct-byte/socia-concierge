// An AI action's hourly limit and monthly AI ceiling belong to the account
// that pays for it: the workspace owner. Keyed by the person asking, every
// invited Admin or Member would bring a fresh allowance and the ceiling would
// be read from their own plan instead of the owner's. This scans every
// perUserLimit call on an AI bucket and fails on one not keyed by the owner.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/oauth/runtime", () => ({ rateHit: async () => "ok" }));
vi.mock("@/lib/aiSpend", () => ({ aiBudgetDenied: async () => null }));
const { AI_BUCKETS } = await import("./rateLimit");

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(process.cwd(), dir))) {
    const p = join(dir, n);
    if (statSync(join(process.cwd(), p)).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

describe("AI rate limits are the owner's", () => {
  it("every perUserLimit call on an AI bucket is keyed by the owner", () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const f of [...files("app"), ...files("lib")]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/perUserLimit\(\s*([^,]+?)\s*,\s*"([^"]+)"/g)) {
        if (!AI_BUCKETS.has(m[2])) continue;
        seen++;
        if (!/ownerId\b/.test(m[1])) wrong.push(`${f}: ${m[2]} keyed by ${m[1]}`);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(wrong).toEqual([]);
  });
});
