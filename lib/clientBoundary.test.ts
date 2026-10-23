// No browser bundle may pull in server code. Walks the import graph of every
// "use client" file (relative and "@/" imports) and fails when it reaches a
// module that reads a server-only secret or creates the service-role client.
// (Next would leave such env vars undefined in the browser, so the danger is
// shipping server logic and failing at runtime, as lib/anthropic once did.)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SERVER_MARK = /process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b)[A-Z_]+|createServiceClient\(|from "node:|from "next\/headers"/;

// Shared modules that mention server env vars without exposing them, and why.
const ALLOWED = new Set([
  "lib/plans.ts", // checkoutAvailable() reads only whether Stripe vars are set; the server calls it and passes a boolean down
]);

function walk(d: string, out: string[]) {
  for (const n of readdirSync(join(ROOT, d))) {
    const p = join(d, n);
    if (statSync(join(ROOT, p)).isDirectory()) { if (n !== "node_modules") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? join(ROOT, dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
  }
  return null;
}

/** Imports that end up in the bundle (type-only imports are erased). */
function imports(file: string): string[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  const specs = [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
  return specs.map((s) => resolve(file, s)).filter((x): x is string => Boolean(x));
}

describe("the client/server boundary", () => {
  it("no client component reaches server-only code", () => {
    const files: string[] = [];
    walk("app", files); walk("components", files); walk("lib", files);
    const clients = files.filter((f) => /^\s*["']use client["']/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(clients.length).toBeGreaterThan(50);
    const leaks: string[] = [];
    for (const c of clients) {
      const seen = new Set<string>([c]);
      const stack: { f: string; path: string[] }[] = [{ f: c, path: [c] }];
      while (stack.length) {
        const { f, path } = stack.pop()!;
        for (const dep of imports(f)) {
          if (seen.has(dep)) continue;
          seen.add(dep);
          const src = readFileSync(join(ROOT, dep), "utf8");
          if (!ALLOWED.has(dep) && SERVER_MARK.test(src)) { leaks.push([...path, dep].join(" -> ")); continue; }
          stack.push({ f: dep, path: [...path, dep] });
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
