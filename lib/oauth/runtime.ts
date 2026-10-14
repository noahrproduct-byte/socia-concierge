// The OAuth server's and MCP endpoint's shared server plumbing: the store on
// the service role, fixed-window rate limits (socia_rate_hit), the audit log,
// and the response helpers. Server only.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase/service";
import { supabaseStore, type OAuthStore } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export function serviceOrNull(): Supa | null {
  return createServiceClient() as Supa | null;
}

export function oauthStore(): OAuthStore | null {
  const svc = serviceOrNull();
  return svc ? supabaseStore(svc) : null;
}

/** A hash of the caller's address, for rate-limit keys (never stored in the clear). */
export function addressKey(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * One request against a fixed window. "unavailable" when the counter can't be
 * reached (for example before supabase/ai-assistants.sql has run); callers
 * refuse in that case too: a limit that silently stops counting is no limit.
 */
export async function rateHit(key: string, windowSeconds: number, limit: number): Promise<"ok" | "limited" | "unavailable"> {
  const svc = serviceOrNull();
  if (!svc) return "unavailable";
  try {
    const { data, error } = await svc.rpc("socia_rate_hit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
    if (error) throw error;
    return data === true ? "ok" : "limited";
  } catch (e) {
    console.error("[ai] rate limit unavailable:", (e as Error)?.message ?? e);
    return "unavailable";
  }
}

export type AuditEntry = {
  userId?: string | null;
  connectionId?: string | null;
  clientId?: string | null;
  workspaceId?: string | null;
  action: string;
  outcome: "ok" | "denied" | "limited" | "error";
  ms?: number | null;
  detail?: Record<string, unknown> | null;
};

/** Best effort: an audit write never fails the request it describes. */
export async function audit(e: AuditEntry): Promise<void> {
  const svc = serviceOrNull();
  if (!svc) return;
  try {
    await svc.from("ai_audit_log").insert({
      user_id: e.userId ?? null, connection_id: e.connectionId ?? null, client_id: e.clientId ?? null, workspace_id: e.workspaceId ?? null,
      action: e.action, outcome: e.outcome, ms: e.ms ?? null, detail: e.detail ?? null,
    });
  } catch {
    // ignored
  }
}

/** CORS for endpoints AI apps may call from a browser. Bearer tokens only, so no credentials. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS_HEADERS, ...extra },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export const notReady = () => json({ error: "temporarily_unavailable", error_description: "AI assistant connections aren't set up on this server yet." }, 503);
