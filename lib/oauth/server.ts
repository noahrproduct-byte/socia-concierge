// SOCIA's OAuth 2.1 authorization server: the flows, independent of HTTP and
// of the database (lib/oauth/store.ts), so every rule is unit-tested.
//
//   authorize   validate the app's request; problems with the app or its
//               redirect are shown on SOCIA's page and never redirected
//   decide      the person allowed or denied on the consent screen
//   token       authorization_code (+ PKCE S256) and refresh_token (rotated
//               on every use; a replaced refresh token presented again
//               revokes every token of that connection)
//   verify      an access token at the MCP endpoint
//   revoke      RFC 7009
import { randomUUID } from "node:crypto";
import {
  ACCESS_PREFIX, ACCESS_TTL_S, CIMD_TTL_S, CODE_PREFIX, CODE_TTL_S, CONNECTION_SCOPES, GRANTABLE_SCOPES, IGNORED_SCOPES, REFRESH_PREFIX, REFRESH_TTL_S,
  REQUEST_TTL_S, SCOPE_DRAFTS, SCOPE_PUBLISH, SCOPE_READ, SUPPORTED_SCOPES, isOurResource, issuer,
} from "./config";
import { fetchClientMetadata, isCimdClientId, redirectMatches, type FetchDeps } from "./clients";
import { CHALLENGE_RE, hashToken, newToken, verifyPkce } from "./tokens";
import type { ClientRec, ConnectionRec, OAuthStore } from "./store";

const iso = (ms: number) => new Date(ms).toISOString();
const later = (now: Date, s: number) => iso(now.getTime() + s * 1000);
const expired = (at: string, now: Date) => new Date(at).getTime() <= now.getTime();

/** A URL with OAuth response parameters added (existing query kept). */
export function redirectWith(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// ------------------------------------------------------------------ clients

export async function resolveClient(store: OAuthStore, clientId: string, now: Date, deps?: FetchDeps): Promise<{ ok: true; client: ClientRec } | { ok: false; reason: string }> {
  if (isCimdClientId(clientId)) {
    const cached = await store.getClient(clientId);
    if (cached?.kind === "cimd" && cached.fetchedAt && now.getTime() - new Date(cached.fetchedAt).getTime() < CIMD_TTL_S * 1000) return { ok: true, client: cached };
    const fetched = await fetchClientMetadata(clientId, deps);
    if (!fetched.ok) return { ok: false, reason: fetched.reason };
    const client: ClientRec = { clientId, kind: "cimd", ...fetched.metadata, fetchedAt: now.toISOString() };
    await store.putClient(client);
    return { ok: true, client };
  }
  const client = await store.getClient(clientId);
  if (!client || client.kind !== "dcr") return { ok: false, reason: "This app isn't registered with SOCIA. Remove the connection in the app and add it again." };
  return { ok: true, client };
}

// ---------------------------------------------------------------- authorize

export type AuthorizeResult =
  | { kind: "error_page"; message: string }
  | { kind: "redirect"; url: string }
  | { kind: "ok"; client: ClientRec; redirectUri: string; codeChallenge: string; state: string | null; scopes: string[]; askedToPublish: boolean; resource: string | null };

export async function validateAuthorize(store: OAuthStore, params: Record<string, string | undefined>, now: Date, deps?: FetchDeps): Promise<AuthorizeResult> {
  const clientId = params.client_id?.trim();
  if (!clientId) return { kind: "error_page", message: "The app didn't say who it is (no client_id)." };
  const resolved = await resolveClient(store, clientId, now, deps);
  if (!resolved.ok) return { kind: "error_page", message: resolved.reason };
  const client = resolved.client;
  const redirectUri = params.redirect_uri?.trim();
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
    return { kind: "error_page", message: "The app asked SOCIA to send you to an address it didn't register, so SOCIA stopped here." };
  }

  // From here on, errors go back to the app.
  const state = params.state ?? null;
  const back = (error: string, description: string): AuthorizeResult => ({
    kind: "redirect", url: redirectWith(redirectUri, { error, error_description: description, state, iss: issuer() }),
  });
  if (params.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  if (params.code_challenge_method !== "S256" || !params.code_challenge || !CHALLENGE_RE.test(params.code_challenge)) {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const resource = params.resource?.trim() || null;
  if (!isOurResource(resource)) return back("invalid_target", "This server only issues tokens for its own MCP endpoint.");

  const requested = (params.scope ?? "").split(/\s+/).filter(Boolean).filter((s) => !IGNORED_SCOPES.includes(s));
  const unknown = requested.filter((s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s));
  if (unknown.length) return back("invalid_scope", `Unknown scope: ${unknown.join(" ")}.`);
  const granted = requested.filter((s) => GRANTABLE_SCOPES.includes(s));
  return {
    kind: "ok", client, redirectUri, codeChallenge: params.code_challenge, state,
    scopes: granted.length ? granted : [SCOPE_READ], askedToPublish: requested.includes(SCOPE_PUBLISH) || requested.includes(SCOPE_DRAFTS), resource,
  };
}

export async function createConsentRequest(store: OAuthStore, userId: string, a: Extract<AuthorizeResult, { kind: "ok" }>, now: Date): Promise<string> {
  return store.createRequest({
    userId, clientId: a.client.clientId, redirectUri: a.redirectUri, codeChallenge: a.codeChallenge, state: a.state,
    scopes: a.scopes, resource: a.resource, expiresAt: later(now, REQUEST_TTL_S),
  });
}

// ------------------------------------------------------------------- decide

export type DecideInput = {
  requestId: string;
  userId: string;
  allow: boolean;
  workspaceIds: string[];
  /** The person ticked "also let it create, schedule and publish posts". */
  allowPublish?: boolean;
  /** The workspaces this person can open right now (owned or invited). */
  accessibleWorkspaceIds: string[];
};

/** Why a consent answer couldn't be used; the page maps each to its own words. */
export type DecideError = "not_found" | "answered" | "expired" | "no_workspace" | "workspace_not_allowed";

export const DECIDE_MESSAGES: Record<DecideError, string> = {
  not_found: "This connection request wasn't found. Start again from the app.",
  answered: "This connection request was already answered. Start again from the app.",
  expired: "This connection request expired. Start again from the app.",
  no_workspace: "Choose at least one Brand Workspace.",
  workspace_not_allowed: "You can only share Brand Workspaces you have access to.",
};

export async function decide(store: OAuthStore, input: DecideInput, now: Date): Promise<{ ok: true; url: string; connection: ConnectionRec | null } | { ok: false; code: DecideError; message: string }> {
  const no = (code: DecideError) => ({ ok: false as const, code, message: DECIDE_MESSAGES[code] });
  const req = await store.getRequest(input.requestId);
  if (!req || req.userId !== input.userId) return no("not_found");
  if (req.usedAt) return no("answered");
  if (expired(req.expiresAt, now)) return no("expired");
  const state = req.state;
  if (input.allow) {
    const chosen = Array.from(new Set(input.workspaceIds));
    if (!chosen.length) return no("no_workspace");
    if (chosen.some((w) => !input.accessibleWorkspaceIds.includes(w))) return no("workspace_not_allowed");
  }
  if (!(await store.useRequest(req.id, now.toISOString()))) return no("answered");
  if (!input.allow) {
    return { ok: true, url: redirectWith(req.redirectUri, { error: "access_denied", error_description: "The person declined.", state, iss: issuer() }), connection: null };
  }
  const client = await store.getClient(req.clientId);
  // Publishing is the person's choice on the consent screen, whatever the app asked for.
  const scopes = input.allowPublish ? Array.from(new Set([...req.scopes, SCOPE_PUBLISH])) : req.scopes.filter((s) => s !== SCOPE_PUBLISH);
  const connection = await store.upsertConnection({
    userId: input.userId, clientId: req.clientId, clientName: client?.clientName ?? null, scopes,
    workspaceIds: Array.from(new Set(input.workspaceIds)), now: now.toISOString(),
  });
  const code = newToken(CODE_PREFIX);
  await store.createCode({
    codeHash: hashToken(code), connectionId: connection.id, clientId: req.clientId, redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge, resource: req.resource, scopes, expiresAt: later(now, CODE_TTL_S),
  });
  return { ok: true, url: redirectWith(req.redirectUri, { code, state, iss: issuer() }), connection };
}

// -------------------------------------------------------------------- token

export type TokenResponse = { status: number; body: Record<string, unknown> };

const oauthError = (status: number, error: string, description: string): TokenResponse => ({ status, body: { error, error_description: description } });

async function issue(store: OAuthStore, connectionId: string, scopes: string[], now: Date, refreshId: string = randomUUID()): Promise<TokenResponse> {
  const access = newToken(ACCESS_PREFIX);
  const refresh = newToken(REFRESH_PREFIX);
  await store.insertTokens([
    { id: randomUUID(), connectionId, kind: "access", tokenHash: hashToken(access), scopes, expiresAt: later(now, ACCESS_TTL_S) },
    { id: refreshId, connectionId, kind: "refresh", tokenHash: hashToken(refresh), scopes, expiresAt: later(now, REFRESH_TTL_S) },
  ]);
  return { status: 200, body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") } };
}

export async function token(store: OAuthStore, form: URLSearchParams, now: Date): Promise<TokenResponse> {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id");
  if (grant === "authorization_code") {
    const code = form.get("code");
    const redirectUri = form.get("redirect_uri");
    if (!code || !redirectUri || !clientId) return oauthError(400, "invalid_request", "code, redirect_uri and client_id are required.");
    const used = await store.useCode(hashToken(code), now.toISOString());
    if (!used.rec) return oauthError(400, "invalid_grant", "The authorization code is invalid.");
    if (used.alreadyUsed) {
      // A code presented twice: whatever was issued from it is no longer trusted.
      await store.revokeConnectionTokens(used.rec.connectionId, now.toISOString());
      return oauthError(400, "invalid_grant", "The authorization code was already used.");
    }
    const c = used.rec;
    if (c.clientId !== clientId) return oauthError(400, "invalid_grant", "The code was issued to a different client.");
    if (c.redirectUri !== redirectUri) return oauthError(400, "invalid_grant", "redirect_uri doesn't match the authorization request.");
    if (expired(c.expiresAt, now)) return oauthError(400, "invalid_grant", "The authorization code expired.");
    if (!verifyPkce(form.get("code_verifier"), c.codeChallenge)) return oauthError(400, "invalid_grant", "PKCE verification failed.");
    const resource = form.get("resource");
    if (!isOurResource(resource)) return oauthError(400, "invalid_target", "This server only issues tokens for its own MCP endpoint.");
    const conn = await store.getConnection(c.connectionId);
    if (!conn || conn.revokedAt) return oauthError(400, "invalid_grant", "This connection was disconnected.");
    return issue(store, conn.id, c.scopes.filter((s) => conn.scopes.includes(s)), now);
  }

  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token");
    if (!refresh || !clientId) return oauthError(400, "invalid_request", "refresh_token and client_id are required.");
    const t = await store.findToken(hashToken(refresh));
    if (!t || t.kind !== "refresh") return oauthError(400, "invalid_grant", "The refresh token is invalid.");
    const conn = await store.getConnection(t.connectionId);
    if (!conn || conn.revokedAt) return oauthError(400, "invalid_grant", "This connection was disconnected.");
    if (conn.clientId !== clientId) return oauthError(400, "invalid_grant", "The refresh token was issued to a different client.");
    if (t.revokedAt) {
      if (t.replacedBy) {
        // A refresh token that was already exchanged: treat it as stolen.
        await store.revokeConnectionTokens(conn.id, now.toISOString());
        return oauthError(400, "invalid_grant", "The refresh token was already used; this connection's tokens were revoked. Connect the app again.");
      }
      return oauthError(400, "invalid_grant", "The refresh token was revoked.");
    }
    if (expired(t.expiresAt, now)) return oauthError(400, "invalid_grant", "The refresh token expired. Connect the app again.");
    const asked = (form.get("scope") ?? "").split(/\s+/).filter(Boolean);
    if (asked.some((s) => !t.scopes.includes(s))) return oauthError(400, "invalid_scope", "A refresh can't add scopes.");
    const scopes = (asked.length ? asked : t.scopes).filter((s) => conn.scopes.includes(s));
    const nextId = randomUUID();
    if (!(await store.replaceToken(t.id, nextId, now.toISOString()))) return oauthError(400, "invalid_grant", "The refresh token was just used. Try again.");
    return issue(store, conn.id, scopes, now, nextId);
  }

  return oauthError(400, "unsupported_grant_type", "Supported: authorization_code, refresh_token.");
}

// ------------------------------------------------------------ verify/revoke

/** Who an access token speaks for, and what it may touch. */
export type Principal = {
  userId: string;
  connectionId: string;
  clientId: string;
  clientName: string | null;
  scopes: string[];
  workspaceIds: string[];
  expiresAt: number;
};

const TOUCH_EVERY_MS = 60_000;

export async function verifyAccessToken(store: OAuthStore, accessToken: string | undefined, now: Date): Promise<Principal | null> {
  if (!accessToken || !accessToken.startsWith(ACCESS_PREFIX)) return null;
  const t = await store.findToken(hashToken(accessToken));
  if (!t || t.kind !== "access" || t.revokedAt || expired(t.expiresAt, now)) return null;
  const conn = await store.getConnection(t.connectionId);
  if (!conn || conn.revokedAt) return null;
  if (!conn.lastUsedAt || now.getTime() - new Date(conn.lastUsedAt).getTime() > TOUCH_EVERY_MS) {
    await store.touchConnection(conn.id, now.toISOString()).catch(() => undefined);
  }
  return {
    userId: conn.userId, connectionId: conn.id, clientId: conn.clientId, clientName: conn.clientName,
    // Read access comes from the token; publishing from the connection alone (CONNECTION_SCOPES), so Settings can switch it at once.
    scopes: conn.scopes.filter((s) => t.scopes.includes(s) || CONNECTION_SCOPES.includes(s)), workspaceIds: conn.workspaceIds,
    expiresAt: Math.floor(new Date(t.expiresAt).getTime() / 1000),
  };
}

/** RFC 7009: revoking either token ends every token of that connection. Unknown tokens are not an error. */
export async function revokeToken(store: OAuthStore, tokenValue: string | null, now: Date): Promise<void> {
  if (!tokenValue) return;
  const t = await store.findToken(hashToken(tokenValue));
  if (t) await store.revokeConnectionTokens(t.connectionId, now.toISOString());
}
