// For an invited Admin or Member, ctx.client is the service role, so the
// database does not keep one Brand Workspace's rows away from another's: the
// query has to. This scans every ctx.client query on a table that has a
// workspace_id and fails on one that names no workspace, unless it is listed
// below with the reason it is safe (each was read and checked, 2026-10-23).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKSPACE_TABLES = [
  "alert_events", "audio_media", "comment_drafts", "competitor_snapshots", "discovered_accounts", "discovered_content",
  "discovery_runs", "facebook_connections", "growth_goals", "insights", "instagram_connections", "intelligence_jobs", "onboarding_state", "plans", "platform_deletions", "platform_snapshots", "post_approvals",
  "post_destinations", "scheduled_posts", "studio_builds", "studio_clips", "studio_projects", "tiktok_connections",
  "tracked_competitors", "youtube_connections",
];

/** "file table" -> how many such queries are known safe, and why. */
const SAFE: Record<string, [number, string]> = {
  "app/(app)/discover/page.tsx competitor_snapshots": [1, "owner-wide by design (competitors-workspaces.sql): public counts, read only for handles this workspace shows"],
  "app/api/accounts/route.ts instagram_connections": [3, "owner-wide only on a missing column; the is_active flips run after the target was found in this workspace (is_active is a pointer, reads filter by workspace)"],
  "app/api/auth/facebook/disconnect/route.ts facebook_connections": [1, "owner-wide only without a workspace (never a guest) or on a missing column"],
  "app/api/competitors/route.ts tracked_competitors": [2, "upsert rows carry workspace_id (wsRow); the pooled row only on a constraint mismatch"],
  "app/api/posts/[id]/route.ts scheduled_posts": [1, "delete by id after loadItem refused another workspace's post"],
  "app/api/schedule/publish/route.ts scheduled_posts": [1, "read-back by an id already loaded with the workspace"],
  "app/api/schedule/route.ts post_destinations": [2, "by post_id after the parent post was loaded or updated with the workspace"],
  "app/api/schedule/route.ts scheduled_posts": [2, "inserts without workspace_id only when there is no workspace, or its column is missing"],
  "app/api/studio/builds/[id]/draft/route.ts scheduled_posts": [4, "the build's own post (loadBuildRow is workspace-scoped); inserts without workspace_id only with no workspace or a missing column"],
};

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(process.cwd(), dir))) {
    const p = join(dir, n);
    if (statSync(join(process.cwd(), p)).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

/** Where the call chain that starts at `at` ends (balanced parentheses; a following ".x" continues it). */
function chainEnd(src: string, at: number): number {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0 && !/^\s*\./.test(src.slice(i + 1, i + 40))) return i + 1;
  }
  return src.length;
}

const NAMES_WORKSPACE = /workspace|wsId|cwid|wsCol|wsRow|scope\(/;

/**
 * Whether the query at `at` is limited to a workspace, judged from its
 * structure rather than nearby text: it is the first argument of
 * scopeToWorkspace(...), or the variable it is assigned to is narrowed by
 * workspace in the statements that follow, or the chain itself filters on it.
 */
function scoped(src: string, at: number): boolean {
  const end = chainEnd(src, at);
  if (NAMES_WORKSPACE.test(src.slice(at, end))) return true;
  const before = src.slice(Math.max(0, at - 200), at);
  if (/scopeToWorkspace\(\s*$/.test(before)) return true;
  const v = before.match(/\b(?:let|const)\s+(\w+)\s*=\s*(?:await\s+)?$/)?.[1];
  if (v) {
    const after = src.slice(end, end + 600);
    return new RegExp(`\\b${v}\\s*=\\s*(?:${v}\\.eq\\("workspace_id"|scopeToWorkspace\\(\\s*${v}\\b)|scopeToWorkspace\\(\\s*${v}\\b`).test(after);
  }
  return false;
}

describe("guest queries stay inside the Brand Workspace", () => {
  it("every ctx.client query on a workspace table names the workspace, or is a known safe case", () => {
    const found: Record<string, number> = {};
    for (const f of [...files("app"), ...files("components")]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(/ctx\.client\s*\.from\("([a-z_]+)"\)/g)) {
        if (!WORKSPACE_TABLES.includes(m[1])) continue;
        if (scoped(src, m.index!)) continue;
        const key = `${f} ${m[1]}`;
        found[key] = (found[key] ?? 0) + 1;
      }
    }
    const unexpected = Object.entries(found).filter(([k, n]) => !SAFE[k] || n > SAFE[k][0]).map(([k, n]) => `${k} (${n})`);
    expect(unexpected).toEqual([]);
    // The list stays honest: an entry whose queries were fixed or removed must go.
    const stale = Object.entries(SAFE).filter(([k, [n]]) => (found[k] ?? 0) < n).map(([k]) => k);
    expect(stale).toEqual([]);
  });
});
